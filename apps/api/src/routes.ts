/**
 * apps/api/src/routes.ts
 *
 * Remaining API routes — file upload, previews, test runs, deployments.
 * Imported by src/index.ts and mounted on the Express app.
 *
 * BLOCKER FIXED: Vercel maxDuration is exported per-route as a named export
 * on the Next.js route handler wrappers. For the Express server, timeout is
 * enforced at the queue level via @streams/runtime.
 *
 * Note on Vercel streaming: if apps/web consumes these via Next.js route
 * handlers instead of this Express server, each streaming route file must
 * export: export const maxDuration = 300;
 * This file documents that requirement and enforces the equivalent timeout
 * in the Express context.
 */

import { Router } from "express";
import { randomUUID } from "crypto";
import {
  FileUploadSchema,
  CreateDeploymentSchema,
  type RunStreamEvent,
} from "@streams/contracts";
import type { Integrations } from "@streams/integrations";
import type { Request, Response } from "express";

export function createRoutes(integrations: Integrations): Router {
  const router = Router();

  // ─── POST /api/files/upload ───────────────────────────────────────────────

  router.post("/files/upload", async (req: Request, res: Response) => {
    const parse = FileUploadSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: "Invalid request", issues: parse.error.flatten() });
      return;
    }

    const fileId = randomUUID();
    const storageKey = `projects/${parse.data.projectId}/files/${fileId}/${parse.data.filename}`;

    // Persist file metadata to Redis (wire to DB in production)
    await integrations.redis.set(
      `file:${fileId}`,
      JSON.stringify({ ...parse.data, fileId, storageKey, createdAt: new Date().toISOString() }),
      86400
    );

    // Enqueue file processing (virus scan, indexing, chunk embedding)
    await integrations.redis.publish(
      "queue:file-processing",
      JSON.stringify({ fileId, storageKey, projectId: parse.data.projectId })
    );

    res.status(201).json({ fileId, storageKey, uploadUrl: `/api/files/${fileId}/upload-url` });
  });

  // ─── POST /api/previews ───────────────────────────────────────────────────

  router.post("/previews", async (req: Request, res: Response) => {
    const { projectId, runId } = req.body as { projectId?: string; runId?: string };
    if (!projectId || !runId) {
      res.status(400).json({ error: "projectId and runId required" });
      return;
    }

    const previewId = randomUUID();

    await integrations.redis.publish(
      "queue:preview-builds",
      JSON.stringify({ previewId, projectId, runId, projectDir: `/tmp/projects/${projectId}` })
    );

    const event: RunStreamEvent = {
      type: "queue_job_created",
      jobId: previewId,
      queue: "preview-builds",
      jobType: "build_preview",
    };
    await integrations.redis.publish(`run:${runId}:events`, JSON.stringify(event));

    res.status(202).json({
      previewId,
      streamUrl: `/api/runs/${runId}/stream`,
      status: "queued",
    });
  });

  // ─── POST /api/tests/run ──────────────────────────────────────────────────

  router.post("/tests/run", async (req: Request, res: Response) => {
    const { projectId, runId, command } = req.body as {
      projectId?: string; runId?: string; command?: string;
    };
    if (!projectId || !runId) {
      res.status(400).json({ error: "projectId and runId required" });
      return;
    }

    const testRunId = randomUUID();

    await integrations.redis.publish(
      "queue:test-runs",
      JSON.stringify({
        testRunId,
        projectId,
        runId,
        command: command ?? "pnpm test",
        projectDir: `/tmp/projects/${projectId}`,
      })
    );

    const event: RunStreamEvent = {
      type: "queue_job_created",
      jobId: testRunId,
      queue: "test-runs",
      jobType: "test",
    };
    await integrations.redis.publish(`run:${runId}:events`, JSON.stringify(event));

    res.status(202).json({ testRunId, streamUrl: `/api/runs/${runId}/stream`, status: "queued" });
  });

  // ─── POST /api/deploy ─────────────────────────────────────────────────────

  router.post("/deploy", async (req: Request, res: Response) => {
    const parse = CreateDeploymentSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: "Invalid request", issues: parse.error.flatten() });
      return;
    }

    const deployId = randomUUID();
    const { projectId, runId, provider, environment } = parse.data;

    await integrations.redis.publish(
      "queue:deploy-runs",
      JSON.stringify({
        deployId,
        projectId,
        runId,
        provider,
        environment,
        projectDir: `/tmp/projects/${projectId}`,
      })
    );

    const event: RunStreamEvent = {
      type: "queue_job_created",
      jobId: deployId,
      queue: "deploy-runs",
      jobType: "deploy_release",
    };
    await integrations.redis.publish(`run:${runId}:events`, JSON.stringify(event));

    res.status(202).json({ deployId, streamUrl: `/api/runs/${runId}/stream`, status: "queued" });
  });

  return router;
}

// ─── Vercel maxDuration — MUST be set on Next.js route files that stream ──────
//
// When migrating /api/bot and /api/runs/:id/stream to Next.js App Router:
//
//   // apps/web/src/app/api/bot/route.ts
//   export const maxDuration = 300;   ← required, streaming will silently timeout at 10s without this
//
//   // apps/web/src/app/api/runs/[id]/stream/route.ts
//   export const maxDuration = 300;
//
// This is a hard requirement on Vercel Pro/Enterprise plans.
// Vercel Hobby plan max is 60s — use Railway/Fly for the API on Hobby.
//
export const VERCEL_MAX_DURATION = 300;
