import React, { useState, useRef, useEffect } from 'react';
import { Icons } from './Icons';
import { Button, ContextWarning, CompactingOverlay } from './Overlays';
import { CompressionModal } from './Modals';
import { useFileUpload } from '../hooks/useCopilot';
import { useCompaction, Message } from '../hooks/useCopilot';
import { extractCodeFromContent } from '../utils';

interface PreviewData {
    html_content?: string;
}

interface ChatRecord {
    messages?: Message[];
    landingPage?: PreviewData | null;
}

interface ChatResponse {
    data?: ChatRecord;
}

interface AttachmentChip {
    id: string;
    name: string;
    icon?: React.ReactNode;
    preview?: string;
}

interface ChatInterfaceProps {
    chatId: string | null;
    onChatCreated?: (newId: string) => void;
    previewOpen: boolean;
    setPreviewOpen: React.Dispatch<React.SetStateAction<boolean>>;
    setPreviewCode: React.Dispatch<React.SetStateAction<string>>;
    setPreviewLanguage: React.Dispatch<React.SetStateAction<string>>;
    conversationTitle?: string;
}

const TypingIndicator = () => (
    <div className="flex space-x-1.5 p-2 bg-zinc-800 rounded-xl rounded-tl-none w-fit">
        <div className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
        <div className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
        <div className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce"></div>
    </div>
);

const MessageContent = ({ content, isThinking }: { content: string, isThinking?: boolean }) => {
    if (isThinking) {
        return <div className="text-zinc-400 italic flex items-center gap-2">{Icons.sparkles} Thinking...</div>;
    }

    const parts = content.split(/(```[\s\S]*?```)/g);

    return (
        <div className="space-y-3">
            {parts.map((part, index) => {
                if (part.startsWith('```')) {
                    const match = part.match(/```(\w+)?\n([\s\S]*?)```/);
                    if (!match) return null;
                    const language = match[1] || 'text';
                    const code = match[2];
                    
                    const copyToClipboard = () => {
                        navigator.clipboard.writeText(code);
                    };

                    return (
                        <div key={index} className="rounded-lg overflow-hidden border border-zinc-800 bg-zinc-950 my-2">
                            <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900 border-b border-zinc-800">
                                <span className="text-xs font-medium text-zinc-400 uppercase">{language}</span>
                                <button 
                                    onClick={copyToClipboard}
                                    className="text-zinc-500 hover:text-zinc-300 text-xs flex items-center gap-1 transition-colors"
                                >
                                    {Icons.copy} Copy
                                </button>
                            </div>
                            <div className="p-3 overflow-x-auto">
                                <pre className="text-sm font-mono text-zinc-300">
                                    <code>{code}</code>
                                </pre>
                            </div>
                        </div>
                    );
                }
                // Handle regular text with basic formatting if needed, or just whitespace-pre-wrap
                return part.trim() ? (
                    <div key={index} className="whitespace-pre-wrap text-zinc-200">
                        {part}
                    </div>
                ) : null;
            })}
        </div>
    );
};

const MessageSkeleton = () => (
    <div className="space-y-6 max-w-3xl mx-auto p-4 animate-pulse">
        {[1, 2, 3].map((i) => (
            <div key={i} className={`flex gap-4 ${i % 2 === 0 ? 'justify-end' : ''}`}>
                {i % 2 !== 0 && <div className="w-9 h-9 rounded-full bg-zinc-800" />}
                <div className={`h-16 rounded-2xl ${i % 2 === 0 ? 'bg-zinc-800 w-2/3' : 'bg-zinc-900 w-3/4'}`} />
                {i % 2 === 0 && <div className="w-9 h-9 rounded-full bg-zinc-800" />}
            </div>
        ))}
    </div>
);

