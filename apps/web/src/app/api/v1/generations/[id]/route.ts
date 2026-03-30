import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateApiKey, logApiUsage } from "@/lib/api-auth";

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const apiKey = await validateApiKey(request);
    if (!apiKey) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
        await logApiUsage(request, 400, apiKey);
        return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
        .from("generations")
        .select(
            "id, type, prompt, title, status, aspect_ratio, duration, quality, style, favorited, output_url, created_at"
        )
        .eq("id", id)
        .eq("workspace_id", apiKey.workspace_id)
        .single();

    if (error || !data) {
        await logApiUsage(request, 404, apiKey);
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await logApiUsage(request, 200, apiKey);
    return NextResponse.json({ data });
}
