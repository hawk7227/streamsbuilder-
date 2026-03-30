import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentWorkspaceSelection } from "@/lib/team-server";
import { validateMime } from "@/lib/files/parser";
import { orchestrateFileUpload } from "@/lib/files/uploadOrchestrator";

const MAX_SIZE = 250 * 1024 * 1024; // 250MB

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "File too large (max 250MB)" }, { status: 413 });

  const mimeCheck = validateMime(file.type, file.name);
  if (!mimeCheck.valid) return NextResponse.json({ error: mimeCheck.reason }, { status: 415 });

  const admin = createAdminClient();
  const selection = await getCurrentWorkspaceSelection(admin, user);
  const workspaceId = selection.current.workspace.id;

  try {
    const result = await orchestrateFileUpload({
      workspaceId,
      userId: user.id,
      file,
      source: "chat",
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upload failed" },
      { status: 500 }
    );
  }
}
