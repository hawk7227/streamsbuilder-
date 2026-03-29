/**
 * packages/integrations
 *
 * All external provider SDK clients.
 * Every client enforces: timeout, retry with exponential backoff, circuit breaker.
 * No raw SDK usage outside this package.
 */

import OpenAI from "openai";
import { S3Client } from "@aws-sdk/client-s3";
import { createClient as createRedisClient } from "redis";
import type { AppEnv } from "@streams/contracts";

// ─── Circuit breaker ──────────────────────────────────────────────────────────

interface BreakerState {
  failures: number;
  lastFailure: number;
  open: boolean;
}

const BREAKER_THRESHOLD = 5;
const BREAKER_RESET_MS = 30_000;

function createBreaker(name: string) {
  const state: BreakerState = { failures: 0, lastFailure: 0, open: false };

  return async function withBreaker<T>(fn: () => Promise<T>): Promise<T> {
    if (state.open) {
      const elapsed = Date.now() - state.lastFailure;
      if (elapsed < BREAKER_RESET_MS) {
        throw new Error(`[breaker:${name}] Circuit open — failing fast`);
      }
      state.open = false;
      state.failures = 0;
    }
    try {
      const result = await fn();
      state.failures = 0;
      return result;
    } catch (err) {
      state.failures += 1;
      state.lastFailure = Date.now();
      if (state.failures >= BREAKER_THRESHOLD) {
        state.open = true;
        console.error(`[breaker:${name}] Circuit opened after ${state.failures} failures`);
      }
      throw err;
    }
  };
}

// ─── Retry with exponential backoff ──────────────────────────────────────────

async function withRetry<T>(
  fn: () => Promise<T>,
  { attempts = 3, baseDelayMs = 200, factor = 2 } = {}
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, baseDelayMs * Math.pow(factor, i)));
      }
    }
  }
  throw lastErr;
}

// ─── Timeout wrapper ──────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`[timeout:${label}] exceeded ${ms}ms`)), ms)
    ),
  ]);
}

// ─── OpenAI client (AI provider) ─────────────────────────────────────────────

export function createOpenAIClient(env: AppEnv) {
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 120_000 });
  const breaker = createBreaker("openai");

  return {
    createMessage: (params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming) =>
      breaker(() =>
        withRetry(() =>
          withTimeout(
            client.chat.completions.create(params) as Promise<OpenAI.Chat.ChatCompletion>,
            120_000,
            "openai.createMessage"
          )
        )
      ),

    createStreamingMessage: (params: OpenAI.Chat.ChatCompletionCreateParamsStreaming) =>
      breaker(() =>
        withTimeout(
          client.chat.completions.create(params) as Promise<AsyncIterable<OpenAI.Chat.ChatCompletionChunk>>,
          300_000,
          "openai.stream"
        )
      ),

    healthCheck: () =>
      breaker(() =>
        withTimeout(
          client.models.list().then(() => true as const),
          5_000,
          "openai.health"
        )
      ),
  };
}

export type OpenAIIntegration = ReturnType<typeof createOpenAIClient>;

// ─── S3 client ────────────────────────────────────────────────────────────────

export function createS3Client(env: AppEnv) {
  const client = new S3Client({
    region: env.S3_REGION,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
    requestHandler: { requestTimeout: 30_000 },
  });
  const breaker = createBreaker("s3");

  return {
    raw: client,
    send: <T>(command: Parameters<typeof client.send>[0]) =>
      breaker(() =>
        withRetry(() =>
          withTimeout(client.send(command) as Promise<T>, 30_000, "s3.send")
        )
      ),
    healthCheck: async () => {
      const { HeadBucketCommand } = await import("@aws-sdk/client-s3");
      return breaker(() =>
        withTimeout(
          client.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET })).then(() => true as const),
          5_000,
          "s3.health"
        )
      );
    },
  };
}

export type S3Integration = ReturnType<typeof createS3Client>;

// ─── Redis client ─────────────────────────────────────────────────────────────

export function createRedis(env: AppEnv) {
  const client = createRedisClient({
    url: env.REDIS_URL,
    socket: { connectTimeout: 5_000, commandTimeout: 5_000 },
  });
  const breaker = createBreaker("redis");

  return {
    raw: client,
    get: (key: string) => breaker(() => withTimeout(client.get(key), 5_000, "redis.get")),
    set: (key: string, value: string, ttlSeconds?: number) =>
      breaker(() =>
        withTimeout(
          ttlSeconds ? client.setEx(key, ttlSeconds, value) : client.set(key, value),
          5_000,
          "redis.set"
        )
      ),
    del: (key: string) => breaker(() => withTimeout(client.del(key), 5_000, "redis.del")),
    publish: (channel: string, message: string) =>
      breaker(() => withTimeout(client.publish(channel, message), 5_000, "redis.publish")),
    subscribe: (channel: string, handler: (message: string) => void) =>
      client.subscribe(channel, handler),
    healthCheck: () =>
      breaker(() => withTimeout(client.ping().then(() => true as const), 3_000, "redis.health")),
  };
}

export type RedisIntegration = ReturnType<typeof createRedis>;

// ─── Integration container ────────────────────────────────────────────────────

export interface Integrations {
  openai: OpenAIIntegration;
  s3: S3Integration;
  redis: RedisIntegration;
}

export function createIntegrations(env: AppEnv): Integrations {
  return {
    openai: createOpenAIClient(env),
    s3: createS3Client(env),
    redis: createRedis(env),
  };
}
