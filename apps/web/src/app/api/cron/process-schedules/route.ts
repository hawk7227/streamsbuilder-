
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { executePipeline } from "@/lib/pipeline-execution";

// Helper to check if cron matches current time
function isCronMatch(cron: string, date: Date): boolean {
    if (!cron) return false;
    const parts = cron.trim().split(/\s+/);
    if (parts.length < 5) return false;

    const [min, hour, dom, month, dow] = parts;

    // Use UTC for server consistency
    const currentMin = date.getUTCMinutes();
    const currentHour = date.getUTCHours();
    const currentDom = date.getUTCDate();
    const currentMonth = date.getUTCMonth() + 1; // 1-12
    const currentDow = date.getUTCDay(); // 0-6 (Sun-Sat)

    const check = (pattern: string, value: number) => {
        if (pattern === '*') return true;

        // Step check: */5
        if (pattern.includes('/')) {
            const [base, step] = pattern.split('/');
            const stepNum = parseInt(step);
            if (isNaN(stepNum)) return false;

            if (base === '*') return value % stepNum === 0;
            // Handle range/step? e.g. 10-20/2
            return false; // MVP support for */n only
        }

        // List check: 1,2,3
        if (pattern.includes(',')) {
            return pattern.split(',').map(p => parseInt(p)).includes(value);
        }

        return parseInt(pattern) === value;
    };

    return (
        check(min, currentMin) &&
        check(hour, currentHour) &&
        check(dom, currentDom) &&
        check(month, currentMonth) &&
        check(dow, currentDow)
    );
}

export async function GET(request: Request) {
    // Basic auth protection (optional: check for a secret header from cron job)
    // const authHeader = request.headers.get('authorization');
    // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    //     return new NextResponse('Unauthorized', { status: 401 });
    // }

    const supabase = createAdminClient();
    const now = new Date(); // Current time (will use UTC methods in helper)

    try {
        // Fetch all pipelines
        // In production, you might want to filter only active ones or use pagination
        const { data: pipelines, error } = await supabase
            .from("pipelines")
            .select("*");

        if (error) throw error;

        const results = [];
        const triggeredPipelines = [];

        for (const pipeline of pipelines || []) {
            const nodes = pipeline.nodes || [];

            // Find schedule trigger node
            const scheduleNode = nodes.find((n: any) =>
                n.type === 'schedule' || n.data?.type === 'schedule'
            );

            if (scheduleNode) {
                // Determine cron expression
                // Data structure from UI: node.data.interval (preset) or node.data.cron (custom)
                // However, UI sets node.data.cron for custom, but also node.data.interval for presets like "0 * * * *"
                // Let's rely on node.data.cron if custom, or interval if it looks like cron
                // Wait, UI code:
                // if preset: interval="0 * * * *", content="Runs every..."
                // if custom: interval="custom", cron="* * * * *"

                // Use explicit cron field if available (new UI), otherwise fallback to interval (legacy/simple)
                // If interval is 'custom', it should have a cron field anyway.
                let cronExpression = scheduleNode.data.cron;

                if (!cronExpression) {
                    if (scheduleNode.data.interval === 'custom') {
                        cronExpression = scheduleNode.data.cron;
                    } else {
                        cronExpression = scheduleNode.data.interval;
                    }
                }

                const matches = isCronMatch(cronExpression, now);

                if (matches) {
                    console.log(`Triggering pipeline ${pipeline.id} due to schedule ${cronExpression}`);
                    triggeredPipelines.push(pipeline.id);

                    // Execute Pipeline
                    // We need to pass the schedule context
                    const initialContext = {
                        schedule: {
                            triggeredAt: now.toISOString(),
                            cron: cronExpression
                        }
                    };

                    // Run in background (don't await for all to finish if many?)
                    // For MVP, await to catch errors and return status
                    try {
                        const result = await executePipeline(nodes, pipeline.edges || []);
                        results.push({ pipelineId: pipeline.id, status: 'success', result });
                    } catch (execError) {
                        console.error(`Error executing pipeline ${pipeline.id}:`, execError);
                        results.push({ pipelineId: pipeline.id, status: 'error', error: String(execError) });
                    }
                }
            }
        }

        return NextResponse.json({
            success: true,
            timestamp: now.toISOString(),
            triggeredCount: triggeredPipelines.length,
            triggeredPipelines,
            results
        });

    } catch (error) {
        console.error("Cron Job Error:", error);
        return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
    }
}
