import crypto from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { uploadFileWithHash } from '@/lib/supabase/storage';
import { parseByType } from '@/lib/files/parserRouter';
import { chunkAndIndexFile } from '@/lib/files/chunker';
import { enqueueJob } from '@/lib/jobs/queue';

export interface UploadOrchestrationInput {
  workspaceId: string;
  userId: string;
  file: File;
  source?: 'chat' | 'operator' | 'api';
}

export async function orchestrateFileUpload(input: UploadOrchestrationInput) {
  const admin = createAdminClient();
  const buffer = Buffer.from(await input.file.arrayBuffer());
  const filename = `${crypto.randomUUID()}-${input.file.name}`;
  const parsed = await parseByType(buffer, input.file.name, input.file.type);

  const upload = await uploadFileWithHash(buffer, {
    workspaceId: input.workspaceId,
    userId: input.userId,
    filename,
    mimeType: input.file.type,
    bucket: parsed.classification.ingestType === 'asset' ? 'media-assets' : parsed.classification.ingestType === 'voice_dataset' ? 'voice-datasets' : 'files',
    isTemp: false,
  });

  const { data: fileRecord, error } = await admin
    .from('files')
    .insert({
      workspace_id: input.workspaceId,
      user_id: input.userId,
      name: input.file.name,
      mime_type: input.file.type,
      size: input.file.size,
      hash: createHash(buffer),
      bucket: upload.bucket,
      storage_path: upload.storagePath,
      public_url: upload.url,
      is_temp: false,
      extracted_text: parsed.text.slice(0, 500000) || null,
      metadata: {
        ...parsed.metadata,
        source: input.source ?? 'chat',
      },
    })
    .select('*')
    .single();

  if (error || !fileRecord) throw new Error(error?.message ?? 'Failed to create file record');

  if (parsed.text) {
    await chunkAndIndexFile(fileRecord.id, parsed.text);
  }

  if (parsed.classification.ingestType === 'voice_dataset') {
    await enqueueJob('voice_dataset_process', { fileId: fileRecord.id }, { workspaceId: input.workspaceId, userId: input.userId, priority: 3 });
  }

  return {
    file: fileRecord,
    classification: parsed.classification,
    isDuplicate: upload.isDuplicate,
  };
}

function createHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}
