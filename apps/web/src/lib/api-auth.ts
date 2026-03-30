import { createAdminClient } from "@/lib/supabase/admin";
import { type SupabaseClient } from "@supabase/supabase-js";

export interface ApiKeyData {
    id: string;
    user_id: string;
    workspace_id: string;
    name: string;
    key: string;
}

export async function validateApiKey(request: Request) {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
        return null;
    }

    const apiKey = authHeader.split(" ")[1];
    if (!apiKey) {
        return null;
    }

    const supabase = createAdminClient();

    const { data: keyData, error } = await supabase
        .from("api_keys")
        .select("*")
        .eq("key", apiKey)
        .eq("is_active", true)
        .single();

    if (error || !keyData) {
        return null;
    }

    // Async update last_used_at (don't await to not block response)
    supabase
        .from("api_keys")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", keyData.id)
        .then();

    return keyData as ApiKeyData;
}

export async function logApiUsage(
    request: Request,
    responseStatus: number,
    apiKeyData?: ApiKeyData | null
) {
    if (!apiKeyData) return;

    const url = new URL(request.url);
    const endpoint = url.pathname;
    const method = request.method;

    const supabase = createAdminClient();

    await supabase.from("api_usage_logs").insert({
        api_key_id: apiKeyData.id,
        user_id: apiKeyData.user_id,
        workspace_id: apiKeyData.workspace_id,
        endpoint,
        method,
        status_code: responseStatus,
    });
}
