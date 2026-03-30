import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeEmail } from "@/lib/team";

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => ({}));
  const inviteId = typeof payload?.inviteId === "string" ? payload.inviteId : "";

  if (!inviteId) {
    return NextResponse.json({ error: "Invite id required" }, { status: 400 });
  }

  const email = user.email ? normalizeEmail(user.email) : "";
  if (!email) {
    return NextResponse.json({ error: "User email unavailable" }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const { data: invite, error: inviteError } = await admin
      .from("workspace_invites")
      .select("id, status, email")
      .eq("id", inviteId)
      .maybeSingle();

    if (inviteError || !invite) {
      return NextResponse.json(
        { error: inviteError?.message ?? "Invite not found" },
        { status: 404 }
      );
    }

    if (invite.status !== "pending" || normalizeEmail(invite.email) !== email) {
      return NextResponse.json({ error: "Invite not available" }, { status: 403 });
    }

    await admin
      .from("workspace_invites")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", invite.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to decline invite" },
      { status: 500 }
    );
  }
}
