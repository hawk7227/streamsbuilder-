import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { executePipeline } from "@/lib/pipeline-execution";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ pipelineId: string; nodeId: string }> }
) {
    // 1. Parse params
    const { pipelineId, nodeId } = await params;

    // 2. Parse payload
    const body = await request.json().catch(() => ({}));
    const queryParams = new URL(request.url).searchParams;
    const query: Record<string, string> = {};
    queryParams.forEach((value, key) => {
        query[key] = value;
    });

    // Filter headers (remove standard headers, keep custom 'x-')
    const filteredHeaders = Object.fromEntries(
        Object.entries(request.headers).filter(([key]) => !['host', 'connection', 'content-length', 'user-agent', 'accept', 'accept-encoding', 'cookie', 'postman-token', 'content-type'].includes(key.toLowerCase()))
    );

    const payload = {
        body,
        query,
        headers: filteredHeaders, // Only custom headers
        method: request.method,
        timestamp: new Date().toISOString(),
    };

    const admin = createAdminClient();

    try {
        const { data: pipeline, error: fetchError } = await admin
            .from("pipelines")
            .select("nodes, edges")
            .eq("id", pipelineId)
            .single();

        if (fetchError || !pipeline) {
            return NextResponse.json({ error: "Pipeline not found" }, { status: 404 });
        }

        // Find the node
        const nodeIndex = pipeline.nodes.findIndex((n: any) => n.id === nodeId);
        if (nodeIndex === -1) {
            return NextResponse.json({ error: "Node not found" }, { status: 404 });
        }

        const node = pipeline.nodes[nodeIndex];

        // Validate Method (if configured)
        const allowedMethod = node.data.method || "POST"; // Default to POST if not set
        if (request.method !== allowedMethod && allowedMethod !== "ANY") {
            return NextResponse.json({ error: `Method ${request.method} not allowed. Expected ${allowedMethod}` }, { status: 405 });
        }

        // Update the specific node's output data locally for the run
        const updatedNodes = [...pipeline.nodes];
        updatedNodes[nodeIndex] = {
            ...node,
            data: {
                ...node.data,
                output: JSON.stringify(payload, null, 2),
                status: "completed",
                lastRun: new Date().toISOString()
            }
        };

        // Persist the trigger data first (so UI sees it)
        await admin
            .from("pipelines")
            .update({ nodes: updatedNodes, updated_at: new Date().toISOString() })
            .eq("id", pipelineId);

        // Execute Pipeline Logic Server-Side
        const executionResult = await executePipeline(updatedNodes, pipeline.edges || []);

        if (executionResult.webhookResponse) {
            return NextResponse.json(executionResult.webhookResponse);
        }

        return NextResponse.json({ success: true, message: "Pipeline executed, but no response node was hit.", received: payload });

    } catch (error) {
        console.error("Webhook Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ pipelineId: string; nodeId: string }> }
) {
    return POST(request, { params });
}
