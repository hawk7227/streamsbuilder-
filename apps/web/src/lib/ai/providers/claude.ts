import { AIProvider, GenerationOptions, GenerationResult, GenerationType } from "../types";
import { getSiteConfig } from "../../config";

export class ClaudeProvider implements AIProvider {
    async generate(type: GenerationType, options: GenerationOptions): Promise<GenerationResult> {
        if (type === "script") {
            return this.generateScript(options);
        }

        console.warn(`ClaudeProvider called for unsupported type: ${type}`);
        throw new Error(`Claude provider does not currently support generating ${type}.`);
    }

    private async generateScript(options: GenerationOptions): Promise<GenerationResult> {
        const config = getSiteConfig();
        const apiKey = config.apiKeys?.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            throw new Error("ANTHROPIC_API_KEY is not set");
        }

        const systemPrompt = config.scriptWriterPrompt;

        const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "claude-3-5-sonnet-20241022",
                max_tokens: 1024,
                system: systemPrompt,
                messages: [
                    { role: "user", content: options.prompt }
                ],
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Claude API error:", errorText);
            throw new Error(`Claude Script generation failed: ${response.statusText}`);
        }

        const result = await response.json();

        if (result.content && result.content.length > 0 && result.content[0].text) {
            return {
                status: "completed",
                responseText: result.content[0].text,
            };
        }

        return { status: "failed" };
    }
}
