import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/files/save-edited
// Saves edited text/code file content back to Supabase storage and updates the files table.
// For image edits use /api/generations/save-edited instead.

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { fileId, content, mimeType } = body as {
    fileId?: string;
    content?: string;
    mimeType?: string;
  };

  if (!fileId || typeof fileId !== "string") {
    return NextResponse.json({ error: "fileId is required" }, { status: 400 });
  }
  if (content === undefined || content === null) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Fetch file row — verify ownership, get storage_path + bucket
  const { data: fileRow, error: fetchErr } = await admin
    .from("files")
    .select("id, storage_path, bucket, name, user_id")
    .eq("id", fileId)
    .eq("user_id", user.id)
    .single();

  if (fetchErr || !fileRow) {
    return NextResponse.json({ error: "File not found or access denied" }, { status: 404 });
  }

  const storagePath = fileRow.storage_path as string;
  const bucket = (fileRow.bucket as string) || "files";
  const contentType = mimeType ?? "text/plain";
  const buffer = Buffer.from(content, "utf-8");

  // Overwrite file in the correct bucket
  const { error: uploadErr } = await admin.storage
    .from(bucket)
    .update(storagePath, buffer, { contentType, upsert: true });

  if (uploadErr) {
    return NextResponse.json({ error: `Storage update failed: ${uploadErr.message}` }, { status: 500 });
  }

  // Update size in DB (updated_at is handled by Supabase trigger if configured,
  // so we only update what we know exists)
  const { error: updateErr } = await admin
    .from("files")
    .update({ size: buffer.byteLength })
    .eq("id", fileId);

  if (updateErr) {
    return NextResponse.json({ error: `DB update failed: ${updateErr.message}` }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    fileId,
    storagePath,
    bucket,
    size: buffer.byteLength,
  });
}
