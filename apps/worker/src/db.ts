/**
 * apps/worker/src/db.ts
 *
 * DB initialisation for apps/worker.
 * Workers write run/step/tool_call/deployment records directly to Postgres.
 * Called once at boot in src/index.ts after validateEnv().
 */

import { initDb, getDb, checkDbConnection } from "@streams/db";
import type { AppEnv } from "@streams/contracts";

export function bootDb(env: AppEnv): void {
  initDb(env.DATABASE_URL);
}

export { getDb, checkDbConnection };
