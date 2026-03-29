/**
 * apps/api/src/db.ts
 *
 * DB initialisation for apps/api.
 * Called once at boot in src/index.ts after validateEnv().
 * Exports typed helpers used by route handlers.
 */

import { initDb, getDb, checkDbConnection } from "@streams/db";
import type { AppEnv } from "@streams/contracts";

export function bootDb(env: AppEnv): void {
  initDb(env.DATABASE_URL);
}

export { getDb, checkDbConnection };
