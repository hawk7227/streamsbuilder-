import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/monitoring/vitals — stores Web Vitals from the client
// Requires auth — only authenticated users can write vitals
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { name?: string; value?: number; rating?: string; path?: string };
  try {
    body = await request.json() as { name?: string; value?: number; rating?: string; path?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.name || body.value === undefined) {
    return NextResponse.json({ error: "name and value are required" }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    await admin.from("ledger_logs").insert({
      action:      "provider_health_check",
      entity_type: "web_vital",
      entity_id:   body.name,
      payload:     { name: body.name, value: body.value, rating: body.rating ?? "unknown", path: body.path, userId: user.id },
      severity:    body.rating === "poor" ? "warn" : "debug",
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to store vital" }, { status: 500 });
  }
}
