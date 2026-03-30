import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSystemMetrics } from "@/lib/monitoring/metrics";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const metrics = await getSystemMetrics();
  return NextResponse.json({ data: metrics });
}
