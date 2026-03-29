import { z } from "zod";

// ─── Environment validation — validated on boot, fails hard if missing ───────

export const AppEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  S3_BUCKET: z.string().min(1),
  S3_REGION: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  ADMIN_SECRET: z.string().min(32),
  NEXT_PUBLIC_APP_URL: z.string().url(),
});

export type AppEnv = z.infer<typeof AppEnvSchema>;

export function validateEnv(raw: NodeJS.ProcessEnv = process.env): AppEnv {
  const result = AppEnvSchema.safeParse(raw);
  if (!result.success) {
    console.error("❌ Invalid environment variables:", result.error.flatten());
    process.exit(1);
  }
  return result.data;
}

// ─── Bot API contracts ────────────────────────────────────────────────────────

export const BotRequestSchema = z.object({
  projectId: z.string().uuid(),
  conversationId: z.string().uuid().optional(),
  userMessage: z.string().min(1).max(32_000),
  attachments: z.array(z.string().uuid()).default([]),
  mode: z.enum(["auto", "helper", "builder", "runtime", "deploy"]).default("auto"),
  capabilitiesWanted: z.array(z.string()).default([]),
});
export type BotRequest = z.infer<typeof BotRequestSchema>;

export const BotResponseSchema = z.object({
  runId: z.string().uuid(),
  conversationId: z.string().uuid(),
  streamUrl: z.string(),
});
export type BotResponse = z.infer<typeof BotResponseSchema>;

// ─── Run stream events ────────────────────────────────────────────────────────

export const RunStreamEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("response_started"), runId: z.string().uuid() }),
  z.object({ type: z.literal("phase_changed"), phase: z.string(), label: z.string() }),
  z.object({ type: z.literal("tool_called"), toolName: z.string(), callId: z.string() }),
  z.object({ type: z.literal("tool_result"), toolName: z.string(), callId: z.string(), ok: z.boolean() }),
  z.object({ type: z.literal("queue_job_created"), jobId: z.string(), queue: z.string(), jobType: z.string() }),
  z.object({ type: z.literal("job_progress"), jobId: z.string(), percent: z.number().optional(), message: z.string() }),
  z.object({ type: z.literal("artifact_ready"), artifactType: z.string(), url: z.string() }),
  z.object({ type: z.literal("response_delta"), text: z.string() }),
  z.object({ type: z.literal("response_completed"), text: z.string() }),
  z.object({ type: z.literal("run_failed"), error: z.string() }),
]);
export type RunStreamEvent = z.infer<typeof RunStreamEventSchema>;

// ─── Run / job contracts ──────────────────────────────────────────────────────

export const RunModeSchema = z.enum(["helper", "builder", "runtime", "deploy"]);
export type RunMode = z.infer<typeof RunModeSchema>;
export type RunStatus = z.infer<typeof RunStatusSchema>;
export const RunStatusSchema = z.enum(["pending", "running", "completed", "failed", "cancelled"]);

export const CreateRunSchema = z.object({
  projectId: z.string().uuid(),
  conversationId: z.string().uuid(),
  messageId: z.string().uuid(),
  mode: RunModeSchema,
  model: z.string(),
});
export type CreateRun = z.infer<typeof CreateRunSchema>;

// ─── Tool contracts ───────────────────────────────────────────────────────────

export const ToolSideEffectLevelSchema = z.enum(["read", "write", "execute", "deploy"]);

export const ToolDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  schema: z.record(z.unknown()),
  modeAllowlist: z.array(RunModeSchema),
  sideEffectLevel: ToolSideEffectLevelSchema,
  timeoutMs: z.number().int().positive(),
  queueRequired: z.boolean(),
  auditRequired: z.boolean(),
});
export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;

// ─── File contracts ───────────────────────────────────────────────────────────

export const FileUploadSchema = z.object({
  projectId: z.string().uuid(),
  filename: z.string().min(1).max(255),
  mimeType: z.string(),
  sizeBytes: z.number().int().positive().max(100 * 1024 * 1024),
});
export type FileUpload = z.infer<typeof FileUploadSchema>;

// ─── Deployment contracts ─────────────────────────────────────────────────────

export const DeployProviderSchema = z.enum(["vercel", "docker", "railway", "fly"]);
export const DeployEnvironmentSchema = z.enum(["preview", "staging", "production"]);

export const CreateDeploymentSchema = z.object({
  projectId: z.string().uuid(),
  runId: z.string().uuid(),
  provider: DeployProviderSchema,
  environment: DeployEnvironmentSchema,
});
export type CreateDeployment = z.infer<typeof CreateDeploymentSchema>;

// ─── System status contracts ──────────────────────────────────────────────────

export const ServiceStatusSchema = z.enum(["ok", "degraded", "down", "unknown"]);

export const SystemStatusSchema = z.object({
  status: ServiceStatusSchema,
  timestamp: z.string().datetime(),
  version: z.string(),
  commit: z.string(),
  services: z.object({
    database: ServiceStatusSchema,
    redis: ServiceStatusSchema,
    s3: ServiceStatusSchema,
    openai: ServiceStatusSchema,
    worker: ServiceStatusSchema,
  }),
  queues: z.record(z.object({
    active: z.number().int(),
    waiting: z.number().int(),
    failed: z.number().int(),
  })),
  buildReport: z.object({
    builtAt: z.string().datetime(),
    commit: z.string(),
    branch: z.string(),
    ci: z.boolean(),
    checks: z.object({
      lint: z.boolean(),
      typecheck: z.boolean(),
      test: z.boolean(),
      build: z.boolean(),
    }),
  }).optional(),
});
export type SystemStatus = z.infer<typeof SystemStatusSchema>;
