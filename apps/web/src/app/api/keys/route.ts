import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentWorkspaceSelection } from "@/lib/team-server";
import crypto from "crypto";

function generateApiKey() {
    return `sk_live_${crypto.randomBytes(24).toString("hex")}`;
}

export async function GET(request: Request) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // We fetch keys for the user, but we should make sure they belong to the current workspace?
    // The implementation plan said "linked to users and workspaces".
    // Let's filter by current workspace to be consistent with the platform's multi-tenant model.

    const admin = createAdminClient();
    try {
        const selection = await getCurrentWorkspaceSelection(admin, user);

        const { data, error } = await admin
            .from("api_keys")
            .select("*")
            .eq("user_id", user.id)
            .eq("workspace_id", selection.current.workspace.id)
            .order("created_at", { ascending: false });

        if (error) throw error;

        // Mask the keys for security in the list view, only show last 4
        const maskedData = data.map(k => ({
            ...k,
            key: `sk_live_...${k.key.slice(-4)}`
        }));

        return NextResponse.json({ data: maskedData });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await request.json().catch(() => ({}));
    const name = payload.name || "Secret Key";

    const admin = createAdminClient();
    try {
        const selection = await getCurrentWorkspaceSelection(admin, user);
        const newKey = generateApiKey();

        const { data, error } = await admin
            .from("api_keys")
            .insert({
                user_id: user.id,
                workspace_id: selection.current.workspace.id,
                key: newKey,
                name: name
            })
            .select()
            .single();

        if (error) throw error;

        // Return the full key ONLY on creation
        return NextResponse.json({ data });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
        return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    const admin = createAdminClient();

    // Ensure the key belongs to the user before deleting
    const { error } = await admin
        .from("api_keys")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
