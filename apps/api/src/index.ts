/**
 * apps/api — Express API server
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
import { eq } from "drizzle-orm";

// ─── Boot ─────────────────────────────────────────────────────────────────────

const env = validateEnv();
const integrations = createIntegrations(env);
bootDb(env);

const RUN_CHANNEL = (runId: string) => `run:${runId}:events`;

// ─── App ──────────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use("/api", createRoutes(integrations));

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
  const db = getDb();
  const { schema } = await import("@streams/db");

  // Ensure project exists — create default if missing
  let project = await db.query.projects.findFirst({
    where: eq(schema.projects.id, request.projectId),
  });

  if (!project) {
    const [created] = await db.insert(schema.projects).values({
      id: request.projectId,
      name: "Default Project",
      slug: `project-${request.projectId.slice(0, 8)}`,
    }).returning();
    project = created;
  }

  // Ensure conversation exists
  let conversation = request.conversationId
    ? await db.query.conversations.findFirst({
        where: eq(schema.conversations.id, request.conversationId),
      })
    : null;

  if (!conversation) {
    const [created] = await db.insert(schema.conversations).values({
      id: request.conversationId ?? randomUUID(),
      projectId: request.projectId,
      title: request.userMessage.slice(0, 80),
    }).returning();
    conversation = created;
  }

  // Insert user message
  const [userMessage] = await db.insert(schema.messages).values({
    conversationId: conversation.id,
    role: "user",
    contentJson: { text: request.userMessage },
  }).returning();

  const runId = randomUUID();
  const classification = classifyRequest(request.userMessage);
  const mode = resolveRunMode(request, classification);

  // Insert run record
  await db.insert(schema.runs).values({
    id: runId,
    projectId: request.projectId,
    conversationId: conversation.id,
    messageId: userMessage.id,
    mode: mode === "auto" ? "helper" : mode,
    status: "pending",
    model: "gpt-4o",
  });

  const needsQueue = mode === "runtime" || mode === "deploy";

  if (needsQueue) {
    await db.update(schema.runs)
      .set({ status: "running" })
      .where(eq(schema.runs.id, runId));

    await integrations.redis.publish(
      "queue:ai-runs",
      JSON.stringify({ runId, conversationId: conversation.id, request, mode })
    );

    res.status(202).json({
      runId,
      conversationId: conversation.id,
      streamUrl: `/api/runs/${runId}/stream`,
    });
    return;
  }

  // Helper/builder: stream directly
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const sendEvent = (event: object) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  sendEvent({ type: "response_started", runId });

  await db.update(schema.runs)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(schema.runs.id, runId));

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

    // Persist assistant message
    await db.insert(schema.messages).values({
      conversationId: conversation.id,
      role: "assistant",
      contentJson: { text: fullText },
    });

    await db.update(schema.runs)
      .set({ status: "completed", finishedAt: new Date() })
      .where(eq(schema.runs.id, runId));

    sendEvent({ type: "response_completed", text: fullText });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";

    await db.update(schema.runs)
      .set({ status: "failed", finishedAt: new Date(), errorMessage })
      .where(eq(schema.runs.id, runId));

    sendEvent({ type: "run_failed", error: errorMessage });
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

  await integrations.redis.raw.subscribe(RUN_CHANNEL(id ?? ""), (message) => {
    res.write(`data: ${message}\n\n`);
  });

  req.on("close", () => {
    void integrations.redis.raw.unsubscribe(RUN_CHANNEL(id ?? ""));
  });

  res.write(`data: ${JSON.stringify({ type: "connected", runId: id })}\n\n`);
});

// ─── GET /api/system-status ───────────────────────────────────────────────────

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
    getQueueDepths: async () => ({}),
    getBuildReport: async () => buildReport as SystemStatus["buildReport"],
    version: process.env.npm_package_version ?? "0.0.0",
    commit: process.env.GITHUB_SHA ?? "unknown",
  });

  res.status(status.status === "ok" ? 200 : 503).json(status);
});

// ─── GET /health ──────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;
app.listen(PORT, () => {
  console.log(`[api] listening on :${PORT}`);
});

export default app;
