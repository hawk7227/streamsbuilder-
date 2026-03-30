import { AIProvider, GenerationOptions, GenerationResult, GenerationType } from "../types";

// fal.ai Flux provider — photorealistic images without beauty smoothing
// Model: fal-ai/flux/dev (best realism) or fal-ai/flux-realism
export class FalProvider implements AIProvider {
    async generate(type: GenerationType, options: GenerationOptions): Promise<GenerationResult> {
        if (type === "image") return this.generateImage(options);
        throw new Error(`FalProvider does not support type: ${type}`);
    }

    private async generateImage(options: GenerationOptions): Promise<GenerationResult> {
        const apiKey = process.env.FAL_API_KEY;
        if (!apiKey) throw new Error("FAL_API_KEY is not set");

        const width  = options.aspectRatio === "9:16" ? 768  : 1344;
        const height = options.aspectRatio === "9:16" ? 1344 : 768;

        const response = await fetch("https://fal.run/fal-ai/flux-realism", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Key ${apiKey}`,
            },
            body: JSON.stringify({
                prompt: options.prompt,
                image_size: { width, height },
                num_inference_steps: 28,
                guidance_scale: 3.5,
                num_images: 1,
                enable_safety_checker: true,
            }),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({})) as { detail?: string };
            throw new Error(`Fal image generation failed (${response.status}): ${err.detail ?? response.statusText}`);
        }

        const result = await response.json() as { images?: { url: string }[] };
        const url = result.images?.[0]?.url;
        if (!url) return { status: "failed" };

        return { status: "completed", outputUrl: url };
    }
}
