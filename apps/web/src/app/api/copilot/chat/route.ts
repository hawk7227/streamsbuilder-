import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentWorkspaceSelection } from '@/lib/team-server';

import { getSiteConfig } from '@/lib/config';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
import { updateHtmlContent } from '@/lib/html-editor';

interface UploadedAttachment {
    type?: 'knowledge' | 'asset' | string;
    extracted_content?: string;
    public_url?: string;
    name?: string;
}

interface StoredChatMessage {
    role: string;
    content: string;
    tool_calls?: unknown;
    tool_call_id?: string;
}

interface StoredChat {
    id: string;
    workspace_id: string;
    title: string;
    messages?: StoredChatMessage[];
}

interface ToolResultMessage {
    role: 'tool';
    tool_call_id: string;
    content: string;
}

const getErrorMessage = (error: unknown) =>
    error instanceof Error ? error.message : 'Unknown error';

const TOOLS = [
    {
        type: "function",
        function: {
            name: "update_html_content",
            description: "Update the HTML content of the landing page by replacing specific chunks of code. Use this when the user asks to change or modify existing elements (e.g., 'change button color', 'update text').",
            parameters: {
                type: "object",
                properties: {
                    chunks: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                targetContent: {
                                    type: "string",
                                    description: "The exact existing code chunk to be replaced. Must match exactly, including whitespace."
                                },
                                replacementContent: {
                                    type: "string",
                                    description: "The new code chunk to insert in place of the target content."
                                },
                                startLine: {
                                    type: "number",
                                    description: "Optional hint for the starting line number."
                                },
                                endLine: {
                                    type: "number",
                                    description: "Optional hint for the ending line number."
                                }
                            },
                            required: ["targetContent", "replacementContent"]
                        }
                    }
                },
                required: ["chunks"]
            }
        }
    }
];

