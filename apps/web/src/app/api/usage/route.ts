import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlanLimits, type PlanLimitValue } from "@/lib/plans";
import { getCurrentWorkspaceSelection } from "@/lib/team-server";

interface UsageSummary {
  used: number;
  limit: PlanLimitValue;
  remaining: PlanLimitValue;
  periodStart: string;
  periodEnd: string;
}

const formatDate = (date: Date) => date.toISOString().slice(0, 10);

const getUsagePeriod = (date = new Date()) => {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const periodStart = new Date(Date.UTC(year, month, 1));
  const periodEnd = new Date(Date.UTC(year, month + 1, 1));

  return {
    periodStart: formatDate(periodStart),
    periodEnd: formatDate(periodEnd),
  };
};

const buildUsageSummary = (
  used: number,
  limit: PlanLimitValue,
  periodStart: string,
  periodEnd: string
): UsageSummary => {
  if (limit === "unlimited") {
    return {
      used,
      limit,
      remaining: "unlimited",
      periodStart,
      periodEnd,
    };
  }

  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    periodStart,
    periodEnd,
  };
};

const ensureUsageRow = async (
  admin: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  periodStart: string,
  periodEnd: string
) => {
  const { data, error } = await admin
    .from("generation_usage")
    .select("generations_used")
    .eq("workspace_id", workspaceId)
    .eq("period_start", periodStart)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    const { error: insertError } = await admin
      .from("generation_usage")
      .upsert(
        {
          workspace_id: workspaceId,
          period_start: periodStart,
          period_end: periodEnd,
          generations_used: 0,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id,period_start" }
      );

    if (insertError) {
      throw new Error(insertError.message);
    }
  }

  return data?.generations_used ?? 0;
};

export async function GET() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { periodStart, periodEnd } = getUsagePeriod();

  try {
    const selection = await getCurrentWorkspaceSelection(admin, user);
    const limit = getPlanLimits(selection.plan.key).generationsPerMonth;
    const used = await ensureUsageRow(
      admin,
      selection.current.workspace.id,
      periodStart,
      periodEnd
    );
    return NextResponse.json(buildUsageSummary(used, limit, periodStart, periodEnd));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load usage" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => ({}));
  const rawAmount = Number(payload?.amount ?? 1);
  const incrementBy = Number.isFinite(rawAmount) ? Math.floor(rawAmount) : 1;

  if (incrementBy <= 0) {
    return NextResponse.json({ error: "Invalid usage increment" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { periodStart, periodEnd } = getUsagePeriod();

  try {
    const selection = await getCurrentWorkspaceSelection(admin, user);
    const limit = getPlanLimits(selection.plan.key).generationsPerMonth;
    const used = await ensureUsageRow(
      admin,
      selection.current.workspace.id,
      periodStart,
      periodEnd
    );
    const nextUsed = used + incrementBy;

    if (limit !== "unlimited" && nextUsed > limit) {
      return NextResponse.json(
        {
          error: "Monthly generation limit reached",
          usage: buildUsageSummary(used, limit, periodStart, periodEnd),
        },
        { status: 403 }
      );
    }

    const { error: updateError } = await admin
      .from("generation_usage")
      .update({
        generations_used: nextUsed,
        updated_at: new Date().toISOString(),
      })
      .eq("workspace_id", selection.current.workspace.id)
      .eq("period_start", periodStart);

    if (updateError) {
      throw new Error(updateError.message);
    }

    return NextResponse.json(buildUsageSummary(nextUsed, limit, periodStart, periodEnd));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update usage" },
      { status: 500 }
    );
  }
}
