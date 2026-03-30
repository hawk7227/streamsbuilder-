import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET - Fetch credentials for a specific integration
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const workflowId = searchParams.get("workflow_id") || "default-workflow";
        const integrationType = searchParams.get("integration_type");

        if (!integrationType) {
            return NextResponse.json(
                { error: "Integration type is required" },
                { status: 400 }
            );
        }

        const supabase = await createClient();

        // Get integration
        const { data: integration, error: integrationError } = await supabase
            .from("workflow_integrations")
            .select("id")
            .eq("workflow_id", workflowId)
            .eq("integration_type", integrationType)
            .single();

        if (integrationError || !integration) {
            return NextResponse.json(
                { error: "Integration not found" },
                { status: 404 }
            );
        }

        // Get credentials
        const { data: credentials, error: credError } = await supabase
            .from("integration_credentials")
            .select("credential_key, credential_value")
            .eq("integration_id", integration.id);

        if (credError) {
            throw credError;
        }

        // Convert credentials array to object
        const credentialsObj: Record<string, string> = {};
        if (credentials) {
            credentials.forEach((cred: any) => {
                credentialsObj[cred.credential_key] = cred.credential_value;
            });
        }

        return NextResponse.json({ credentials: credentialsObj });
    } catch (error: any) {
        console.error("Error fetching credentials:", error);
        return NextResponse.json(
            { error: error.message || "Failed to fetch credentials" },
            { status: 500 }
        );
    }
}
