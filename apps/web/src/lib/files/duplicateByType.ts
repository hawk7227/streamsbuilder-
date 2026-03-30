import { createAdminClient } from '@/lib/supabase/admin';
import { getSignedDownloadUrl, uploadFileWithHash } from '@/lib/supabase/storage';
import { classifyFile } from '@/lib/files/fileClassifier';

export async function duplicateFileByType(fileId: string, workspaceId: string, userId: string) {
  const admin = createAdminClient();
  const { data: file, error } = await admin
    .from('files')
    .select('*')
    .eq('id', fileId)
    .eq('workspace_id', workspaceId)
    .single();
  if (error || !file) throw new Error('Source file not found');

  const classification = classifyFile(file.name, file.mime_type);
  if (classification.duplicateStrategy === 'save-edited') {
    throw new Error('save-edited flow required for this file type');
  }

  const signed = await getSignedDownloadUrl(file.storage_path, file.bucket, 600);
  const res = await fetch(signed);
  if (!res.ok) throw new Error(`Failed to fetch source file: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());

  const copyName = appendCopySuffix(file.name);
  const upload = await uploadFileWithHash(buffer, {
    workspaceId,
    userId,
    filename: copyName,
    mimeType: file.mime_type,
    bucket: file.bucket,
    isTemp: false,
  });

  const { data: inserted, error: insertError } = await admin
    .from('files')
    .insert({
      workspace_id: workspaceId,
      user_id: userId,
      name: copyName,
      mime_type: file.mime_type,
      size: file.size,
      hash: file.hash,
      bucket: file.bucket,
      storage_path: upload.storagePath,
      public_url: upload.url,
      is_temp: false,
      extracted_text: file.extracted_text,
      metadata: { ...(file.metadata || {}), duplicatedFrom: fileId },
    })
    .select('*')
    .single();

  if (insertError || !inserted) throw new Error(insertError?.message ?? 'Failed to create duplicate');
  return inserted;
}

function appendCopySuffix(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot === -1) return `${name}-copy`;
  return `${name.slice(0, dot)}-copy${name.slice(dot)}`;
}
