import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateApiKey, logApiUsage } from "@/lib/api-auth";

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

export async function GET(request: Request) {
    const apiKey = await validateApiKey(request);
    if (!apiKey) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { periodStart, periodEnd } = getUsagePeriod();
    const admin = createAdminClient();

    // Simple query for usage, disregarding plan limits for now (just reporting consumption)
    const { data, error } = await admin
        .from("generation_usage")
        .select("generations_used")
        .eq("workspace_id", apiKey.workspace_id)
        .eq("period_start", periodStart)
        .maybeSingle();

    await logApiUsage(request, error ? 500 : 200, apiKey);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
        data: {
            period_start: periodStart,
            period_end: periodEnd,
            generations_used: data?.generations_used ?? 0,
        },
    });
}
