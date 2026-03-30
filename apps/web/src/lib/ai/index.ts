import { getSiteConfig } from "../config";
import { AIProvider, GenerationOptions, GenerationResult, GenerationType } from "./types";
import { OpenAIProvider } from "./providers/openai";
import { ClaudeProvider } from "./providers/claude";
import { KlingProvider } from "./providers/kling";
import { Veo3Provider } from "./providers/veo3";
import { ElevenlabsProvider } from "./providers/elevenlabs";
import { RunwayProvider } from "./providers/runway";
import { FalProvider } from "./providers/fal";

// Instantiate providers once
const providers: Record<string, AIProvider> = {
    openai: new OpenAIProvider(),
    claude: new ClaudeProvider(),
    kling: new KlingProvider(),
    veo3: new Veo3Provider(),
    elevenlabs: new ElevenlabsProvider(),
    runway: new RunwayProvider(),
    fal: new FalProvider(),
};

/**
 * Main entry point for generating AI content.
 * It reads the desired provider from the site configuration for the given type,
 * and delegates the work to the corresponding initialized provider.
 */
export async function generateContent(
    type: GenerationType,
    options: GenerationOptions,
    providerOverride?: string
): Promise<GenerationResult> {
    const config = getSiteConfig();

    // Allow explicit override (e.g. force "openai" for instant DALL-E)
    const providerKey = providerOverride || config.aiProviders?.[type] || "openai";

    const provider = providers[providerKey.toLowerCase()];

    if (!provider) {
        throw new Error(`AI Provider '${providerKey}' is not configured for type '${type}'`);
    }

    console.log(`[AI Routing] Generating ${type} using provider: ${providerKey}`);
    return provider.generate(type, options);
}
