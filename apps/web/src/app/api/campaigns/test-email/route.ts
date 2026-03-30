import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { to, subject, body: emailBody, lead } = body;

        if (!to) {
            return NextResponse.json(
                { error: "Recipient email address is required" },
                { status: 400 }
            );
        }

        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        // Get user's profile to find current workspace
        const { data: profile } = await supabase
            .from('profiles')
            .select('current_workspace_id')
            .eq('id', user.id)
            .single();

        if (!profile?.current_workspace_id) {
            return NextResponse.json(
                { error: "No workspace selected" },
                { status: 400 }
            );
        }

        const result = await sendEmail({
            to,
            subject,
            body: emailBody,
            workspaceId: profile.current_workspace_id,
            lead
        });

        return NextResponse.json(result);

    } catch (error: any) {
        console.error("Error sending campaign test email:", error);
        return NextResponse.json(
            { error: error.message || "Failed to send test email" },
            { status: 500 }
        );
    }
}
