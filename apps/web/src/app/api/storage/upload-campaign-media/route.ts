import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

function extFromMime(mime: string) {
  const t = (mime || "").toLowerCase();
  if (t.includes("png")) return "png";
  if (t.includes("jpeg") || t.includes("jpg")) return "jpg";
  if (t.includes("webp")) return "webp";
  if (t.includes("gif")) return "gif";
  return "bin";
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("current_workspace_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.current_workspace_id) {
      return NextResponse.json({ error: "No workspace selected" }, { status: 400 });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Only image uploads are supported" }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const ext = extFromMime(file.type);
    const name = crypto.randomUUID();
    const workspaceId = profile.current_workspace_id;
    const storagePath = `${workspaceId}/campaign-media/${name}.${ext}`;

    const admin = createAdminClient();
    const { error: uploadError } = await admin.storage
      .from("generations")
      .upload(storagePath, buf, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data } = admin.storage.from("generations").getPublicUrl(storagePath);
    return NextResponse.json({ url: data.publicUrl, path: storagePath });
  } catch (error: any) {
    console.error("Upload campaign media error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to upload file" },
      { status: 500 }
    );
  }
}

