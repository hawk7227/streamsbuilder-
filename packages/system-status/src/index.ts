/**
 * packages/system-status
 *
 * Shared runtime health check logic.
 * Imported by apps/api (/api/system-status) and apps/web (/system-status dashboard).
 * Returns a typed SystemStatus object — never throws, always returns a status.
 */

import type { SystemStatus, ServiceStatusSchema } from "@streams/contracts";
import type { z } from "zod";

type ServiceStatus = z.infer<typeof ServiceStatusSchema>;

export interface HealthDependencies {
  checkDatabase: () => Promise<boolean>;
  checkRedis: () => Promise<boolean>;
  checkS3: () => Promise<boolean>;
  checkOpenAI: () => Promise<boolean>;
  checkWorker: () => Promise<boolean>;
  getQueueDepths: () => Promise<Record<string, { active: number; waiting: number; failed: number }>>;
  getBuildReport: () => Promise<SystemStatus["buildReport"]>;
  version: string;
  commit: string;
}

async function safeCheck(fn: () => Promise<boolean>): Promise<ServiceStatus> {
  try {
    return (await fn()) ? "ok" : "down";
  } catch {
    return "down";
  }
}

export async function getSystemStatus(deps: HealthDependencies): Promise<SystemStatus> {
  const [database, redis, s3, openai, worker, queues, buildReport] = await Promise.allSettled([
    safeCheck(deps.checkDatabase),
    safeCheck(deps.checkRedis),
    safeCheck(deps.checkS3),
    safeCheck(deps.checkOpenAI),
    safeCheck(deps.checkWorker),
    deps.getQueueDepths().catch(() => ({} as Record<string, { active: number; waiting: number; failed: number }>)),
    deps.getBuildReport().catch(() => undefined),
  ]);

  const services = {
    database: database.status === "fulfilled" ? database.value : ("down" as ServiceStatus),
    redis:    redis.status === "fulfilled"    ? redis.value    : ("down" as ServiceStatus),
    s3:       s3.status === "fulfilled"       ? s3.value       : ("down" as ServiceStatus),
    openai:   openai.status === "fulfilled"   ? openai.value   : ("down" as ServiceStatus),
    worker:   worker.status === "fulfilled"   ? worker.value   : ("down" as ServiceStatus),
  };

  const allOk = Object.values(services).every((s) => s === "ok");
  const anyDown = Object.values(services).some((s) => s === "down");

  return {
    status: allOk ? "ok" : anyDown ? "down" : "degraded",
    timestamp: new Date().toISOString(),
    version: deps.version,
    commit: deps.commit,
    services,
    queues: queues.status === "fulfilled" ? queues.value : {},
    buildReport: buildReport.status === "fulfilled" ? buildReport.value : undefined,
  };
}

export function isSystemHealthy(status: SystemStatus): boolean {
  return status.status === "ok";
}
