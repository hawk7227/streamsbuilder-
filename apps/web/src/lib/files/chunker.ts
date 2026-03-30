/**
 * chunker.ts — File Chunking + Full-Text Index
 * Splits extracted text into overlapping chunks, writes to file_chunks table.
 * Uses Postgres tsvector for search — no external vector DB required.
 */

import { createAdminClient } from "@/lib/supabase/admin";

const CHUNK_SIZE   = 512;  // target tokens per chunk (~400 words)
const CHUNK_OVERLAP = 50;  // overlap tokens between chunks
const WORDS_PER_TOKEN = 0.75; // rough approximation

// ── Tokenise (word-based approximation) ───────────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.split(/\s+/).filter(Boolean).length / WORDS_PER_TOKEN);
}

// ── Split text into overlapping chunks ────────────────────────────────────

export function splitIntoChunks(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const wordsPerChunk = Math.floor(CHUNK_SIZE * WORDS_PER_TOKEN);
  const overlapWords  = Math.floor(CHUNK_OVERLAP * WORDS_PER_TOKEN);

  const chunks: string[] = [];
  let start = 0;

  while (start < words.length) {
    const end = Math.min(start + wordsPerChunk, words.length);
    chunks.push(words.slice(start, end).join(" "));
    start += wordsPerChunk - overlapWords;
    if (start >= words.length) break;
  }

  return chunks;
}

// ── Write chunks to DB ────────────────────────────────────────────────────

export async function chunkAndIndexFile(
  fileId: string,
  text: string
): Promise<{ chunkCount: number }> {
  const admin = createAdminClient();
  const chunks = splitIntoChunks(text);
  if (chunks.length === 0) return { chunkCount: 0 };

  // Delete existing chunks for this file (re-index)
  await admin.from("file_chunks").delete().eq("file_id", fileId);

  const rows = chunks.map((content, index) => ({
    file_id:     fileId,
    chunk_index: index,
    content,
    token_count: estimateTokens(content),
  }));

  // Insert in batches of 100
  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await admin.from("file_chunks").insert(rows.slice(i, i + BATCH));
    if (error) throw new Error(`Chunk insert failed at batch ${i}: ${error.message}`);
  }

  return { chunkCount: chunks.length };
}

// ── Search chunks ─────────────────────────────────────────────────────────

export interface ChunkSearchResult {
  file_id:     string;
  chunk_index: number;
  content:     string;
  rank:        number;
  file_name?:  string;
}

export async function searchChunks(
  query: string,
  workspaceId: string,
  limit = 10
): Promise<ChunkSearchResult[]> {
  const admin = createAdminClient();

  // Get file IDs for this workspace
  const { data: files } = await admin
    .from("files")
    .select("id, name")
    .eq("workspace_id", workspaceId);

  if (!files?.length) return [];

  const fileIds = files.map(f => f.id);
  const fileMap: Record<string, string> = {};
  files.forEach(f => { fileMap[f.id] = f.name; });

  // Full-text search with tsvector
  const { data, error } = await admin.rpc("search_file_chunks", {
    query_text: query,
    file_ids:   fileIds,
    max_results: limit,
  });

  if (error) {
    // Fallback: ilike search if RPC not available
    const { data: fallback } = await admin
      .from("file_chunks")
      .select("file_id, chunk_index, content")
      .in("file_id", fileIds)
      .ilike("content", `%${query.slice(0, 100)}%`)
      .limit(limit);

    return (fallback ?? []).map((r, i) => ({
      file_id:    r.file_id,
      chunk_index: r.chunk_index,
      content:    r.content,
      rank:       1 - i * 0.1,
      file_name:  fileMap[r.file_id],
    }));
  }

  return (data ?? []).map((r: { file_id: string; chunk_index: number; content: string; rank: number }) => ({
    ...r,
    file_name: fileMap[r.file_id],
  }));
}

// ── Retrieve context for chat ─────────────────────────────────────────────

export async function getFileContextForChat(
  query: string,
  workspaceId: string,
  maxChars = 8000
): Promise<string> {
  const results = await searchChunks(query, workspaceId, 8);
  if (!results.length) return "";

  let context = "### Relevant file content:\n\n";
  let totalChars = 0;

  for (const r of results) {
    const block = `**${r.file_name ?? r.file_id}** (chunk ${r.chunk_index + 1}):\n${r.content}\n\n`;
    if (totalChars + block.length > maxChars) break;
    context += block;
    totalChars += block.length;
  }

  return context;
}
