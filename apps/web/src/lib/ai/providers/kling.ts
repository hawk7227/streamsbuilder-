import { AIProvider, GenerationOptions, GenerationResult, GenerationType } from "../types";
import jwt from "jsonwebtoken";
import { getSiteConfig } from "../../config";

export class KlingProvider implements AIProvider {
    private generateToken(): string {
        const config = getSiteConfig();
        const sk = config.apiKeys?.KLING_API_KEY || process.env.KLING_API_KEY;
        const ak = config.apiKeys?.KLING_ASSESS_API_KEY || process.env.KLING_ASSESS_API_KEY;

        if (!ak || !sk) {
            throw new Error("KLING_API_KEY or KLING_ASSESS_API_KEY is not set");
        }

        const payload = {
            iss: ak,
            exp: Math.floor(Date.now() / 1000) + 1800,
            nbf: Math.floor(Date.now() / 1000) - 5
        };

        return jwt.sign(payload, sk, { header: { alg: "HS256", typ: "JWT" } });
    }

    async generate(type: GenerationType, options: GenerationOptions): Promise<GenerationResult> {
        if (type === "image") return this.generateImage(options);
        if (type === "video") return this.generateVideo(options);
        if (type === "i2v") return this.generateImageToVideo(options);
        throw new Error(`KlingProvider does not support type: ${type}`);
    }

    // ── Text-to-Image ────────────────────────────────────────────────────
    // Fire-and-forget: submits task, returns {status:"pending", externalId}
    // Completion arrives via callBackUrl webhook or cron poller
    private async generateImage(options: GenerationOptions): Promise<GenerationResult> {
        const token = this.generateToken();

        const body: Record<string, unknown> = {
            model_name: "kling-v2-1",
            prompt: options.prompt,
            negative_prompt: options.style ?? "",
            n: 1,
        };
        if (options.callBackUrl) body.callBackUrl = options.callBackUrl;

        const submitResponse = await fetch("https://api-singapore.klingai.com/v1/images/generations", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        });

        if (!submitResponse.ok) {
            const errorText = await submitResponse.text();
            throw new Error(`Kling Image submit failed: ${submitResponse.statusText} — ${errorText}`);
        }

        const submitResult = await submitResponse.json() as { code: number; message?: string; data?: { task_id: string } };

        if (submitResult.code !== 0 || !submitResult.data?.task_id) {
            throw new Error(`Kling Image submit rejected: ${submitResult.message ?? "unknown error"}`);
        }

        return {
            status: "pending",
            externalId: submitResult.data.task_id,
        };
    }

    // ── Text-to-Video ────────────────────────────────────────────────────
    private async generateVideo(options: GenerationOptions): Promise<GenerationResult> {
        const token = this.generateToken();

        const aspectRatio = options.aspectRatio ?? "16:9";
        const duration = (options.duration ?? "5").replace("s", "");

        const body: Record<string, unknown> = {
            model_name: "kling-v2-6",
            prompt: options.prompt,
            negative_prompt: "",
            duration,
            mode: options.mode ?? "standard",
            aspect_ratio: aspectRatio,
        };
        if (options.callBackUrl) body.callBackUrl = options.callBackUrl;

        const submitResponse = await fetch("https://api-singapore.klingai.com/v1/videos/text2video", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        });

        if (!submitResponse.ok) {
            const errorText = await submitResponse.text();
            throw new Error(`Kling Video submit failed: ${submitResponse.statusText} — ${errorText}`);
        }

        const submitResult = await submitResponse.json() as { code: number; message?: string; data?: { task_id: string } };

        if (submitResult.code !== 0 || !submitResult.data?.task_id) {
            throw new Error(`Kling Video submit rejected: ${submitResult.message ?? "unknown error"}`);
        }

        return {
            status: "pending",
            externalId: submitResult.data.task_id,
        };
    }

    // ── Image-to-Video ───────────────────────────────────────────────────
    // 3B: New method — animates a static image with motion-only prompt
    private async generateImageToVideo(options: GenerationOptions): Promise<GenerationResult> {
        if (!options.imageUrl) {
            throw new Error("imageUrl is required for image-to-video generation");
        }

        const token = this.generateToken();

        const aspectRatio = options.aspectRatio ?? "16:9";
        const duration = (options.duration ?? "5").replace("s", "");

        const body: Record<string, unknown> = {
            model_name: "kling-v2-1",
            image: options.imageUrl,
            prompt: options.prompt,    // Motion-only: what moves and how
            negative_prompt: "",
            duration,
            mode: options.mode ?? "standard",
            aspect_ratio: aspectRatio,
        };
        if (options.callBackUrl) body.callBackUrl = options.callBackUrl;

        const submitResponse = await fetch("https://api-singapore.klingai.com/v1/videos/image2video", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        });

        if (!submitResponse.ok) {
            const errorText = await submitResponse.text();
            throw new Error(`Kling I2V submit failed: ${submitResponse.statusText} — ${errorText}`);
        }

        const submitResult = await submitResponse.json() as { code: number; message?: string; data?: { task_id: string } };

        if (submitResult.code !== 0 || !submitResult.data?.task_id) {
            throw new Error(`Kling I2V submit rejected: ${submitResult.message ?? "unknown error"}`);
        }

        return {
            status: "pending",
            externalId: submitResult.data.task_id,
        };
    }
}
