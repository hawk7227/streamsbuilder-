import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentWorkspaceSelection } from "@/lib/team-server";
import { listJobs, enqueueJob, type JobType } from "@/lib/jobs/queue";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const selection = await getCurrentWorkspaceSelection(admin, user);
  const workspaceId = selection.current.workspace.id;

  const { searchParams } = new URL(request.url);
  const type  = searchParams.get("type")  as JobType | undefined;
  const status = searchParams.get("status") as "pending"|"running"|"completed"|"failed"|undefined;
  const limit  = Number(searchParams.get("limit") ?? "50");

  const jobs = await listJobs(workspaceId, { type, status, limit });
  return NextResponse.json({ data: jobs });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const selection = await getCurrentWorkspaceSelection(admin, user);
  const workspaceId = selection.current.workspace.id;

  let body: { type?: string; payload?: Record<string, unknown>; priority?: number };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (!body.type) return NextResponse.json({ error: "type is required" }, { status: 400 });

  const job = await enqueueJob(body.type as JobType, body.payload ?? {}, {
    workspaceId,
    userId:   user.id,
    priority: body.priority,
  });

  return NextResponse.json({ data: job }, { status: 201 });
}
