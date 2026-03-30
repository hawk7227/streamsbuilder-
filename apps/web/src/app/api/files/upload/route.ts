import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentWorkspaceSelection } from "@/lib/team-server";
import { uploadFileWithHash, hashBuffer } from "@/lib/supabase/storage";
import { parseFile, validateMime } from "@/lib/files/parser";
import { chunkAndIndexFile } from "@/lib/files/chunker";

const MAX_SIZE = 100 * 1024 * 1024; // 100MB

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const type = (formData.get("type") as string) || "knowledge";

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  // Server-side size enforcement
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: `File too large. Max ${MAX_SIZE / 1024 / 1024}MB allowed.` }, { status: 413 });
  }

  // MIME validation
  const mimeCheck = validateMime(file.type, file.name);
  if (!mimeCheck.valid) {
    return NextResponse.json({ error: mimeCheck.reason }, { status: 415 });
  }

  const admin = createAdminClient();
  let workspaceId: string;
  try {
    const selection = await getCurrentWorkspaceSelection(admin, user);
    workspaceId = selection.current.workspace.id;
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Workspace error" }, { status: 500 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const hash = hashBuffer(buffer);

  // Check for duplicate in this workspace
  const { data: existing } = await admin
    .from("files")
    .select("id, public_url, storage_path")
    .eq("workspace_id", workspaceId)
    .eq("hash", hash)
    .eq("is_temp", false)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({
      data: existing,
      isDuplicate: true,
      message: "Identical file already exists in your workspace",
    });
  }

  // Parse content server-side
  const parsed = await parseFile(buffer, file.name, file.type);
  const extractedText = parsed.text.slice(0, 500000); // cap at 500k chars

  // Upload to storage with hash dedupe
  const bucket = type === "asset" ? "media-assets" : "files";
  let uploadResult;
  try {
    uploadResult = await uploadFileWithHash(buffer, {
      workspaceId,
      userId: user.id,
      filename: `${crypto.randomUUID()}-${file.name}`,
      mimeType: file.type,
      isTemp: false,
      bucket,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Upload failed" }, { status: 500 });
  }

  // Insert file record
  const { data: fileRecord, error: dbError } = await admin
    .from("files")
    .insert({
      workspace_id: workspaceId,
      user_id: user.id,
      name: file.name,
      mime_type: file.type,
      size: file.size,
      hash,
      bucket,
      storage_path: uploadResult.storagePath,
      public_url: uploadResult.url,
      is_temp: false,
      extracted_text: extractedText || null,
      metadata: parsed.metadata,
    })
    .select()
    .single();

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  // Chunk and index for search (non-blocking)
  if (extractedText && fileRecord) {
    void chunkAndIndexFile(fileRecord.id, extractedText).then(() => {}).catch((e: unknown) =>
      console.error("[chunker] failed for", fileRecord.id, e)
    );
  }

  // Backward compat: also write workspace_files for copilot
  await admin.from("workspace_files").insert({
    workspace_id: workspaceId,
    user_id: user.id,
    name: file.name,
    type,
    file_path: uploadResult.storagePath,
    public_url: uploadResult.url,
    extracted_content: extractedText || null,
    mime_type: file.type,
    size: file.size,
  }); // non-blocking, non-fatal — intentionally unawaited

  return NextResponse.json({ data: fileRecord, isDuplicate: false });
}
