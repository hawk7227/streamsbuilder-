import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET - Fetch all integrations for a workflow
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const workflowId = searchParams.get("workflow_id") || "default-workflow";

        const supabase = await createClient();

        const { data: integrations, error } = await supabase
            .from("workflow_integrations")
            .select("*")
            .eq("workflow_id", workflowId);

        if (error) throw error;

        return NextResponse.json({ integrations: integrations || [] });
    } catch (error: any) {
        console.error("Error fetching integrations:", error);
        return NextResponse.json(
            { error: error.message || "Failed to fetch integrations" },
            { status: 500 }
        );
    }
}

// POST - Save or update integration
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const {
            workflow_id = "default-workflow",
            integration_type,
            integration_name,
            credentials,
            config = {},
        } = body;

        if (!integration_type || !integration_name) {
            return NextResponse.json(
                { error: "Missing required fields" },
                { status: 400 }
            );
        }

        const supabase = await createClient();

        // Check if integration already exists
        const { data: existing } = await supabase
            .from("workflow_integrations")
            .select("id")
            .eq("workflow_id", workflow_id)
            .eq("integration_type", integration_type)
            .single();

        let integrationId: string;

        if (existing) {
            // Update existing integration
            const { data, error } = await supabase
                .from("workflow_integrations")
                .update({
                    integration_name,
                    is_active: true,
                    config,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", existing.id)
                .select()
                .single();

            if (error) throw error;
            integrationId = data.id;

            // Delete old credentials
            await supabase
                .from("integration_credentials")
                .delete()
                .eq("integration_id", integrationId);
        } else {
            // Create new integration
            const { data, error } = await supabase
                .from("workflow_integrations")
                .insert({
                    workflow_id,
                    integration_type,
                    integration_name,
                    is_active: true,
                    config,
                })
                .select()
                .single();

            if (error) throw error;
            integrationId = data.id;
        }

        // Insert credentials
        if (credentials && Object.keys(credentials).length > 0) {
            const credentialEntries = Object.entries(credentials).map(
                ([key, value]) => ({
                    integration_id: integrationId,
                    credential_key: key,
                    credential_value: value as string,
                })
            );

            const { error: credError } = await supabase
                .from("integration_credentials")
                .insert(credentialEntries);

            if (credError) throw credError;
        }

        return NextResponse.json({
            success: true,
            message: "Integration saved successfully",
        });
    } catch (error: any) {
        console.error("Error saving integration:", error);
        return NextResponse.json(
            { error: error.message || "Failed to save integration" },
            { status: 500 }
        );
    }
}

// DELETE - Remove integration
export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const integrationId = searchParams.get("integration_id");
        const workflowId = searchParams.get("workflow_id") || "default-workflow";
        const integrationType = searchParams.get("integration_type");

        if (!workflowId || !integrationType) {
            return NextResponse.json(
                { error: "Missing required parameters" },
                { status: 400 }
            );
        }

        const supabase = await createClient();

        // If integrationId provided, delete by ID
        if (integrationId) {
            const { error } = await supabase
                .from("workflow_integrations")
                .delete()
                .eq("id", integrationId);

            if (error) throw error;
        } else {
            // Otherwise delete by workflow_id and integration_type
            const { error } = await supabase
                .from("workflow_integrations")
                .delete()
                .eq("workflow_id", workflowId)
                .eq("integration_type", integrationType);

            if (error) throw error;
        }

        return NextResponse.json({
            success: true,
            message: "Integration deleted successfully",
        });
    } catch (error: any) {
        console.error("Error deleting integration:", error);
        return NextResponse.json(
            { error: error.message || "Failed to delete integration" },
            { status: 500 }
        );
    }
}
