/**
 * apps/api/src/routes.ts
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
import { getDb } from "./db.js";
import { eq } from "drizzle-orm";

export function createRoutes(integrations: Integrations): Router {
  const router = Router();

  // ─── POST /api/files/upload ───────────────────────────────────────────────

  router.post("/files/upload", async (req: Request, res: Response) => {
    const parse = FileUploadSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: "Invalid request", issues: parse.error.flatten() });
      return;
    }

    const db = getDb();
    const { schema } = await import("@streams/db");
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");

    const fileId = randomUUID();
    const storageKey = `projects/${parse.data.projectId}/files/${fileId}/${parse.data.filename}`;

    // Write placeholder to S3 (client uploads directly via presigned URL in production)
    // For now: confirm bucket accessibility and insert DB record
    try {
      await integrations.s3.send(
        new PutObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: storageKey,
          ContentType: parse.data.mimeType,
          ContentLength: 0,
        })
      );
    } catch (err) {
      console.error("[files/upload] S3 write failed:", err);
      res.status(502).json({ error: "Storage unavailable" });
      return;
    }

    // Insert into DB
    const [file] = await db.insert(schema.files).values({
      id: fileId,
      projectId: parse.data.projectId,
      storageKey,
      filename: parse.data.filename,
      mimeType: parse.data.mimeType,
      sizeBytes: parse.data.sizeBytes,
    }).returning();

    // Enqueue processing
    await integrations.redis.publish(
      "queue:file-processing",
      JSON.stringify({ fileId, storageKey, projectId: parse.data.projectId })
    );

    res.status(201).json({
      fileId: file.id,
      storageKey,
      uploadUrl: `/api/files/${fileId}/upload-url`,
    });
  });

  // ─── POST /api/previews ───────────────────────────────────────────────────

  router.post("/previews", async (req: Request, res: Response) => {
    const { projectId, runId } = req.body as { projectId?: string; runId?: string };
    if (!projectId || !runId) {
      res.status(400).json({ error: "projectId and runId required" });
      return;
    }

    const db = getDb();
    const { schema } = await import("@streams/db");

    // Verify run exists
    const run = await db.query.runs.findFirst({ where: eq(schema.runs.id, runId) });
    if (!run) {
      res.status(404).json({ error: "Run not found" });
      return;
    }

    const previewId = randomUUID();

    // Insert preview record
    await db.insert(schema.previews).values({
      id: previewId,
      projectId,
      runId,
      status: "pending",
    });

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

    const db = getDb();
    const { schema } = await import("@streams/db");

    const run = await db.query.runs.findFirst({ where: eq(schema.runs.id, runId) });
    if (!run) {
      res.status(404).json({ error: "Run not found" });
      return;
    }

    const testRunId = randomUUID();
    const testCommand = command ?? "pnpm test";

    await db.insert(schema.testRuns).values({
      id: testRunId,
      projectId,
      runId,
      status: "pending",
      command: testCommand,
    });

    await integrations.redis.publish(
      "queue:test-runs",
      JSON.stringify({ testRunId, projectId, runId, command: testCommand, projectDir: `/tmp/projects/${projectId}` })
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

    const db = getDb();
    const { schema } = await import("@streams/db");
    const { projectId, runId, provider, environment } = parse.data;

    const run = await db.query.runs.findFirst({ where: eq(schema.runs.id, runId) });
    if (!run) {
      res.status(404).json({ error: "Run not found" });
      return;
    }

    const deployId = randomUUID();

    await db.insert(schema.deployments).values({
      id: deployId,
      projectId,
      runId,
      provider,
      environment,
      status: "pending",
    });

    await integrations.redis.publish(
      "queue:deploy-runs",
      JSON.stringify({ deployId, projectId, runId, provider, environment, projectDir: `/tmp/projects/${projectId}` })
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