export async function POST(request: Request) {
    const siteConfig = getSiteConfig();
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { chatId, message, attachments, title } = await request.json() as {
        chatId?: string;
        message?: string;
        attachments?: UploadedAttachment[];
        title?: string;
    };

    if (!message && (!attachments || attachments.length === 0)) {
        return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const admin = createAdminClient();
    let workspaceId: string;
    try {
        const selection = await getCurrentWorkspaceSelection(admin, user);
        workspaceId = selection.current.workspace.id;
    } catch (err: unknown) {
        return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
    }

    let chat: StoredChat | null = null;
    let isNew = false;

    if (chatId && !chatId.startsWith('new-')) {
        const { data } = await admin.from('copilot_chats').select('*').eq('id', chatId).single<StoredChat>();
        if (data && data.workspace_id === workspaceId) {
            chat = data;
        }
    }

    if (!chat) {
        // Create new chat
        const chatTitle =
            typeof title === 'string' && title.trim()
                ? title.trim().substring(0, 100)
                : message
                ? message.substring(0, 50)
                : 'New Chat';
        const { data, error } = await admin.from('copilot_chats').insert({
            user_id: user.id,
            workspace_id: workspaceId,
            title: chatTitle,
            messages: [],
        }).select().single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        chat = data;
        isNew = true;
    }

    if (!chat) {
        return NextResponse.json({ error: 'Failed to create chat' }, { status: 500 });
    }

    const chatRecord = chat;

    // Construct message history for OpenAI
    const currentMessages = chatRecord.messages || [];

    let contextText = '';
    const assetsList = [];

    // Fetch existing landing page HTML to provide context for editing
    let currentHtmlContent = '';
    let landingPageId = null;
    let landingPageVersion = 0;

    {
        const { data: lpData } = await admin
            .from('landing_pages')
            .select('id, html_content, version')
            .eq('copilot_chat_id', chatRecord.id)
            .single();
        if (lpData) {
            currentHtmlContent = lpData.html_content;
            landingPageId = lpData.id;
            landingPageVersion = lpData.version;

            // Add current HTML to context (truncated if too large? For now assume it fits)
            // It's crucial for the replacement tool to know the exact content.
            // contextText += `\n--- Current Landing Page HTML ---\n${currentHtmlContent}\n----------------\n`;
            // Better to add it as a separate system-like context or just user context
        }
    }

    if (attachments && attachments.length > 0) {
        for (const file of attachments) {
            // Note: input 'attachments' come from frontend which got them from /api/files/upload response
            // So they should have 'extracted_content', 'public_url', 'type', 'name'
            if (file.type === 'knowledge' && file.extracted_content) {
                contextText += `\n--- Context from file: ${file.name} ---\n${file.extracted_content}\n----------------\n`;
            } else if (file.type === 'asset' && file.public_url) {
                assetsList.push(`- ${file.name}: ${file.public_url}`);
            }
        }
    }

    let finalUserContent = message || '';
    if (contextText) {
        finalUserContent += `\n\nReference Context:\n${contextText}`;
    }
    if (assetsList.length > 0) {
        finalUserContent += `\n\nAvailable Assets (use these URLs if relevant):\n${assetsList.join('\n')}`;
    }

    if (currentHtmlContent) {
        finalUserContent += `\n\n--- CURRENT HTML CONTENT (for editing) ---\n${currentHtmlContent}\n--- END HTML CONTENT ---`;
        finalUserContent += `\n\nTo make changes, please use the 'update_html_content' tool. You must use the exact strings from the content above as 'targetContent'.`;
    }

    // Message object to store in DB (includes attachments for UI)
    const userMessageForDb = {
        role: 'user',
        content: finalUserContent, // Or original message? Usually we store the full context so we know what was sent.
        original_content: message, // Store original input for cleaner UI if needed (optional)
        attachments: attachments
    };

    // Message object for OpenAI (strict schema)
    const userMessageForAi = { role: 'user', content: finalUserContent };

    const messagesToSend = [
        { role: 'system', content: siteConfig.copilotSystemPrompt },
        ...currentMessages.map((m) => {
            const msg: StoredChatMessage = { role: m.role, content: m.content };
            if (m.tool_calls) {
                msg.tool_calls = m.tool_calls;
            }
            if (m.tool_call_id) {
                msg.tool_call_id = m.tool_call_id;
            }
            return msg;
        }),
        userMessageForAi
    ];

    try {
        const response = await fetch(OPENAI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: siteConfig.copilotModel,
                messages: messagesToSend,
                tools: TOOLS,
                tool_choice: "auto"
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || 'Failed to call OpenAI');
        }

        const completion = await response.json();
        const assistantMessage = completion.choices[0].message;
        console.log("--> Open AI Response:", assistantMessage);

        // Handle Tool Calls
        if (assistantMessage.tool_calls) {
            console.log("--> Tool Calls detected:", JSON.stringify(assistantMessage.tool_calls, null, 2));

            // Process ALL tool calls, not just the first one
            const toolResultMessages: ToolResultMessage[] = [];
            let finalHtml = currentHtmlContent;

            for (const toolCall of assistantMessage.tool_calls) {
                if (toolCall.function.name === 'update_html_content') {
                    console.log(`--> Executing tool: ${toolCall.function.name}`);
                    try {
                        const args = JSON.parse(toolCall.function.arguments);
                        console.log("--> Tool Arguments:", JSON.stringify(args, null, 2));

                        if (finalHtml && args.chunks) {
                            const newHtml = updateHtmlContent(finalHtml, args.chunks);

                            // Check if content actually changed
                            if (newHtml === finalHtml) {
                                console.warn("--> WARNING: html content did not change after replacement tool.");
                            } else {
                                console.log("--> SUCCESS: html content updated.");
                                finalHtml = newHtml; // Update for next iteration
                            }

                            // Create tool result message for this specific tool call
                            const toolResultMessage: ToolResultMessage = {
                                role: 'tool' as const,
                                tool_call_id: String(toolCall.id),
                                content: JSON.stringify({ success: true, message: "HTML updated successfully" })
                            };
                            toolResultMessages.push(toolResultMessage);
                        } else {
                            console.warn("--> Tool execution skipped: Missing currentHtmlContent or args.chunks");
                            if (!finalHtml) console.warn("--> currentHtmlContent is empty/null");
                            if (!args.chunks) console.warn("--> args.chunks is missing");

                            // Still need to respond with a tool message even if it failed
                            const toolResultMessage: ToolResultMessage = {
                                role: 'tool' as const,
                                tool_call_id: String(toolCall.id),
                                content: JSON.stringify({ success: false, message: "Missing HTML content or chunks" })
                            };
                            toolResultMessages.push(toolResultMessage);
                        }
                    } catch (e) {
                        console.error("--> Tool execution failed with error:", e);

                        // Send error as tool result
                        const toolResultMessage: ToolResultMessage = {
                            role: 'tool' as const,
                            tool_call_id: String(toolCall.id),
                            content: JSON.stringify({ success: false, message: `Error: ${e}` })
                        };
                        toolResultMessages.push(toolResultMessage);
                    }
                } else {
                    console.log(`--> Unknown tool called: ${toolCall.function.name}`);

                    // Still respond to unknown tools
                    const toolResultMessage: ToolResultMessage = {
                        role: 'tool' as const,
                        tool_call_id: String(toolCall.id),
                        content: JSON.stringify({ success: false, message: "Unknown tool" })
                    };
                    toolResultMessages.push(toolResultMessage);
                }
            }

            // Update DB with final HTML if it changed
            if (finalHtml !== currentHtmlContent && landingPageId) {
                await admin.from('landing_pages').update({
                    html_content: finalHtml,
                    updated_at: new Date().toISOString(),
                    version: landingPageVersion + 1
                }).eq('id', landingPageId);
                console.log(`--> Database updated for landingPageId: ${landingPageId}`);
            } else if (!landingPageId && finalHtml !== currentHtmlContent) {
                console.error("--> ERROR: landingPageId is missing, cannot update DB.");
            }

            // Update chat history with all messages
            const updatedMessagesWithTool = [...currentMessages, userMessageForDb, assistantMessage];

            const confirmationMessage = {
                role: 'assistant',
                content: "I've updated the landing page based on your request."
            };

            await admin.from('copilot_chats').update({
                messages: [...updatedMessagesWithTool, ...toolResultMessages, confirmationMessage],
                updated_at: new Date().toISOString(),
            }).eq('id', chatRecord.id);

            return NextResponse.json({
                chatId: chatRecord.id,
                message: confirmationMessage,
                isNew,
                updatedHtml: finalHtml
            });
        } else {
            console.log("--> No tool calls returned from OpenAI.");
        }

        // Default handling (No tool call or failed tool call logic fallthrough - though we returned above)
        // If we didn't return above, we proceed as normal text generation

        // Update chat with both messages
        const updatedMessages = [...currentMessages, userMessageForDb, assistantMessage];

        await admin.from('copilot_chats').update({
            messages: updatedMessages,
            updated_at: new Date().toISOString(),
        }).eq('id', chatRecord.id);

        // Check for HTML content to save to landing_pages (OLD LOGIC - kept for 'generate new' flow)
        const content = assistantMessage.content || '';
        if (content.includes('<!DOCTYPE html>') || content.includes('<html')) {
            // Extract HTML
            const htmlMatch = content.match(/```html([\s\S]*?)```/) || content.match(/```([\s\S]*?)```/); // Simple extraction
            const htmlContent = htmlMatch ? htmlMatch[1] : content;

            // Save/Update landing page if it looks like HTML
            if (htmlContent.includes('<html') || htmlContent.includes('<div')) {
                // We already fetched 'lpData' above (landingPageId)

                if (landingPageId) {
                    await admin.from('landing_pages').update({
                        html_content: htmlContent,
                        updated_at: new Date().toISOString(),
                        version: landingPageVersion + 1
                    }).eq('id', landingPageId);
                } else {
                    await admin.from('landing_pages').insert({
                        user_id: user.id,
                        workspace_id: workspaceId,
                        copilot_chat_id: chatRecord.id,
                        html_content: htmlContent,
                        title: chatRecord.title + ' Landing Page',
                        description: 'Generated from copilot chat',
                    });
                }
            }
        }

        // Return the response, chatId (for redirect if new), and updatedMessages if needed
        // But frontend usually just wants the new message or success
        return NextResponse.json({
            chatId: chatRecord.id,
            message: assistantMessage,
            isNew
        });

    } catch (err: unknown) {
        console.error("OpenAI Error:", err);
        return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
    }
}
