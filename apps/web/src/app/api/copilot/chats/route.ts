import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentWorkspaceSelection } from '@/lib/team-server';

interface ChatRow {
    id: string;
    title: string | null;
    created_at: string;
    updated_at: string;
    messages: Array<{ content?: string }> | null;
}

const getErrorMessage = (error: unknown) =>
    error instanceof Error ? error.message : 'Unknown error';

export async function GET() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();
    try {
        const selection = await getCurrentWorkspaceSelection(admin, user);
        const workspaceId = selection.current.workspace.id;

        const { data: chats, error } = await admin
            .from('copilot_chats')
            .select('id, title, created_at, updated_at, messages')
            .eq('workspace_id', workspaceId)
            .order('updated_at', { ascending: false });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const formattedChats = (chats as ChatRow[]).map((chat) => {
            const messages = chat.messages || [];
            const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
            // Get a preview from the last message or empty string
            let preview = '';
            if (lastMessage && typeof lastMessage.content === 'string') {
                preview = lastMessage.content.substring(0, 100);
            } else if (messages.length > 0) {
                preview = '...';
            }

            // Format date (simple ISO string, client handles display)
            // Using created_at for 'date' field to match existing UI mock logic if needed, 
            // but updated_at is better for sorting.
            // The UI expects 'date' string.
            const updatedDate = new Date(chat.updated_at);
            const now = new Date();
            let dateString = updatedDate.toLocaleDateString();

            // Simple "Today/Yesterday" logic
            if (updatedDate.toDateString() === now.toDateString()) {
                dateString = 'Today';
            } else {
                const yesterday = new Date(now);
                yesterday.setDate(now.getDate() - 1);
                if (updatedDate.toDateString() === yesterday.toDateString()) {
                    dateString = 'Yesterday';
                }
            }

            return {
                id: chat.id,
                title: chat.title || 'New Chat',
                date: dateString,
                preview: preview,
                updatedAt: chat.updated_at,
            };
        });

        return NextResponse.json({ data: formattedChats });
    } catch (err: unknown) {
        return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { title } = await request.json() as { title?: string };
    const nextTitle = typeof title === 'string' ? title.trim().substring(0, 100) : '';

    if (!nextTitle) {
        return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const admin = createAdminClient();

    try {
        const selection = await getCurrentWorkspaceSelection(admin, user);
        const workspaceId = selection.current.workspace.id;

        const { data, error } = await admin
            .from('copilot_chats')
            .insert({
                user_id: user.id,
                workspace_id: workspaceId,
                title: nextTitle,
                messages: [],
            })
            .select('id, title')
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ data });
    } catch (err: unknown) {
        return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
    }
}
