import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import nodemailer from "nodemailer";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { workflow_id = "default-workflow", test_email } = body;

        if (!test_email) {
            return NextResponse.json(
                { error: "Test email address is required" },
                { status: 400 }
            );
        }

        const supabase = await createClient();

        // Get SMTP integration
        const { data: integration, error: integrationError } = await supabase
            .from("workflow_integrations")
            .select("id")
            .eq("workflow_id", workflow_id)
            .eq("integration_type", "smtp")
            .eq("is_active", true)
            .single();

        if (integrationError || !integration) {
            return NextResponse.json(
                { error: "SMTP integration not found or not active" },
                { status: 404 }
            );
        }

        // Get SMTP credentials
        const { data: credentials, error: credError } = await supabase
            .from("integration_credentials")
            .select("credential_key, credential_value")
            .eq("integration_id", integration.id);

        if (credError || !credentials || credentials.length === 0) {
            return NextResponse.json(
                { error: "SMTP credentials not found" },
                { status: 404 }
            );
        }

        // Convert credentials array to object
        const credentialsObj: Record<string, string> = {};
        credentials.forEach((cred: any) => {
            credentialsObj[cred.credential_key] = cred.credential_value;
        });

        const { host, port, username, password, from_name, use_tls } = credentialsObj;

        if (!host || !port || !username || !password) {
            return NextResponse.json(
                { error: "Incomplete SMTP configuration" },
                { status: 400 }
            );
        }

        // Create nodemailer transporter
        const transporter = nodemailer.createTransport({
            host,
            port: parseInt(port),
            secure: use_tls === "true", // true for 465, false for other ports
            auth: {
                user: username,
                pass: password,
            },
        });

        // Send test email
        const info = await transporter.sendMail({
            from: `"${from_name || 'StreamsAI'}" <${username}>`,
            to: test_email,
            subject: "Test Email from StreamsAI",
            text: "This is a test email to verify your SMTP configuration.",
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #6366f1;">SMTP Configuration Test</h2>
                    <p>Congratulations! Your SMTP integration is working correctly.</p>
                    <p>This is a test email sent from StreamsAI to verify your email configuration.</p>
                    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
                    <p style="color: #6b7280; font-size: 12px;">
                        If you did not request this test email, please ignore it.
                    </p>
                </div>
            `,
        });

        return NextResponse.json({
            success: true,
            message: "Test email sent successfully",
            messageId: info.messageId,
        });
    } catch (error: any) {
        console.error("Error sending test email:", error);
        return NextResponse.json(
            {
                error: error.message || "Failed to send test email",
                details: error.toString()
            },
            { status: 500 }
        );
    }
}
