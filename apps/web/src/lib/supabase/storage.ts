import crypto from "node:crypto";
import { createAdminClient } from "./admin";

const BUCKET_FILES       = "files";
const BUCKET_MEDIA       = "media-assets";
const BUCKET_GENERATIONS = "generations";

export interface UploadResult {
  url: string;
  storagePath: string;
  bucket: string;
  isDuplicate: boolean;
  existingFileId?: string;
}

export interface FileUploadOptions {
  workspaceId: string;
  userId: string;
  filename?: string;
  mimeType?: string;
  isTemp?: boolean;
  bucket?: string;
}

export function hashBuffer(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export async function findDuplicateFile(
  hash: string,
  workspaceId: string
): Promise<{ id: string; public_url: string | null; storage_path: string } | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("files")
    .select("id, public_url, storage_path")
    .eq("workspace_id", workspaceId)
    .eq("hash", hash)
    .eq("is_temp", false)
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

export async function uploadFileWithHash(
  buffer: Buffer,
  options: FileUploadOptions
): Promise<UploadResult> {
  const admin = createAdminClient();
  const hash = hashBuffer(buffer);
  const bucket = options.bucket ?? BUCKET_FILES;
  const mimeType = options.mimeType ?? "application/octet-stream";
  const ext = mimeType.split("/")[1]?.replace("jpeg", "jpg").split("+")[0] ?? "bin";
  const filename = options.filename ?? `${crypto.randomUUID()}.${ext}`;
  const storagePath = `${options.workspaceId}/${filename}`;

  const duplicate = await findDuplicateFile(hash, options.workspaceId);
  if (duplicate?.public_url) {
    return { url: duplicate.public_url, storagePath: duplicate.storage_path, bucket, isDuplicate: true, existingFileId: duplicate.id };
  }

  const { error: uploadError } = await admin.storage
    .from(bucket)
    .upload(storagePath, buffer, { contentType: mimeType, upsert: false });
  if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

  const isPublic = bucket === BUCKET_MEDIA || bucket === BUCKET_GENERATIONS;
  let url: string;
  if (isPublic) {
    url = admin.storage.from(bucket).getPublicUrl(storagePath).data.publicUrl;
  } else {
    const { data, error } = await admin.storage.from(bucket).createSignedUrl(storagePath, 3600);
    if (error) throw new Error(`Signed URL failed: ${error.message}`);
    url = data.signedUrl;
  }
  return { url, storagePath, bucket, isDuplicate: false };
}

export async function getSignedDownloadUrl(
  storagePath: string,
  bucket: string,
  expiresInSeconds = 3600
): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(bucket).createSignedUrl(storagePath, expiresInSeconds);
  if (error) throw new Error(`Failed to create signed URL: ${error.message}`);
  return data.signedUrl;
}

export async function getSignedUploadUrl(
  storagePath: string,
  bucket: string,
  expiresInSeconds = 600
): Promise<{ signedUrl: string; token: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(bucket)
    .createSignedUploadUrl(storagePath);
  if (error) throw new Error(`Failed to create signed upload URL: ${error.message}`);
  return { signedUrl: data.signedUrl, token: data.token };
}

export async function moveToPermament(fileId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("files")
    .update({ is_temp: false, updated_at: new Date().toISOString() })
    .eq("id", fileId);
  if (error) throw new Error(`Failed to promote file: ${error.message}`);
}

export async function deleteExpiredTempFiles(
  olderThanHours = 24
): Promise<{ deleted: number; errors: string[] }> {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - olderThanHours * 3600000).toISOString();
  const { data: expired } = await admin
    .from("files")
    .select("id, storage_path, bucket")
    .eq("is_temp", true)
    .lt("created_at", cutoff);
  if (!expired?.length) return { deleted: 0, errors: [] };
  const errors: string[] = [];
  let deleted = 0;
  for (const f of expired) {
    try {
      await admin.storage.from(f.bucket).remove([f.storage_path]);
      await admin.from("files").delete().eq("id", f.id);
      deleted++;
    } catch (e) {
      errors.push(`${f.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { deleted, errors };
}

export async function deleteFile(fileId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: file } = await admin
    .from("files")
    .select("storage_path, bucket")
    .eq("id", fileId)
    .single();
  if (!file) throw new Error("File not found");
  await admin.storage.from(file.bucket).remove([file.storage_path]);
  await admin.from("files").delete().eq("id", fileId);
}

export async function uploadImageToSupabase(
  imageSource: string,
  workspaceId: string,
  filename?: string
): Promise<string> {
  const admin = createAdminClient();
  let buffer: Buffer;
  let mimeType = "image/png";

  if (imageSource.startsWith("data:")) {
    const [header, base64Data] = imageSource.split(",");
    const m = header.match(/data:([^;]+);base64/);
    if (m) mimeType = m[1];
    buffer = Buffer.from(base64Data, "base64");
  } else {
    const res = await fetch(imageSource);
    if (!res.ok) throw new Error(`Download failed: ${res.statusText}`);
    const ct = res.headers.get("content-type");
    if (ct) mimeType = ct.split(";")[0].trim();
    buffer = Buffer.from(await res.arrayBuffer());
  }

  const ext = mimeType.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
  const storagePath = `${workspaceId}/${filename ?? crypto.randomUUID()}.${ext}`;
  const { error } = await admin.storage
    .from(BUCKET_GENERATIONS)
    .upload(storagePath, buffer, { contentType: mimeType, upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return admin.storage.from(BUCKET_GENERATIONS).getPublicUrl(storagePath).data.publicUrl;
}
