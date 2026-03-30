import { AIProvider, GenerationOptions, GenerationResult, GenerationType } from "../types";
import { getSiteConfig } from "../../config";

export class ElevenlabsProvider implements AIProvider {
    async generate(type: GenerationType, options: GenerationOptions): Promise<GenerationResult> {
        if (type === "voice") {
            return this.generateVoice(options);
        }

        console.warn(`ElevenlabsProvider called for unsupported type: ${type}`);
        throw new Error(`Elevenlabs provider does not currently support generating ${type}.`);
    }

    private async generateVoice(options: GenerationOptions): Promise<GenerationResult> {
        const config = getSiteConfig();
        const apiKey = config.apiKeys?.ELEVENLABS_API_KEY || process.env.ELEVENLABS_API_KEY;
        if (!apiKey) {
            throw new Error("ELEVENLABS_API_KEY is not set");
        }

        const voiceId = config.elevenlabsVoiceId || "jqcCZkN6Knx8BJ5TBdYR";

        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
            method: "POST",
            headers: {
                "Accept": "audio/mpeg",
                "Content-Type": "application/json",
                "xi-api-key": apiKey,
            },
            body: JSON.stringify({
                text: options.prompt,
                model_id: "eleven_monolingual_v1",
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.5
                }
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Elevenlabs API error:", errorText);
            throw new Error(`Elevenlabs Voice generation failed: ${response.statusText}`);
        }

        console.log("=== Elevenlabs Voice Generation Response ===");

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64Audio = buffer.toString("base64");

        return {
            status: "completed",
            outputUrl: `data:audio/mpeg;base64,${base64Audio}`,
        };
    }
}
