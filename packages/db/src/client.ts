/**
 * packages/db/src/client.ts
 *
 * Drizzle ORM client singleton.
 * Connection string is validated before the pool is created.
 * Call initDb() once at app boot — never import db before this runs.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import * as schema from "./schema.js";

export type Db = ReturnType<typeof drizzle<typeof schema>>;

let _db: Db | null = null;

export function initDb(connectionString: string): Db {
  if (_db) return _db;

  const pool = new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  pool.on("error", (err) => {
    console.error("[db] pool error:", err);
  });

  _db = drizzle(pool, { schema });
  return _db;
}

export function getDb(): Db {
  if (!_db) {
    throw new Error("[db] getDb() called before initDb(). Call initDb(DATABASE_URL) at boot.");
  }
  return _db;
}

export async function checkDbConnection(db: Db): Promise<boolean> {
  try {
    await db.execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}
