import fs from 'fs';
import path from 'path';

const CONFIG_PATH = path.join(process.cwd(), 'site-config.json');

export interface SiteConfig {
    appName: string;
    logoUrl: string;
    themeColor: string;
    scriptWriterPrompt: string;
    copilotSystemPrompt: string;
    copilotModel: string;
    marketingCopywriterPrompt: string;
    copilotAssistantPrompt: string;
    aiProviders?: {
        script: string;
        image: string;
        video: string;
        voice: string;
        i2v: string;
    };
    apiKeys?: Record<string, string>;
    elevenlabsVoiceId?: string;
    [key: string]: any;
}

const DEFAULT_CONFIG: SiteConfig = {
    appName: 'StreamsAI',
    logoUrl: '/logo.png',
    themeColor: '#000000',
    scriptWriterPrompt: 'You are a professional script writer. Generate engaging content based on the user prompt.',
    copilotSystemPrompt: 'You are an expert full-stack developer. You help the user build web applications. If asked to generate code, provide it in code blocks. If asked to create a landing page or UI, provide the full HTML/Tailwind code.',
    copilotModel: 'gpt-4o',
    marketingCopywriterPrompt: 'You are a professional marketing copywriter. Generate engaging, concise, and effective marketing content based on the user\'s requirements. Do not include any explanations or additional text - only provide the requested content.',
    copilotAssistantPrompt: 'You are a helpful AI assistant for a {{type}} generation platform.\nContext:\n- Current Page/Type: {{type}}\n- User\'s Current Prompt: "{{prompt}}"\n- Active Settings: {{settings}}\n\nYour goal is to help the user create better content.\nYou have access to tools to DIRECTLY update the user\'s prompt or settings.\n- If the user asks to "make it 16:9" or "change to square", use the \'update_settings\' tool.\n- If the user asks to "rewrite this prompt" or you suggest a better prompt and they agree, use the \'update_prompt\' tool.\n- Always provide a polite text response along with the tool call explanation.\n\nBe concise, friendly, and directly helpful.',
    aiProviders: {
        script: 'openai',
        image: 'openai',
        video: 'kling',
        voice: 'openai',
        i2v: 'kling'
    },
    elevenlabsVoiceId: 'jqcCZkN6Knx8BJ5TBdYR'
};

export const getSiteConfig = (): SiteConfig => {
    let fileConfig: Partial<SiteConfig> = {};
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const fileContent = fs.readFileSync(CONFIG_PATH, 'utf-8');
            fileConfig = JSON.parse(fileContent);
        }
    } catch (error) {
        console.error('Error reading site config:', error);
    }

    // Allow env vars to override provider routing so production works
    // without a site-config.json file on disk
    const envProviders = {
        script: process.env.AI_PROVIDER_SCRIPT || fileConfig?.aiProviders?.script || DEFAULT_CONFIG.aiProviders!.script,
        image:  process.env.AI_PROVIDER_IMAGE  || fileConfig?.aiProviders?.image  || DEFAULT_CONFIG.aiProviders!.image,
        video:  process.env.AI_PROVIDER_VIDEO  || fileConfig?.aiProviders?.video  || DEFAULT_CONFIG.aiProviders!.video,
        voice:  process.env.AI_PROVIDER_VOICE  || fileConfig?.aiProviders?.voice  || DEFAULT_CONFIG.aiProviders!.voice,
        i2v:    process.env.AI_PROVIDER_I2V    || fileConfig?.aiProviders?.i2v    || DEFAULT_CONFIG.aiProviders!.i2v,
    };

    return { ...DEFAULT_CONFIG, ...fileConfig, aiProviders: envProviders };
};

export const updateSiteConfig = (newConfig: Partial<SiteConfig>): SiteConfig => {
    const currentConfig = getSiteConfig();
    const updatedConfig = { ...currentConfig, ...newConfig };

    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(updatedConfig, null, 2));
        return updatedConfig;
    } catch (error) {
        console.error('Error writing site config:', error);
        throw new Error('Failed to update site configuration');
    }
};
