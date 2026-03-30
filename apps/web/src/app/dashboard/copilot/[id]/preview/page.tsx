"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { extractCodeFromContent, generatePreviewHtml } from '../../utils';

export default function PreviewPage() {
    const params = useParams();
    const chatId = params?.id as string;
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (chatId) {
            fetch(`/api/copilot/chat/${chatId}`)
                .then(res => res.json())
                .then(data => {
                    if (data.data) {
                         // Prioritize fetched landing page HTML
                         if (data.data.landingPage?.html_content) {
                             setCode(data.data.landingPage.html_content);
                         } else if (data.data.messages) {
                             // Fallback to extracting from last assistant message
                             const lastMsg = data.data.messages.filter((m: any) => m.role === 'assistant').pop();
                             if (lastMsg) {
                                 const extracted = extractCodeFromContent(lastMsg.content);
                                 if (extracted) {
                                     setCode(extracted.code);
                                 } else {
                                     setError('No code found in this chat.');
                                 }
                             } else {
                                 setError('No assistant messages found.');
                             }
                         }
                    }
                })
                .catch(err => {
                    console.error(err);
                    setError('Failed to load chat.');
                })
                .finally(() => setLoading(false));
        }
    }, [chatId]);

    const previewHtml = useMemo(() => generatePreviewHtml(code), [code]);

    const iframeSrc = useMemo(() => {
        if (!previewHtml) return 'about:blank';
        const blob = new Blob([previewHtml], { type: 'text/html' });
        return URL.createObjectURL(blob);
    }, [previewHtml]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen bg-zinc-950 text-zinc-400">
                <div className="animate-pulse">Loading preview...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-screen bg-zinc-950 text-red-400">
                {error}
            </div>
        );
    }

    return (
        <div className="w-screen h-screen overflow-hidden bg-white">
             {code && (
                <iframe 
                    src={iframeSrc} 
                    className="w-full h-full border-0" 
                    title="Preview" 
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals" 
                />
             )}
        </div>
    );
}
