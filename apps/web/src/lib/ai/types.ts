export type GenerationType = "script" | "image" | "video" | "i2v" | "voice";

export interface GenerationOptions {
    prompt: string;
    aspectRatio?: string;
    duration?: string;
    quality?: string;
    style?: string;
    imageUrl?: string;       // For image-to-video (I2V)
    callBackUrl?: string;    // Webhook URL for async completion
    mode?: "standard" | "pro";
    temperature?: number;    // 0.0–2.0 — governance steps use 0.3
    model?: string;          // Override model e.g. "gpt-4o" for compliance steps
}

export interface GenerationResult {
    status: "completed" | "pending" | "failed";
    outputUrl?: string | null;
    externalId?: string | null;
    responseText?: string | null;
}

export interface AIProvider {
    generate(type: GenerationType, options: GenerationOptions): Promise<GenerationResult>;
}
