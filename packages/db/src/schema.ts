/**
 * packages/db
 *
 * Drizzle ORM schema — single source of truth for all DB tables.
 * All 13 entities from the doc are defined here.
 * No raw SQL outside this package.
 */

import {
  pgTable, uuid, text, integer, bigint, boolean,
  timestamp, jsonb, pgEnum,
} from "drizzle-orm/pg-core";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const runModeEnum = pgEnum("run_mode", ["helper", "builder", "runtime", "deploy"]);
export const runStatusEnum = pgEnum("run_status", ["pending", "running", "completed", "failed", "cancelled"]);
export const deployProviderEnum = pgEnum("deploy_provider", ["vercel", "docker", "railway", "fly"]);
export const deployEnvEnum = pgEnum("deploy_environment", ["preview", "staging", "production"]);
export const toolSideEffectEnum = pgEnum("tool_side_effect", ["read", "write", "execute", "deploy"]);

// ─── projects ─────────────────────────────────────────────────────────────────

export const projects = pgTable("projects", {
  id:            uuid("id").primaryKey().defaultRandom(),
  name:          text("name").notNull(),
  slug:          text("slug").notNull().unique(),
  repoUrl:       text("repo_url"),
  defaultBranch: text("default_branch").notNull().default("main"),
  framework:     text("framework"),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
  updatedAt:     timestamp("updated_at").notNull().defaultNow(),
});

// ─── conversations ────────────────────────────────────────────────────────────

export const conversations = pgTable("conversations", {
  id:        uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  title:     text("title"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── messages ─────────────────────────────────────────────────────────────────

export const messages = pgTable("messages", {
  id:             uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role:           text("role", { enum: ["user", "assistant", "system"] }).notNull(),
  contentJson:    jsonb("content_json").notNull(),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
});

// ─── runs ─────────────────────────────────────────────────────────────────────

export const runs = pgTable("runs", {
  id:             uuid("id").primaryKey().defaultRandom(),
  projectId:      uuid("project_id").notNull().references(() => projects.id),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id),
  messageId:      uuid("message_id").references(() => messages.id),
  mode:           runModeEnum("mode").notNull(),
  status:         runStatusEnum("status").notNull().default("pending"),
  model:          text("model").notNull(),
  startedAt:      timestamp("started_at"),
  finishedAt:     timestamp("finished_at"),
  errorCode:      text("error_code"),
  errorMessage:   text("error_message"),
});

// ─── run_steps ────────────────────────────────────────────────────────────────

export const runSteps = pgTable("run_steps", {
  id:          uuid("id").primaryKey().defaultRandom(),
  runId:       uuid("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
  stepType:    text("step_type").notNull(),
  status:      runStatusEnum("status").notNull().default("pending"),
  title:       text("title"),
  payloadJson: jsonb("payload_json"),
  startedAt:   timestamp("started_at"),
  finishedAt:  timestamp("finished_at"),
});

// ─── tool_calls ───────────────────────────────────────────────────────────────

export const toolCalls = pgTable("tool_calls", {
  id:         uuid("id").primaryKey().defaultRandom(),
  runId:      uuid("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
  toolName:   text("tool_name").notNull(),
  inputJson:  jsonb("input_json").notNull(),
  outputJson: jsonb("output_json"),
  status:     runStatusEnum("status").notNull().default("pending"),
  latencyMs:  integer("latency_ms"),
  createdAt:  timestamp("created_at").notNull().defaultNow(),
});

// ─── files ────────────────────────────────────────────────────────────────────

export const files = pgTable("files", {
  id:         uuid("id").primaryKey().defaultRandom(),
  projectId:  uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  storageKey: text("storage_key").notNull().unique(),
  filename:   text("filename").notNull(),
  mimeType:   text("mime_type").notNull(),
  sizeBytes:  bigint("size_bytes", { mode: "number" }).notNull(),
  sha256:     text("sha256"),
  createdAt:  timestamp("created_at").notNull().defaultNow(),
});

// ─── file_chunks (for vector indexing) ───────────────────────────────────────

export const fileChunks = pgTable("file_chunks", {
  id:        uuid("id").primaryKey().defaultRandom(),
  fileId:    uuid("file_id").notNull().references(() => files.id, { onDelete: "cascade" }),
  chunkIdx:  integer("chunk_idx").notNull(),
  content:   text("content").notNull(),
  tokenCount:integer("token_count"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── previews ─────────────────────────────────────────────────────────────────

export const previews = pgTable("previews", {
  id:           uuid("id").primaryKey().defaultRandom(),
  projectId:    uuid("project_id").notNull().references(() => projects.id),
  runId:        uuid("run_id").references(() => runs.id),
  status:       runStatusEnum("status").notNull().default("pending"),
  previewUrl:   text("preview_url"),
  buildLogKey:  text("build_log_key"),
  artifactKey:  text("artifact_key"),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
});

// ─── test_runs ────────────────────────────────────────────────────────────────

export const testRuns = pgTable("test_runs", {
  id:         uuid("id").primaryKey().defaultRandom(),
  projectId:  uuid("project_id").notNull().references(() => projects.id),
  runId:      uuid("run_id").references(() => runs.id),
  status:     runStatusEnum("status").notNull().default("pending"),
  command:    text("command").notNull(),
  reportJson: jsonb("report_json"),
  logKey:     text("log_key"),
  createdAt:  timestamp("created_at").notNull().defaultNow(),
});

// ─── deployments ──────────────────────────────────────────────────────────────

export const deployments = pgTable("deployments", {
  id:            uuid("id").primaryKey().defaultRandom(),
  projectId:     uuid("project_id").notNull().references(() => projects.id),
  runId:         uuid("run_id").references(() => runs.id),
  provider:      deployProviderEnum("provider").notNull(),
  environment:   deployEnvEnum("environment").notNull(),
  status:        runStatusEnum("status").notNull().default("pending"),
  deploymentUrl: text("deployment_url"),
  logKey:        text("log_key"),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
});

// ─── environments ─────────────────────────────────────────────────────────────

export const environments = pgTable("environments", {
  id:        uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name:      text("name").notNull(),
  provider:  deployProviderEnum("provider").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── secrets_metadata (never stores actual secret values) ────────────────────

export const secretsMetadata = pgTable("secrets_metadata", {
  id:            uuid("id").primaryKey().defaultRandom(),
  projectId:     uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  environmentId: uuid("environment_id").references(() => environments.id),
  key:           text("key").notNull(),
  isSet:         boolean("is_set").notNull().default(false),
  updatedAt:     timestamp("updated_at").notNull().defaultNow(),
});
