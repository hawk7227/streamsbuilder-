import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { sendMms, sendSms } from "@/lib/sms";

export async function GET(request: Request) {
    // const authHeader = request.headers.get("authorization");
    // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) { return new Response('Unauthorized', { status: 401 }); }

    try {
        const supabase = createAdminClient();
        const now = new Date().toISOString();

        // 1. Fetch campaigns that are scheduled and due
        const { data: campaigns, error: campaignError } = await supabase
            .from("campaigns")
            .select("*")
            .eq("status", "scheduled")
            .lte("scheduled_at", now);

        if (campaignError) throw campaignError;

        if (!campaigns || campaigns.length === 0) {
            return NextResponse.json({ success: true, message: "No campaigns to process", processed: 0 });
        }

        const results = [];

        // 2. Process each campaign
        for (const campaign of campaigns) {
            try {
                // Fetch leads for this campaign
                const { data: campaignLeads, error: leadsError } = await supabase
                    .from("campaign_leads")
                    .select("lead_id, leads!inner(*)")
                    .eq("campaign_id", campaign.id);

                if (leadsError) throw leadsError;

                const leads = campaignLeads.map((cl: any) => cl.leads);
                let sentCount = 0;
                let errorCount = 0;

                // 3. Send to each lead
                if (leads && leads.length > 0) {
                    // Send in parallel or batch? For now, simple loop to avoid rate limits might be safer, but parallel is faster.
                    // We'll do a simple loop for now.
                    for (const lead of leads) {
                        // Check channels
                        if (campaign.channels?.email) {
                            try {
                                await sendEmail({
                                    to: lead.email,
                                    subject: campaign.email_subject,
                                    body: campaign.email_body,
                                    workspaceId: campaign.workspace_id,
                                    lead: lead
                                });
                                sentCount++;
                            } catch (err) {
                                console.error(`Failed to send email to ${lead.email} for campaign ${campaign.id}:`, err);
                                errorCount++;
                            }
                        }

                        if (campaign.channels?.sms) {
                            if (!lead.phone) continue;
                            try {
                                await sendSms({
                                    to: lead.phone,
                                    body: campaign.sms_message ?? "",
                                    lead,
                                });
                                sentCount++;
                            } catch (err) {
                                console.error(`Failed to send SMS to ${lead.phone} for campaign ${campaign.id}:`, err);
                                errorCount++;
                            }
                        }

                        if (campaign.channels?.mms) {
                            if (!lead.phone) continue;
                            if (!campaign.mms_media_url) continue;
                            try {
                                await sendMms({
                                    to: lead.phone,
                                    body: campaign.mms_message ?? "",
                                    mediaUrl: campaign.mms_media_url,
                                    lead,
                                });
                                sentCount++;
                            } catch (err) {
                                console.error(`Failed to send MMS to ${lead.phone} for campaign ${campaign.id}:`, err);
                                errorCount++;
                            }
                        }
                    }
                }

                // 4. Update campaign status to 'sent'
                // Only if we actually attempted to send basics? 
                // Or should we mark it partially sent?
                // For MVP, if we processed the list, it's "sent".
                const { error: updateError } = await supabase
                    .from("campaigns")
                    .update({
                        status: "sent",
                        updated_at: new Date().toISOString()
                    })
                    .eq("id", campaign.id);

                if (updateError) throw updateError;

                results.push({
                    id: campaign.id,
                    name: campaign.name,
                    sent: sentCount,
                    errors: errorCount
                });

            } catch (err: any) {
                console.error(`Error processing campaign ${campaign.id}:`, err);
                results.push({
                    id: campaign.id,
                    error: err.message
                });
            }
        }

        return NextResponse.json({
            success: true,
            processed: results.length,
            details: results
        });

    } catch (error: any) {
        console.error("Error in process-campaigns cron:", error);
        return NextResponse.json(
            { error: error.message || "Internal Server Error" },
            { status: 500 }
        );
    }
}
