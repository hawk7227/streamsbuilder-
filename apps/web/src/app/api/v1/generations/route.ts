import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateApiKey, logApiUsage } from "@/lib/api-auth";

const allowedTypes = ["video", "image", "script", "voice"] as const;
type AllowedType = (typeof allowedTypes)[number];
const isAllowedType = (value: string): value is AllowedType =>
    allowedTypes.includes(value as AllowedType);

export async function GET(request: Request) {
    const apiKey = await validateApiKey(request);
    if (!apiKey) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const limit = Number(searchParams.get("limit") ?? "10");
    const offset = Number(searchParams.get("offset") ?? "0");

    const admin = createAdminClient();
    let query = admin
        .from("generations")
        .select(
            "id, type, prompt, title, status, aspect_ratio, duration, quality, style, favorited, output_url, created_at"
        )
        .eq("workspace_id", apiKey.workspace_id)
        .order("created_at", { ascending: false });

    if (type && isAllowedType(type)) {
        query = query.eq("type", type);
    }

    const status = searchParams.get("status");
    if (status) {
        query = query.eq("status", status);
    }

    const favorited = searchParams.get("favorited");
    if (favorited === "true") {
        query = query.eq("favorited", true);
    } else if (favorited === "false") {
        query = query.eq("favorited", false);
    }

    // Cap limit at 100 for API
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const safeOffset = Math.max(offset, 0);
    query = query.range(safeOffset, safeOffset + safeLimit - 1);

    const { data, error } = await query;

    await logApiUsage(request, error ? 500 : 200, apiKey);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: Request) {
    const apiKey = await validateApiKey(request);
    if (!apiKey) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await request.json().catch(() => ({}));
    const type = typeof payload?.type === "string" ? payload.type : "";
    const prompt = typeof payload?.prompt === "string" ? payload.prompt.trim() : "";

    if (!type || !isAllowedType(type)) {
        await logApiUsage(request, 400, apiKey);
        return NextResponse.json({ error: "Invalid generation type" }, { status: 400 });
    }

    if (!prompt) {
        await logApiUsage(request, 400, apiKey);
        return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    const admin = createAdminClient();

    const insertPayload = {
        user_id: apiKey.user_id,
        workspace_id: apiKey.workspace_id,
        type,
        prompt,
        title: typeof payload?.title === "string" ? payload.title : null,
        status: typeof payload?.status === "string" ? payload.status : "processing", // In a real app this might trigger a background job
        aspect_ratio:
            typeof payload?.aspectRatio === "string" ? payload.aspectRatio : null,
        duration: typeof payload?.duration === "string" ? payload.duration : null,
        quality: typeof payload?.quality === "string" ? payload.quality : null,
        style: typeof payload?.style === "string" ? payload.style : null,
    };

    const { data, error } = await admin
        .from("generations")
        .insert(insertPayload)
        .select(
            "id, type, prompt, title, status, aspect_ratio, duration, quality, style, favorited, output_url, created_at"
        )
        .single();

    await logApiUsage(request, error ? 500 : 200, apiKey);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
}
