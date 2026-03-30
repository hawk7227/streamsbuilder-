import { NextRequest, NextResponse } from 'next/server';
import { getSiteConfig, updateSiteConfig } from '@/lib/config';
import { writeFile, unlink } from 'fs/promises';
import path from 'path';

export async function GET(req: NextRequest) {
    try {
        const config = getSiteConfig();

        // Check if the request is from an admin (has secret key)
        const secretKey = req.headers.get('x-admin-secret-key');
        const isAdmin = secretKey === process.env.ADMIN_SECRET_KEY;

        if (isAdmin) {
            // Admin gets full config with aiProviders transformed for frontend
            const responseConfig = { ...config };
            if (responseConfig.aiProviders) {
                responseConfig.aiProviders = { ...responseConfig.aiProviders };
                if (responseConfig.aiProviders.script === 'veo3') {
                    responseConfig.aiProviders.script = 'gemini';
                }
                if (responseConfig.aiProviders.image === 'veo3') {
                    responseConfig.aiProviders.image = 'nanobanana';
                }
            }
            return NextResponse.json(responseConfig);
        }

        // Public: return only safe display fields (no API keys, no AI provider details)
        return NextResponse.json({
            appName: config.appName,
            logoUrl: config.logoUrl,
            themeColor: config.themeColor,
        });
    } catch (error) {
        return NextResponse.json(
            { error: 'Failed to fetch configuration' },
            { status: 500 }
        );
    }
}

export async function POST(req: NextRequest) {
    try {
        // Check for Admin Secret Key
        const secretKey = req.headers.get('x-admin-secret-key');
        if (secretKey !== process.env.ADMIN_SECRET_KEY) {
            return NextResponse.json(
                { error: 'Unauthorized: Invalid Admin Secret Key' },
                { status: 401 }
            );
        }

        const formData = await req.formData();
        const appName = formData.get('appName') as string | null;
        const themeColor = formData.get('themeColor') as string | null;
        const logo = formData.get('logo') as File | null;
        const scriptWriterPrompt = formData.get('scriptWriterPrompt') as string | null;
        const copilotSystemPrompt = formData.get('copilotSystemPrompt') as string | null;
        const copilotModel = formData.get('copilotModel') as string | null;
        const marketingCopywriterPrompt = formData.get('marketingCopywriterPrompt') as string | null;
        const copilotAssistantPrompt = formData.get('copilotAssistantPrompt') as string | null;
        const elevenlabsVoiceId = formData.get('elevenlabsVoiceId') as string | null;

        let aiProviders = null;
        const aiProvidersStr = formData.get('aiProviders') as string | null;
        if (aiProvidersStr) {
            try {
                aiProviders = JSON.parse(aiProvidersStr);

                // Transform from frontend representation back to veo3
                if (aiProviders.script === 'gemini') {
                    aiProviders.script = 'veo3';
                }
                if (aiProviders.image === 'nanobanana') {
                    aiProviders.image = 'veo3';
                }
            } catch (e) {
                console.warn('Failed to parse aiProviders JSON:', e);
            }
        }

        let apiKeys = null;
        const apiKeysStr = formData.get('apiKeys') as string | null;
        if (apiKeysStr) {
            try {
                apiKeys = JSON.parse(apiKeysStr);
            } catch (e) {
                console.warn('Failed to parse apiKeys JSON:', e);
            }
        }

        const newConfig: any = {};
        if (appName) newConfig.appName = appName;
        if (themeColor) newConfig.themeColor = themeColor;
        if (scriptWriterPrompt) newConfig.scriptWriterPrompt = scriptWriterPrompt;
        if (copilotSystemPrompt) newConfig.copilotSystemPrompt = copilotSystemPrompt;
        if (copilotModel) newConfig.copilotModel = copilotModel;
        if (marketingCopywriterPrompt) newConfig.marketingCopywriterPrompt = marketingCopywriterPrompt;
        if (copilotAssistantPrompt) newConfig.copilotAssistantPrompt = copilotAssistantPrompt;
        if (elevenlabsVoiceId) newConfig.elevenlabsVoiceId = elevenlabsVoiceId;
        if (aiProviders) newConfig.aiProviders = aiProviders;
        if (apiKeys) newConfig.apiKeys = apiKeys;

        if (logo) {
            const bytes = await logo.arrayBuffer();
            const buffer = Buffer.from(bytes);

            // Get current config to find old logo
            const currentConfig = getSiteConfig();
            const oldLogoUrl = currentConfig.logoUrl;

            // Create a unique filename to avoid caching issues
            const filename = `logo${path.extname(logo.name || '.png')}`;
            const publicDir = path.join(process.cwd(), 'public');
            const filePath = path.join(publicDir, filename);

            // Delete old logo if it exists and is different
            if (oldLogoUrl) {
                try {
                    // Extract filename from URL (remove query params if any)
                    const oldFilename = oldLogoUrl.split('?')[0].replace(/^\//, '');
                    if (oldFilename && oldFilename !== filename) {
                        const oldFilePath = path.join(publicDir, oldFilename);
                        await unlink(oldFilePath).catch(() => { }); // Ignore error if file doesn't exist
                    }
                } catch (e) {
                    // Ignore errors during cleanup
                    console.error('Error cleaning up old logo:', e);
                }
            }

            await writeFile(filePath, buffer);
            // Add timestamp for cache busting
            newConfig.logoUrl = `/${filename}?v=${Date.now()}`;
        }

        const updatedConfig = updateSiteConfig(newConfig);

        return NextResponse.json(
            { message: 'Configuration updated successfully', config: updatedConfig },
            { status: 200 }
        );
    } catch (error) {
        console.error('Error updating config:', error);
        return NextResponse.json(
            { error: 'Failed to update configuration' },
            { status: 500 }
        );
    }
}
