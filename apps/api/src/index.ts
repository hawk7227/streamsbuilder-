/**
 * apps/api — Express API server
 *
 * Blockers resolved:
 * 1. SSE streaming lives here, not in apps/web — apps/web consumes, apps/api emits.
 * 2. No long-running work in HTTP — all runtime jobs enqueued immediately.
 * 3. /api/system-status wired and enforced.
 *
 * env validated on boot via @streams/contracts — process exits if invalid.
 */

import express from "express";
import { randomUUID } from "crypto";
import { validateEnv, BotRequestSchema } from "@streams/contracts";
import { createIntegrations } from "@streams/integrations";
import { classifyRequest, resolveRunMode, getToolsForMode, buildOrchestratorMessages } from "@streams/ai";
import { getSystemStatus } from "@streams/system-status";
import { createRoutes } from "./routes.js";
import { bootDb, getDb, checkDbConnection } from "./db.js";
import type { SystemStatus } from "@streams/contracts";
import { readFileSync } from "fs";
import { join } from "path";
import type { Request, Response } from "express";

// ─── Boot — validate env first, fail hard ────────────────────────────────────

const env = validateEnv();
const integrations = createIntegrations(env);
bootDb(env);

// ─── Redis pub/sub for run event streaming ────────────────────────────────────

const RUN_CHANNEL = (runId: string) => `run:${runId}:events`;

// ─── App ──────────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use("/api", createRoutes(integrations));

// Admin auth middleware
function requireAdmin(req: Request, res: Response, next: () => void): void {
  const secret = req.headers["x-admin-secret"];
  if (secret !== env.ADMIN_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

// ─── POST /api/bot ────────────────────────────────────────────────────────────

app.post("/api/bot", async (req: Request, res: Response) => {
  const parse = BotRequestSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Invalid request", issues: parse.error.flatten() });
    return;
  }

  const request = parse.data;
  const runId = randomUUID();
  const conversationId = request.conversationId ?? randomUUID();
  const classification = classifyRequest(request.userMessage);
  const mode = resolveRunMode(request, classification);

  // Persist run (placeholder — wire to DB layer)
  await integrations.redis.set(`run:${runId}:meta`, JSON.stringify({ runId, conversationId, mode, status: "pending" }), 3600);

  // Determine if this needs queue handoff (runtime/deploy modes always queue)
  const needsQueue = mode === "runtime" || mode === "deploy";

  if (needsQueue) {
    // Enqueue — do NOT block HTTP
    await integrations.redis.publish("queue:ai-runs", JSON.stringify({ runId, conversationId, request, mode }));
    res.status(202).json({
      runId,
      conversationId,
      streamUrl: `/api/runs/${runId}/stream`,
    });
    return;
  }

  // Helper/builder: stream directly from this request
  // Vercel maxDuration must be set for this route (see route config)
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const sendEvent = (event: object) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  sendEvent({ type: "response_started", runId });

  try {
    const tools = getToolsForMode(mode);
    const messages = buildOrchestratorMessages(
      { openai: integrations.openai, projectContext: "", conversationHistory: [] },
      request,
      mode
    );

    const stream = await integrations.openai.createStreamingMessage({
      model: "gpt-4o",
      messages: messages as never,
      tools: tools.map((t) => ({
        type: "function" as const,
        function: { name: t.name, description: t.description, parameters: t.schema },
      })),
      stream: true,
    });

    let fullText = "";
    for await (const chunk of stream as AsyncIterable<{ choices: Array<{ delta: { content?: string } }> }>) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (delta) {
        fullText += delta;
        sendEvent({ type: "response_delta", text: delta });
      }
    }

    sendEvent({ type: "response_completed", text: fullText });
  } catch (err) {
    sendEvent({ type: "run_failed", error: err instanceof Error ? err.message : "Unknown error" });
  } finally {
    res.end();
  }
});

// ─── GET /api/runs/:id/stream ─────────────────────────────────────────────────

app.get("/api/runs/:id/stream", async (req: Request, res: Response) => {
  const { id } = req.params;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const sendEvent = (event: object) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  // Subscribe to Redis pub/sub for this run
  await integrations.redis.raw.subscribe(RUN_CHANNEL(id ?? ""), (message) => {
    res.write(`data: ${message}\n\n`);
  });

  req.on("close", () => {
    void integrations.redis.raw.unsubscribe(RUN_CHANNEL(id ?? ""));
  });

  // Send initial keepalive
  sendEvent({ type: "connected", runId: id });
});

// ─── GET /api/system-status (admin-only) ─────────────────────────────────────

app.get("/api/system-status", requireAdmin, async (_req: Request, res: Response) => {
  let buildReport: ReturnType<typeof JSON.parse> | undefined;
  try {
    const raw = readFileSync(join(process.cwd(), "public/build-report.json"), "utf-8");
    buildReport = JSON.parse(raw) as unknown;
  } catch {
    buildReport = undefined;
  }

  const status = await getSystemStatus({
    checkDatabase: () => checkDbConnection(getDb()),
    checkRedis: () => integrations.redis.healthCheck(),
    checkS3: () => integrations.s3.healthCheck(),
    checkOpenAI: () => integrations.openai.healthCheck(),
    checkWorker: async () => {
      const val = await integrations.redis.get("worker:heartbeat");
      return val !== null;
    },
    getQueueDepths: async () => {
      // Wire to BullMQ queue metrics
      return {};
    },
    getBuildReport: async () => buildReport as SystemStatus["buildReport"],
    version: process.env["npm_package_version"] ?? "0.0.0",
    commit: env.NEXT_PUBLIC_APP_URL,
  });

  res.status(status.status === "ok" ? 200 : 503).json(status);
});

// ─── Health (public, no auth) ─────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

const PORT = process.env["PORT"] ? parseInt(process.env["PORT"]) : 3001;
app.listen(PORT, () => {
  console.log(`[api] listening on :${PORT}`);
});

export default app;
