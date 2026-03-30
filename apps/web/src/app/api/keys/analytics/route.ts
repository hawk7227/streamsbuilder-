import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentWorkspaceSelection } from "@/lib/team-server";

export async function GET(request: Request) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();

    try {
        const selection = await getCurrentWorkspaceSelection(admin, user);

        // Get last 30 days of logs
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { data, error } = await admin
            .from("api_usage_logs")
            .select("created_at, status_code")
            .eq("workspace_id", selection.current.workspace.id)
            .gte("created_at", thirtyDaysAgo.toISOString())
            .order("created_at", { ascending: true });

        if (error) throw error;

        // Process data for chart
        // Group by day
        const statsByDay: Record<string, { total: number; success: number; error: number }> = {};

        // Initialize last 30 days with 0
        for (let i = 0; i < 30; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = d.toISOString().slice(0, 10);
            statsByDay[key] = { total: 0, success: 0, error: 0 };
        }

        data?.forEach(log => {
            const day = log.created_at.slice(0, 10);
            if (!statsByDay[day]) {
                statsByDay[day] = { total: 0, success: 0, error: 0 };
            }
            statsByDay[day].total++;
            if (log.status_code >= 200 && log.status_code < 300) {
                statsByDay[day].success++;
            } else {
                statsByDay[day].error++;
            }
        });

        const chartData = Object.entries(statsByDay)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([date, stats]) => ({
                date,
                ...stats
            }));

        return NextResponse.json({ data: chartData });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
