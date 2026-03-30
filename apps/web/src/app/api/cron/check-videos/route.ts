import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadImageToSupabase } from "@/lib/supabase/storage";

// GET /api/cron/check-videos
// Backup poller — Vercel Cron every 2 minutes.
// Primary path: POST /api/webhook/video-complete (Kling/Runway callBackUrl)
// This catches webhook misses.

const CHUNK_SIZE = 10;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function uploadVideoToSupabase(remoteUrl: string, workspaceId: string): Promise<string> {
  const res = await fetch(remoteUrl, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Download failed: ${res.statusText}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") ?? "video/mp4";
  const ext = contentType.includes("webm") ? "webm" : "mp4";
  const storagePath = `${workspaceId}/${crypto.randomUUID()}.${ext}`;
  const admin = createAdminClient();
  const { error } = await admin.storage.from("generations")
    .upload(storagePath, buffer, { contentType, upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  const { data } = admin.storage.from("generations").getPublicUrl(storagePath);
  return data.publicUrl;
}

type Gen = { id: string; workspace_id: string; external_id: string; provider: string | null; type: string };
type PollResult = { id: string; status: "completed"|"failed"|"processing"|"skipped"; outputUrl?: string };

function makeKlingJWT(): string {
  // Kling requires a signed JWT — raw key is NOT a valid bearer token
  const ak = process.env.KLING_ASSESS_API_KEY;  // access key (iss)
  const sk = process.env.KLING_API_KEY;          // secret key (sign)
  if (!ak || !sk) throw new Error("KLING keys not set");
  const header  = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const now     = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ iss: ak, exp: now + 1800, nbf: now - 5 })).toString("base64url");
  const data    = `${header}.${payload}`;
  // Node built-in HMAC-SHA256
  const { createHmac } = require("crypto") as typeof import("crypto");
  const sig = createHmac("sha256", sk).update(data).digest("base64url");
  return `${data}.${sig}`;
}

async function pollKling(gen: Gen): Promise<PollResult> {
  // Route to correct endpoint per generation type
  let ep: string;
  if (gen.type === "image") {
    ep = `https://api-singapore.klingai.com/v1/images/generations/${gen.external_id}`;
  } else if (gen.type === "i2v") {
    ep = `https://api-singapore.klingai.com/v1/videos/image2video/${gen.external_id}`;
  } else {
    ep = `https://api-singapore.klingai.com/v1/videos/text2video/${gen.external_id}`;
  }
  let token: string;
  try { token = makeKlingJWT(); } catch { return { id: gen.id, status: "skipped" }; }
  const res = await fetch(ep, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return { id: gen.id, status: "skipped" };
  const d = await res.json() as { data: { task_status: string; task_result?: { videos?: {url:string}[]; images?: {url:string}[] } } };
  const t = d.data;
  if (t.task_status === "failed") return { id: gen.id, status: "failed" };
  if (t.task_status !== "succeed") return { id: gen.id, status: "processing" };
  const cdnUrl = t.task_result?.videos?.[0]?.url ?? t.task_result?.images?.[0]?.url;
  if (!cdnUrl) return { id: gen.id, status: "failed" };
  const outputUrl = gen.type === "video" || gen.type === "i2v"
    ? await uploadVideoToSupabase(cdnUrl, gen.workspace_id)
    : await uploadImageToSupabase(cdnUrl, gen.workspace_id);
  return { id: gen.id, status: "completed", outputUrl };
}

async function pollRunway(gen: Gen): Promise<PollResult> {
  const res = await fetch(`https://api.runwayml.com/v1/tasks/${gen.external_id}`, {
    headers: { Authorization: `Bearer ${process.env.RUNWAY_API_KEY}`, "X-Runway-Version": "2024-11-06" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return { id: gen.id, status: "skipped" };
  const d = await res.json() as { status: string; output?: string[] };
  if (d.status === "FAILED") return { id: gen.id, status: "failed" };
  if (d.status !== "SUCCEEDED") return { id: gen.id, status: "processing" };
  const cdnUrl = d.output?.[0];
  if (!cdnUrl) return { id: gen.id, status: "failed" };
  const outputUrl = await uploadVideoToSupabase(cdnUrl, gen.workspace_id);
  return { id: gen.id, status: "completed", outputUrl };
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const admin = createAdminClient();
  const { data: pending, error } = await admin
    .from("generations")
    .select("id, workspace_id, external_id, provider, type")
    .in("status", ["pending", "processing"])
    .not("external_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!pending?.length) return NextResponse.json({ checked: 0, updated: 0 });

  const results: PollResult[] = [];
  for (const batch of chunk(pending as Gen[], CHUNK_SIZE)) {
    const batchResults = await Promise.all(
      batch.map(gen => {
        const poll = (gen.provider ?? "kling") === "runway" ? pollRunway : pollKling;
        return poll(gen).catch(() => ({ id: gen.id, status: "skipped" as const }));
      })
    );
    results.push(...batchResults);
  }

  const toUpdate = results.filter(r => r.status === "completed" || r.status === "failed");
  await Promise.all(toUpdate.map(r =>
    admin.from("generations").update({
      status: r.status,
      ...(r.outputUrl ? { output_url: r.outputUrl } : {}),
    }).eq("id", r.id)
  ));

  return NextResponse.json({
    checked: pending.length,
    updated: toUpdate.length,
    completed: results.filter(r => r.status === "completed").length,
    failed: results.filter(r => r.status === "failed").length,
    processing: results.filter(r => r.status === "processing").length,
    skipped: results.filter(r => r.status === "skipped").length,
  });
}
