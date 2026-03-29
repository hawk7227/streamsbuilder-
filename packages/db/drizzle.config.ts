import { defineConfig } from "drizzle-kit";

const url = process.env["DATABASE_URL"];
if (!url) {
  throw new Error("[drizzle-kit] DATABASE_URL is required");
}

export default defineConfig({
  schema:    "./src/schema.ts",
  out:       "./src/migrations",
  dialect:   "postgresql",
  dbCredentials: { url },
  verbose:   true,
  strict:    true,
});
