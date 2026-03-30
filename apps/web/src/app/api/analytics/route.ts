import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentWorkspaceSelection } from "@/lib/team-server";

const TIME_SAVED_MINUTES = 5;

const formatDayLabel = (date: Date) =>
  date.toLocaleDateString("en-US", { weekday: "short" });

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const selection = await getCurrentWorkspaceSelection(admin, user);
  const { count } = await admin
    .from("workspace_members")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", selection.current.workspace.id);
  const teamMembers = count ?? 1;

  const now = new Date();
  const startDate = new Date();
  startDate.setDate(now.getDate() - 6);
  startDate.setHours(0, 0, 0, 0);

  const [totalResult, recentResult, chartResult] = await Promise.all([
    admin
      .from("generations")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", selection.current.workspace.id),
    admin
      .from("generations")
      .select("id, type, created_at")
      .eq("workspace_id", selection.current.workspace.id)
      .order("created_at", { ascending: false })
      .limit(5),
    admin
      .from("generations")
      .select("id, type, created_at")
      .eq("workspace_id", selection.current.workspace.id)
      .gte("created_at", startDate.toISOString()),
  ]);

  if (totalResult.error || recentResult.error || chartResult.error) {
    return NextResponse.json(
      {
        error:
          totalResult.error?.message ??
          recentResult.error?.message ??
          chartResult.error?.message ??
          "Unable to load analytics",
      },
      { status: 500 }
    );
  }

  const totalGenerations = totalResult.count ?? 0;
  const timeSavedHours = Math.round((totalGenerations * TIME_SAVED_MINUTES) / 6) / 10;

  const labels: string[] = [];
  const generationsPerDay: number[] = [];
  const timeSavedPerDay: number[] = [];
  const projectsPerDay: number[] = [];
  const distributionCounts: Record<string, number> = {
    video: 0,
    image: 0,
    voice: 0,
    script: 0,
  };

  for (let i = 0; i < 7; i += 1) {
    const day = new Date(startDate);
    day.setDate(startDate.getDate() + i);
    const dayKey = day.toISOString().slice(0, 10);
    const entries =
      chartResult.data?.filter(
        (entry) => entry.created_at?.slice(0, 10) === dayKey
      ) ?? [];

    labels.push(formatDayLabel(day));
    generationsPerDay.push(entries.length);
    projectsPerDay.push(entries.length);
    timeSavedPerDay.push(
      Math.round((entries.length * TIME_SAVED_MINUTES) / 6) / 10
    );

    entries.forEach((entry) => {
      if (entry.type && distributionCounts[entry.type] !== undefined) {
        distributionCounts[entry.type] += 1;
      }
    });
  }

  const totalDistribution = Object.values(distributionCounts).reduce(
    (sum, value) => sum + value,
    0
  );

  const distribution = Object.entries(distributionCounts).map(([type, count]) => ({
    type,
    percentage: totalDistribution
      ? Math.round((count / totalDistribution) * 100)
      : 0,
  }));

  return NextResponse.json({
    totals: {
      generations: totalGenerations,
      timeSavedHours,
      projects: totalGenerations,
      teamMembers,
    },
    chart: {
      labels,
      generations: generationsPerDay,
      timeSaved: timeSavedPerDay,
      projects: projectsPerDay,
    },
    distribution,
    recentActivity: recentResult.data ?? [],
  });
}