export default function ChatInterface({ chatId, onChatCreated, previewOpen, setPreviewOpen, setPreviewCode, setPreviewLanguage, conversationTitle }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [contextTokens, setContextTokens] = useState(0);
  const [showCompressionModal, setShowCompressionModal] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null); // kept for layout anchor (no scrollIntoView)
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { isCompacting, compactProgress, compactStage } = useCompaction();
  const { files: attachedFiles, dragActive, addFiles, removeFile, clearFiles, updateFileType, handleDrag, handleDrop } = useFileUpload();

  useEffect(() => {
    if (chatId) {
        setIsLoadingMessages(true);
        fetch(`/api/copilot/chat/${chatId}`)
            .then(res => res.json())
            .then((data: ChatResponse) => {
                if (data.data) {
                    setMessages(data.data.messages || []);
                    
                    // Prioritize finding the latest HTML content from landing_pages
                    if (data.data.landingPage?.html_content) {
                         setPreviewCode(data.data.landingPage.html_content);
                         setPreviewLanguage('html');
                         if (!previewOpen) setPreviewOpen(true);
                    } else if (data.data.messages) {
                        // Check last message for code
                        const lastMsg = data.data.messages[data.data.messages.length - 1];
                        if (lastMsg?.role === 'assistant') {
                            const extracted = extractCodeFromContent(lastMsg.content);
                            if (extracted) {
                                setPreviewCode(extracted.code);
                                setPreviewLanguage(extracted.language);
                                if (!previewOpen) setPreviewOpen(true);
                            } else {
                                setPreviewCode('');
                                setPreviewOpen(false);
                            }
                        } else {
                            setPreviewCode('');
                            setPreviewOpen(false);
                        }
                    } else {
                        setPreviewCode('');
                        setPreviewOpen(false);
                    }
                }
            })
            .catch(err => console.error(err))
            .finally(() => setIsLoadingMessages(false));
    } else {
        setMessages([]);
        setIsLoadingMessages(false);
        setPreviewCode('');
        setPreviewOpen(false);
    }
  }, [chatId, previewOpen, setPreviewCode, setPreviewLanguage, setPreviewOpen]);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (el) {
      requestAnimationFrame(() => {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      });
    }
    const tokens = messages.reduce((acc, m) => acc + Math.ceil((m.content?.length || 0) / 4), 0);
    setContextTokens(tokens);
  }, [messages, isLoadingMessages]);

  const handleSubmit = async () => {
    if ((!input.trim() && attachedFiles.length === 0) || isGenerating) return;

    const readyFiles = attachedFiles.filter(f => f.status === 'ready');
    
    // Optimistic UI update
    const userMessage: Message = { 
        role: 'user', 
        content: input, 
        attachments: readyFiles.map(f => ({ id: f.id, name: f.name, size: f.size, icon: f.icon, preview: f.preview, uploadType: f.uploadType })) 
    };
    
    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    setInput('');
    clearFiles();
    setIsGenerating(true);

    try {
        // Upload files first
        const uploadedAttachments = [];
        for (const file of readyFiles) {
            const formData = new FormData();
            formData.append('file', file.raw);
            formData.append('type', file.uploadType);

            try {
                const uploadRes = await fetch('/api/files/upload', {
                    method: 'POST',
                    body: formData
                });
                
                if (uploadRes.ok) {
                    const { data } = await uploadRes.json();
                    uploadedAttachments.push(data);
                } else {
                    console.error('Failed to upload file', file.name);
                }
            } catch (err) {
                 console.error('Error uploading file', file.name, err);
            }
        }

        const res = await fetch('/api/copilot/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chatId,
                title: conversationTitle,
                message: currentInput,
                attachments: uploadedAttachments // Send the uploaded file records
            })
        });

        if (!res.ok) throw new Error('Failed to send message');

        const data = await res.json();
        
        if (data.isNew && onChatCreated) {
            onChatCreated(data.chatId);
        }

        if (data.message) {
            setMessages(prev => [...prev, data.message]);
            
            // If the backend returned updated HTML (from tool execution), use it!
            if (data.updatedHtml) {
                 setPreviewCode(data.updatedHtml);
                 setPreviewLanguage('html');
                 if (!previewOpen) setPreviewOpen(true);
            } else {
                // Otherwise try to extract from valid code blocks
                const extracted = extractCodeFromContent(data.message.content);
                if (extracted) {
                    setPreviewCode(extracted.code);
                    setPreviewLanguage(extracted.language);
                    if (!previewOpen) setPreviewOpen(true);
                }
            }
        }
    } catch (error) {
        console.error('Error sending message:', error);
        setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }]);
    } finally {
        setIsGenerating(false);
    }
  };

  return (
    <div className="flex h-full w-full bg-zinc-950 relative" onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}>
        <CompactingOverlay isVisible={isCompacting} progress={compactProgress} stage={compactStage} />
        
        <div className="flex-1 flex flex-col min-w-0 relative h-full">
            {dragActive && (
                <div className="absolute inset-0 bg-zinc-950/90 flex items-center justify-center z-20 border-2 border-dashed border-emerald-500 m-2 rounded-xl">
                    <div className="text-center">
                        <div className="w-16 h-16 mx-auto mb-4 text-emerald-400">{Icons.upload}</div>
                        <p className="text-lg font-medium text-zinc-100">Drop files here</p>
                    </div>
                </div>
            )}

            <ContextWarning tokens={contextTokens} onCompress={() => setShowCompressionModal(true)} onNewChat={() => setMessages([])} />

            <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 scrollbar-thin">
                <div className="max-w-3xl mx-auto space-y-6">
                    {isLoadingMessages ? (
                        <MessageSkeleton />
                    ) : messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4">
                            <div className="w-16 h-16 mb-6 text-zinc-700">{Icons.sparkles}</div>
                            <h1 className="text-2xl font-semibold text-zinc-100 mb-2">How can I help you today?</h1>
                            <p className="text-zinc-500 max-w-md mb-8">Ask me to build UI components, write code, or help with any task.</p>
                            <div className="grid grid-cols-2 gap-3 max-w-lg w-full">
                                {['Build a counter', 'Create a login form', 'Design a dashboard', 'Write an API endpoint'].map(s => (
                                    <button key={s} onClick={() => setInput(s)} className="p-3 text-sm text-left bg-zinc-900 border border-zinc-800 rounded-xl hover:border-zinc-700 transition-colors text-zinc-300">
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <>
                            {messages.filter(msg => {
                                // Filter out raw JSON success messages from tool calls
                                if (msg.role === 'assistant' && typeof msg.content === 'string') {
                                    const trimmed = msg.content.trim();
                                    return !(trimmed.startsWith('{') && trimmed.endsWith('}') && (trimmed.includes('"success":') || trimmed.includes('"message":')));
                                }
                                return true;
                            }).map((msg, idx) => (
                                <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                                     {msg.role === 'assistant' && (
                                         <div className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 text-white font-semibold text-sm">S</div>
                                     )}
                                     <div className={`max-w-[85%] min-w-0 ${msg.role === 'user' ? 'bg-zinc-800 rounded-2xl rounded-tr-sm px-4 py-3' : 'w-full'}`}>
                                         {msg.attachments && msg.attachments.length > 0 && (
                                             <div className="flex flex-wrap gap-2 mb-2">
                                                 {msg.attachments.map((att: AttachmentChip) => (
                                                     <div key={att.id} className="flex items-center gap-2 px-2 py-1 bg-zinc-700 rounded-lg text-xs text-zinc-300">
                                                         {att.preview ? <img src={att.preview} className="w-6 h-6 rounded object-cover" alt="" /> : <span>{att.icon}</span>}
                                                         <span>{att.name}</span>
                                                     </div>
                                                 ))}
                                             </div>
                                         )}
                                         <div className={`prose max-w-none text-zinc-100 text-sm leading-relaxed ${msg.role === 'user' ? 'whitespace-pre-wrap' : ''}`}>
                                             {msg.role === 'user' ? (
                                                 msg.content
                                             ) : (
                                                 <MessageContent content={msg.content || ''} isThinking={msg.tool_calls && !msg.content} />
                                             )}
                                         </div>
                                     </div>
                                     {msg.role === 'user' && (
                                         <div className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full bg-zinc-700 text-white font-semibold text-sm">M</div>
                                     )}
                                </div>
                            ))}
                            
                            {isGenerating && (
                                <div className="flex gap-4">
                                    <div className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 text-white font-semibold text-sm">S</div>
                                    <div className="flex items-center">
                                        <TypingIndicator />
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                    <div ref={messagesEndRef} />
                </div>
            </div>
            
            {attachedFiles.length > 0 && (
                <div className="px-4 py-2 border-t border-zinc-800 bg-zinc-900/30">
                    <div className="max-w-3xl mx-auto flex flex-wrap gap-2">
                        {attachedFiles.map(f => (
                            <div key={f.id} className="flex items-center gap-2 px-2.5 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm">
                                {f.preview ? <img src={f.preview} className="w-6 h-6 rounded object-cover" alt="" /> : <span>{f.icon}</span>}
                                <div className="flex flex-col">
                                    <span className="max-w-[120px] truncate text-zinc-300">{f.name}</span>
                                    <button 
                                        onClick={() => updateFileType(f.id, f.uploadType === 'asset' ? 'knowledge' : 'asset')}
                                        className={`text-[10px] text-left uppercase font-bold tracking-wider ${f.uploadType === 'asset' ? 'text-purple-400' : 'text-blue-400'}`}
                                        title="Click to toggle type"
                                    >
                                        {f.uploadType === 'asset' ? 'Asset' : 'Knowledge'}
                                    </button>
                                </div>
                                <button onClick={() => removeFile(f.id)} className="text-zinc-500 hover:text-red-400 ml-2">x</button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="border-t border-zinc-800 bg-zinc-900/50 p-4">
                <div className="max-w-3xl mx-auto">
                    <input type="file" ref={fileInputRef} multiple onChange={e => { addFiles(e.target.files); e.target.value = ''; }} className="hidden" />
                    <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl overflow-hidden focus-within:ring-2 focus-within:ring-emerald-500/50 focus-within:border-emerald-500">
                        <div className="flex items-end">
                            <button onClick={() => fileInputRef.current?.click()} className="flex-shrink-0 p-3 text-zinc-500 hover:text-zinc-300 transition-colors" title="Attach files">
                                {Icons.paperclip}
                            </button>
                            <textarea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
                                placeholder="Message StreamsAI... (drop files here)"
                                rows={1}
                                className="flex-1 px-2 py-3 bg-transparent text-zinc-100 placeholder:text-zinc-500 resize-none focus:outline-none text-sm"
                            />
                            <div className="flex-shrink-0 flex items-center gap-2 p-2">
                                {isGenerating ? (
                                    <Button variant="ghost" size="icon-sm" onClick={() => setIsGenerating(false)}>{Icons.stop}</Button>
                                ) : (
                                    <Button variant="primary" size="icon-sm" onClick={handleSubmit} disabled={!input.trim() && attachedFiles.length === 0}>{Icons.send}</Button>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center justify-center gap-4 mt-2">
                        <p className="text-xs text-zinc-600">StreamsAI can make mistakes.</p>
                        {contextTokens >= 80000 && (
                             <button onClick={() => setShowCompressionModal(true)} className="text-xs text-amber-500 hover:text-amber-400 flex items-center gap-1">
                                {Icons.compress} Compact
                             </button>
                        )}
                    </div>
                </div>
            </div>
        </div>

        <CompressionModal isOpen={showCompressionModal} onClose={() => setShowCompressionModal(false)} onApply={() => {}} currentTokens={contextTokens} />
    </div>
  );
}
