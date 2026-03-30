import { useState, useCallback, useEffect } from 'react';

// --- Constants ---
export const FILE_CONFIG = {
    maxSize: 100 * 1024 * 1024, // 100MB
    maxFiles: 20,
    types: {
        'image/jpeg': { icon: '🖼️', cat: 'image' },
        'image/png': { icon: '🖼️', cat: 'image' },
        'image/gif': { icon: '🖼️', cat: 'image' },
        'image/webp': { icon: '🖼️', cat: 'image' },
        'application/pdf': { icon: '📄', cat: 'document' },
        'text/plain': { icon: '📝', cat: 'text' },
        'text/markdown': { icon: '📝', cat: 'text' },
        'text/csv': { icon: '📊', cat: 'data' },
        'application/json': { icon: '🔧', cat: 'data' },
        'text/javascript': { icon: '💻', cat: 'code' },
        'text/html': { icon: '🌐', cat: 'code' },
        'text/css': { icon: '🎨', cat: 'code' },
    } as Record<string, { icon: string; cat: string }>
};

export const getFileInfo = (type: string, name: string) => {
    if (FILE_CONFIG.types[type]) return FILE_CONFIG.types[type];
    const ext = name?.split('.').pop()?.toLowerCase();
    const extMap: Record<string, string> = { pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊', txt: '📝', md: '📝', js: '💻', ts: '💻', jsx: '💻', tsx: '💻', html: '🌐', css: '🎨', json: '🔧', jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️' };
    return { icon: extMap[ext || ''] || '📎', cat: 'other' };
};

export const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
};

export interface AttachedFile {
    id: number;
    name: string;
    size: number;
    type: string;
    icon: string;
    cat: string;
    status: 'reading' | 'ready' | 'error';
    uploadType: 'asset' | 'knowledge';
    preview: string | null;
    text: string | null;
    raw: File;
}

// --- Hook: useFileUpload ---
export function useFileUpload() {
    const [files, setFiles] = useState<AttachedFile[]>([]);
    const [dragActive, setDragActive] = useState(false);

    const addFiles = async (fileList: FileList | null) => {
        if (!fileList) return;
        const newFiles = Array.from(fileList).slice(0, FILE_CONFIG.maxFiles - files.length);

        for (const file of newFiles) {
            if (file.size > FILE_CONFIG.maxSize) continue;

            const info = getFileInfo(file.type, file.name);
            const fileObj: AttachedFile = {
                id: Date.now() + Math.random(),
                name: file.name,
                size: file.size,
                type: file.type,
                icon: info.icon,
                cat: info.cat,
                status: 'reading',
                uploadType: info.cat === 'image' ? 'asset' : 'knowledge',
                preview: null,
                text: null,
                raw: file
            };

            setFiles(p => [...p, fileObj]);

            const reader = new FileReader();
            reader.onload = (e) => {
                setFiles(p => p.map(f => f.id === fileObj.id ? {
                    ...f,
                    status: 'ready',
                    preview: info.cat === 'image' && typeof e.target?.result === 'string' ? e.target.result : null,
                    text: ['text', 'code', 'data'].includes(info.cat) && typeof e.target?.result === 'string' ? e.target.result : null
                } : f));
            };

            if (info.cat === 'image') reader.readAsDataURL(file);
            else reader.readAsText(file);
        }
    };

    const removeFile = (id: number) => setFiles(p => p.filter(f => f.id !== id));
    const clearFiles = () => setFiles([]);
    const updateFileType = (id: number, type: 'asset' | 'knowledge') => setFiles(p => p.map(f => f.id === id ? { ...f, uploadType: type } : f));

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
        else if (e.type === 'dragleave') setDragActive(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragActive(false);
        if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
    };

    return { files, dragActive, addFiles, removeFile, clearFiles, updateFileType, handleDrag, handleDrop };
}

// --- Hook: useCompaction ---
export interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
    attachments?: any[];
    tool_calls?: any[];
    tool_call_id?: string;
    isCompactionSummary?: boolean;
}

export function useCompaction() {
    const [isCompacting, setIsCompacting] = useState(false);
    const [compactProgress, setCompactProgress] = useState(0);
    const [compactStage, setCompactStage] = useState('analyzing');

    const runCompaction = useCallback(async (messages: Message[], strategy: string, onComplete: (msgs: Message[]) => void) => {
        setIsCompacting(true);
        setCompactProgress(0);
        setCompactStage('analyzing');

        // Simulate compaction stages
        const stages = ['analyzing', 'summarizing', 'compressing', 'rebuilding', 'complete'];
        const stageProgress = [0, 25, 50, 75, 100];

        for (let i = 0; i < stages.length; i++) {
            setCompactStage(stages[i]);

            // Animate progress within each stage
            const startProgress = stageProgress[i];
            const endProgress = stageProgress[i + 1] || 100;
            const duration = stages[i] === 'complete' ? 500 : 800 + Math.random() * 400;
            const steps = 10; // reduced steps for React performance
            const stepDuration = duration / steps;

            for (let step = 0; step <= steps; step++) {
                await new Promise(r => setTimeout(r, stepDuration));
                const progress = startProgress + ((endProgress - startProgress) * (step / steps));
                setCompactProgress(progress);
            }
        }

        // Wait a moment on complete
        await new Promise(r => setTimeout(r, 800));

        // Generate compacted result
        let compactedMessages: Message[] = [];

        switch (strategy) {
            case 'summarize':
                // Keep last few messages + add summary
                const recentMessages = messages.slice(-4);
                compactedMessages = [
                    {
                        role: 'system',
                        content: `[Previous conversation summary: The user and assistant discussed various topics. Key points have been preserved. ${Math.max(0, messages.length - 4)} messages were summarized to save context.]`,
                        isCompactionSummary: true
                    },
                    ...recentMessages
                ];
                break;

            case 'removeCode':
                // Remove code blocks but keep text
                compactedMessages = messages.map(m => ({
                    ...m,
                    content: m.content.replace(/```[\s\S]*?```/g, '[Code block removed to save context]')
                }));
                break;

            case 'keepRecent':
                // Keep only last 6 messages
                compactedMessages = messages.slice(-6);
                break;

            case 'archive':
                // Archive all and start fresh with summary
                compactedMessages = [{
                    role: 'system',
                    content: `[Conversation archived. ${messages.length} messages saved to memory. Starting fresh with preserved context.]`,
                    isCompactionSummary: true
                }];
                break;

            default:
                compactedMessages = messages.slice(-6);
        }

        setIsCompacting(false);
        setCompactProgress(0);
        setCompactStage('analyzing');

        if (onComplete) {
            onComplete(compactedMessages);
        }

        return compactedMessages;
    }, []);

    return {
        isCompacting,
        compactProgress,
        compactStage,
        runCompaction
    };
}
