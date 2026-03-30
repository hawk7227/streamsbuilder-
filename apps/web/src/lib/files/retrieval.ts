import { createAdminClient } from '@/lib/supabase/admin';

export interface FileSearchResult {
  fileId: string;
  fileName: string;
  mimeType: string;
  chunkIndex: number;
  content: string;
  rank: number;
}

export async function searchWorkspaceFiles(workspaceId: string, query: string, limit = 10): Promise<FileSearchResult[]> {
  const admin = createAdminClient();
  const safe = query.trim();
  if (!safe) return [];

  const { data, error } = await admin
    .from('file_chunks')
    .select('chunk_index, content, file_id, files!inner(name, mime_type, workspace_id)')
    .textSearch('search_vec', safe, { type: 'websearch' })
    .limit(limit);

  if (error || !data) return [];

  return data
    .filter((row: any) => row.files?.workspace_id === workspaceId)
    .map((row: any, idx: number) => ({
      fileId: row.file_id,
      fileName: row.files.name,
      mimeType: row.files.mime_type,
      chunkIndex: row.chunk_index,
      content: row.content,
      rank: Math.max(0, 1 - idx / Math.max(1, data.length)),
    }));
}

export async function buildFileContext(workspaceId: string, query: string, limit = 6): Promise<string> {
  const matches = await searchWorkspaceFiles(workspaceId, query, limit);
  if (!matches.length) return '';
  return matches
    .map((m, i) => `File Match ${i + 1}: ${m.fileName} [chunk ${m.chunkIndex}]
${m.content.slice(0, 1200)}`)
    .join('\n\n---\n\n');
}
