'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AIAssistantShell } from '@/components/ai-chat/AIAssistantShell';
import { AssistantMessageList } from '@/components/ai-chat/AssistantMessageList';
import type { AssistantMessageShape } from '@/components/ai-chat/AssistantMessage';
import { AttachmentRail } from '@/components/ai-chat/AttachmentRail';
import { ContextChips } from '@/components/ai-chat/ContextChips';
import { VoiceBar } from '@/components/ai-chat/VoiceBar';
import { useAssistantContextBridge } from '@/components/ai-chat/useAssistantContextBridge';
import type { AssistantMode } from '@/lib/enforcement/types';
import { registerActivityStreamMiddleware, ActivityController } from '@/lib/activity-stream/index';
import { ActivityStreamBar } from '@/lib/activity-stream/ActivityStreamBar';
import { extractArtifactFromBuffer } from '@/lib/activity-stream/code-extractor';
import type { ExtractedArtifact } from '@/lib/activity-stream/code-extractor';


import { FloatingPreviewPanel } from '@/components/pipeline/FloatingPreviewPanel';
import { LivePreviewRenderer } from '@/components/pipeline/LivePreviewRenderer';
interface Action { type: string; payload: Record<string, unknown>; }

interface ConversationItem {
  id: string;
  title: string;
  date: string;
  preview: string;
  updatedAt: string;
}

type SidebarView = 'home' | 'history' | 'search' | 'projects' | 'apps';

export interface ProactiveMessage {
  id: string;
  text: string;
  imageUrl?: string;
  type: 'generation_complete' | 'pipeline_result' | 'generation_failed';
}

interface AIAssistantProps {
  context: Record<string, unknown>;
  onApplyPrompt?: (prompt: string) => void;
  onUpdateSettings?: (key: string, value: string) => void;
  onGenerateImage?: (conceptId?: string, prompt?: string) => void;
  onGenerateVideo?: (conceptId?: string, prompt?: string) => void;
  onRunPipeline?: () => void;
  onRunStep?: (stepId: string, data?: Record<string, unknown>) => void;
  onSelectConcept?: (conceptId: string) => void;
  onApproveOutput?: (type: string, url: string) => void;
  onOpenStepConfig?: (stepId: string) => void;
  onSetNiche?: (nicheId: string) => void;
  onUpdateImagePrompt?: (value: string) => void;
  onUpdateVideoPrompt?: (value: string) => void;
  onUpdateStrategyPrompt?: (value: string) => void;
  onUpdateCopyPrompt?: (value: string) => void;
  onUpdateI2VPrompt?: (value: string) => void;
  onUpdateQAInstruction?: (value: string) => void;
  proactiveMessage?: ProactiveMessage | null;
}

const INITIAL_MESSAGE: AssistantMessageShape = {
  role: 'assistant',
  mode: 'conversation',
  content: [{ type: 'text', text: "Hi. I'm STREAMS. Ask me anything, build something, or let's explore an idea." }],
};

const STREAMS_APPS = [
  { id: 'pipeline',  name: 'STREAMS Pipeline',  icon: '⚡', href: '/pipeline/test',       desc: 'AI pipeline builder' },
  { id: 'image',     name: 'STREAMS Image',      icon: '🎨', href: '/dashboard/image',      desc: 'Image generation' },
  { id: 'video',     name: 'STREAMS Video',      icon: '🎬', href: '/dashboard/video',      desc: 'T2V and I2V' },
  { id: 'voice',     name: 'STREAMS Voice',      icon: '🎤', href: '/dashboard/voice',      desc: 'STT / TTS' },
  { id: 'library',   name: 'STREAMS Library',    icon: '📚', href: '/dashboard/library',    desc: 'Generated assets' },
  { id: 'campaigns', name: 'STREAMS Campaigns',  icon: '📢', href: '/dashboard/campaigns',  desc: 'Campaign mgmt' },
  { id: 'analytics', name: 'STREAMS Analytics',  icon: '📊', href: '/dashboard/analytics',  desc: 'Usage and perf' },
  { id: 'operator',  name: 'STREAMS Operator',   icon: '🛡', href: '/dashboard/operator',   desc: 'System health' },
  { id: 'settings',  name: 'STREAMS Settings',   icon: '⚙', href: '/dashboard/settings',   desc: 'Account & workspace' },
] as const;

function detectMedia(text: string): import('@/components/ai-chat/AssistantMessage').MsgContent[] {
  const blocks: import('@/components/ai-chat/AssistantMessage').MsgContent[] = [];
  const img = text.match(/https?:\/\/\S+\.(png|jpg|jpeg|webp|gif)/i);
  const vid = text.match(/https?:\/\/\S+\.(mp4|webm|mov)/i);
  if (img) blocks.push({ type: 'image_url', image_url: { url: img[0] } });
  if (vid) blocks.push({ type: 'video_url', image_url: { url: vid[0] } });
  return blocks;
}

export default function AIAssistant(props: AIAssistantProps) {
  const [messages, setMessages] = useState<AssistantMessageShape[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [model, setModel] = useState<string>(() => {
    if (typeof window === 'undefined') return 'gpt-4o';
    return localStorage.getItem('streams:model') ?? 'gpt-4o';
  });
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [streamingMode, setStreamingMode] = useState<AssistantMode>('conversation');
  const [isMobile, setIsMobile] = useState<boolean>(false);

  useEffect(() => {
    setIsMobile(window.innerWidth < 600);
    const onResize = () => setIsMobile(window.innerWidth < 600);
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ── Activity stream + artifact preview ────────────────────────────────────
  const [currentArtifact, setCurrentArtifact] = useState<ExtractedArtifact | null>(null);
  const [artifactStreaming, setArtifactStreaming] = useState(false);
  const [autoPreview, setAutoPreview] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('streams:autoPreview') !== 'false';
  });
  const [floatingArtifact, setFloatingArtifact] = useState<ExtractedArtifact | null>(null);
  const [livePreviewArtifact, setLivePreviewArtifact] = useState<{ artifact: ExtractedArtifact; dest: 'iphone1' | 'iphone2' | 'desktop' } | null>(null);

  // Register middleware once
  useEffect(() => registerActivityStreamMiddleware(), []);

  // ── Proactive message injection ───────────────────────────────────────────
  // When the page pushes a proactiveMessage (generation complete, pipeline result)
  // inject it directly into the chat without requiring a user prompt.
  const injectedIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    const msg = props.proactiveMessage;
    if (!msg || injectedIds.current.has(msg.id)) return;
    injectedIds.current.add(msg.id);
    const content: import('@/components/ai-chat/AssistantMessage').MsgContent[] = [
      { type: 'text', text: msg.text },
    ];
    if (msg.imageUrl) {
      content.push({ type: 'image_url', image_url: { url: msg.imageUrl } });
    }
    setMessages(prev => [...prev, { role: 'assistant', mode: 'conversation', content }]);
  }, [props.proactiveMessage]);
  const [conversationId, setConversationId] = useState<string | undefined>(() => {
    if (typeof window === 'undefined') return undefined;
    return localStorage.getItem('streams_conv_id') ?? undefined;
  });
  const abortRef = useRef<AbortController | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarView, setSidebarView] = useState<SidebarView>('home');
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ConversationItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [brainSaved, setBrainSaved] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    attachments, voiceTranscript, setVoiceTranscript,
    addAttachment, removeAttachment, clearAttachments,
    clearVoiceTranscript, requestContext,
  } = useAssistantContextBridge(undefined, conversationId);

  // Fetch history — calls GET /api/conversations (reads assistant_conversations, migration confirmed)
  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const res = await fetch('/api/conversations', { credentials: 'include' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown' })) as { error?: string };
        setHistoryError(err.error ?? 'Failed to load history');
        return;
      }
      const json = await res.json() as { data?: ConversationItem[] };
      setConversations(json.data ?? []);
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : 'Failed to load history');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sidebarOpen && (sidebarView === 'home' || sidebarView === 'history')) {
      void fetchHistory();
    }
  }, [sidebarOpen, sidebarView, fetchHistory]);

  // Search — calls GET /api/conversations/search (server-side ilike on title + messages)
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!searchQuery.trim()) { setSearchResults([]); setSearchLoading(false); return; }
    setSearchLoading(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/conversations/search?q=${encodeURIComponent(searchQuery.trim())}`, { credentials: 'include' });
        if (res.ok) {
          const json = await res.json() as { data?: ConversationItem[] };
          setSearchResults(json.data ?? []);
        }
      } catch { /* non-fatal */ } finally { setSearchLoading(false); }
    }, 300);
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [searchQuery]);

  // Load conversation — calls GET /api/conversations/[id] (reads assistant_messages, migration confirmed)
  const loadConversation = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/conversations/${id}`, { credentials: 'include' });
      if (!res.ok) return;
      const json = await res.json() as { data?: { messages: Array<{ role: string; content: string }> } };
      const msgs = json.data?.messages ?? [];
      if (msgs.length === 0) return;
      const shaped: AssistantMessageShape[] = msgs.map((m) => ({
        role: m.role as 'user' | 'assistant',
        mode: 'conversation' as const,
        content: [{ type: 'text' as const, text: m.content }],
      }));
      setMessages(shaped);
      setConversationId(id);
      if (typeof window !== 'undefined') localStorage.setItem('streams_conv_id', id);
      setSidebarOpen(false);
    } catch { /* keep current messages */ }
  }, []);

  // Delete conversation — calls DELETE /api/conversations/[id]
  const deleteConversation = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/conversations/${id}`, { method: 'DELETE', credentials: 'include' });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (conversationId === id) {
        setMessages([INITIAL_MESSAGE]);
        setConversationId(undefined);
        if (typeof window !== 'undefined') localStorage.removeItem('streams_conv_id');
      }
    } catch { /* non-fatal */ }
  }, [conversationId]);

  const startNewChat = useCallback(() => {
    setMessages([INITIAL_MESSAGE]);
    setConversationId(undefined);
    if (typeof window !== 'undefined') localStorage.removeItem('streams_conv_id');
    setSidebarOpen(false);
    setInput('');
  }, []);

  const performAction = useCallback((action: Action) => {
    switch (action.type) {
      case 'update_prompt': props.onApplyPrompt?.(String(action.payload.new_prompt ?? action.payload.value ?? '')); break;
      case 'update_settings': props.onUpdateSettings?.(String(action.payload.key ?? ''), String(action.payload.value ?? '')); break;
      case 'update_image_prompt': props.onUpdateImagePrompt?.(String(action.payload.value ?? '')); break;
      case 'update_video_prompt': props.onUpdateVideoPrompt?.(String(action.payload.value ?? '')); break;
      case 'update_strategy_prompt': props.onUpdateStrategyPrompt?.(String(action.payload.value ?? '')); break;
      case 'update_copy_prompt': props.onUpdateCopyPrompt?.(String(action.payload.value ?? '')); break;
      case 'update_i2v_prompt': props.onUpdateI2VPrompt?.(String(action.payload.value ?? '')); break;
      case 'update_qa_instruction': props.onUpdateQAInstruction?.(String(action.payload.value ?? '')); break;
      case 'generate_image': props.onGenerateImage?.(action.payload.conceptId as string | undefined, action.payload.prompt as string | undefined); break;
      case 'generate_video': props.onGenerateVideo?.(action.payload.conceptId as string | undefined, action.payload.prompt as string | undefined); break;
      case 'run_pipeline': props.onRunPipeline?.(); break;
      case 'run_step': props.onRunStep?.(String(action.payload.stepId ?? ''), action.payload.data as Record<string, unknown> | undefined); break;
      case 'select_concept': props.onSelectConcept?.(String(action.payload.conceptId ?? '')); break;
      case 'approve_output': props.onApproveOutput?.(String(action.payload.type ?? ''), String(action.payload.url ?? '')); break;
      case 'open_step_config': props.onOpenStepConfig?.(String(action.payload.stepId ?? '')); break;
      case 'set_niche': props.onSetNiche?.(String(action.payload.nicheId ?? '')); break;
      case 'save_to_brain':
        // Calls POST /api/brain — writes to assistant_memory (migration confirmed)
        fetch('/api/brain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            type: action.payload.type ?? 'idea',
            content: action.payload.content ?? '',
            title: action.payload.title ?? '',
            projectId: action.payload.projectId ?? 'streams',
            conversationId,
          }),
        }).then(() => { setBrainSaved(true); setTimeout(() => setBrainSaved(false), 3000); }).catch(() => {/* non-fatal */});
        break;
      default: break;
    }
  }, [props, conversationId]);

  const sendMessage = useCallback(async (rawMessage: string) => {
    const message = rawMessage.trim();
    if ((!message && !attachments.length && !voiceTranscript.trim()) || pending) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const parts: Array<import('@/components/ai-chat/AssistantMessage').MsgContent> = [];
    if (message) parts.push({ type: 'text' as const, text: message });
    if (attachments.length) parts.push({ type: 'text' as const, text: `[context attachments: ${attachments.map((a) => `${a.kind}:${a.label}`).join(', ')}]` });
    if (voiceTranscript.trim()) parts.push({ type: 'text' as const, text: `[voice transcript]\n${voiceTranscript.trim()}` });

    const userMessage: AssistantMessageShape = { role: 'user', content: parts };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput('');
    setPending(true);
    setStreamingText('');
    setStreamingMode('conversation');
    setCurrentArtifact(null);
    setArtifactStreaming(false);

    // Emit only the very first local signal — everything else comes from server phase events
    ActivityController.responseStarted();

    try {
      const res = await fetch('/api/ai-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: controller.signal,
        body: JSON.stringify({ messages: nextMessages, context: { ...props.context, conversationId }, requestContext, conversationId, model }),
      });

      if (!res.ok || !res.body) {
        throw new Error(await res.text().catch(() => 'Assistant failed'));
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';
      let mode: AssistantMode = 'conversation';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() ?? '';
        for (const chunk of chunks) {
          const line = chunk.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          try {
            const evt = JSON.parse(line.slice(6)) as {
              type: string; delta?: string; action?: Action; phase?: string;
              label?: string; message?: string; conversationId?: string; mode?: AssistantMode;
            };
            if (evt.type === 'phase' && evt.phase) {
              // Real server-side progress event — drive activity bar directly
              ActivityController.phase(evt.phase as import('@/lib/activity-stream/index').ActivityPhase, evt.label);
            } else if (evt.type === 'conversation_id' && evt.conversationId) {
              setConversationId(evt.conversationId);
              if (typeof window !== 'undefined') localStorage.setItem('streams_conv_id', evt.conversationId);
            } else if (evt.type === 'text' && evt.delta) {
              fullText += evt.delta;
              setStreamingText(fullText);
              // Feature 2: detect code artifacts in real-time
              const detected = extractArtifactFromBuffer(fullText);
              if (detected) {
                setCurrentArtifact(detected);
                setArtifactStreaming(!detected.isComplete);
                if (!detected.isComplete) {
                  ActivityController.toolStarted('code_generator', 'Generating component...');
                } else {
                  ActivityController.toolCompleted('code_generator', 'Component ready');
                }
              }
            } else if (evt.type === 'action' && evt.action) {
              performAction(evt.action);
            } else if (evt.type === 'done') {
              if (evt.conversationId) {
                setConversationId(evt.conversationId);
                if (typeof window !== 'undefined') localStorage.setItem('streams_conv_id', evt.conversationId);
              }
              if (evt.mode) mode = evt.mode;
              setStreamingMode(mode);
            } else if (evt.type === 'error' && evt.message) {
              fullText += `\n\n${evt.message}`;
              setStreamingText(fullText);
              ActivityController.toolFailed('unknown', evt.message);
            }
          } catch { /* ignore malformed SSE frame */ }
        }
      }

      setArtifactStreaming(false);
      // Clear streaming text BEFORE pushing final message — prevents one-frame duplicate render
      setStreamingText('');
      setMessages((prev) => [...prev, {
        role: 'assistant', mode,
        content: [{ type: 'text', text: fullText || 'Request completed.' }, ...detectMedia(fullText)],
      }]);
      ActivityController.responseCompleted();
      clearAttachments();
      clearVoiceTranscript();
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      const msg = err instanceof Error ? err.message : 'Assistant failed';
      ActivityController.toolFailed('unknown', msg);
      setStreamingText('');
      setMessages((prev) => [...prev, {
        role: 'assistant', mode: 'verification',
        content: [{ type: 'text', text: `VERIFIED:\n- Request reached the assistant layer.\n\nNOT VERIFIED:\n- Response could not be completed.\n\nREQUIRES RUNTIME:\n- Inspect the failed request path.\n\nRISKS:\n- ${msg}` }],
      }]);
    } finally {
      setPending(false);
      abortRef.current = null;
    }
  }, [attachments, clearAttachments, clearVoiceTranscript, conversationId, messages, pending, performAction, props.context, requestContext, voiceTranscript]);

  const ConvItem = useCallback(({ conv }: { conv: ConversationItem }) => (
    <div
      className="group relative flex cursor-pointer flex-col rounded-xl px-3 py-2.5 transition hover:bg-white/[0.06]"
      onClick={() => void loadConversation(conv.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') void loadConversation(conv.id); }}
    >
      <div className="flex items-start justify-between gap-1">
        <span className={['truncate text-[13px] font-medium leading-snug', conversationId === conv.id ? 'text-white' : 'text-white/70'].join(' ')}>
          {conv.title}
        </span>
        <button
          type="button"
          onClick={(e) => void deleteConversation(conv.id, e)}
          className="mt-0.5 shrink-0 rounded px-1 text-[10px] text-transparent transition group-hover:text-white/25 hover:!text-white/70"
          title="Delete"
        >✕</button>
      </div>
      <span className="text-[11px] text-white/28">{conv.date}</span>
      {conv.preview && <span className="mt-0.5 line-clamp-1 text-[11px] text-white/18">{conv.preview}</span>}
    </div>
  ), [conversationId, loadConversation, deleteConversation]);

  const sidebarContent = useMemo(() => (
    <div className="flex h-full flex-col">
      <nav className="flex items-center gap-0.5 border-b border-white/8 px-2 py-2">
        {([
          { id: 'home',     icon: '⌂', label: 'Home' },
          { id: 'history',  icon: '◷', label: 'History' },
          { id: 'search',   icon: '⌕', label: 'Search' },
          { id: 'projects', icon: '⊞', label: 'Projects' },
          { id: 'apps',     icon: '⊕', label: 'Apps' },
        ] as const).map((nav) => (
          <button key={nav.id} type="button" title={nav.label}
            onClick={() => setSidebarView(nav.id as SidebarView)}
            className={['flex h-7 w-7 items-center justify-center rounded-lg text-sm transition',
              sidebarView === nav.id ? 'bg-white/12 text-white' : 'text-white/35 hover:bg-white/6 hover:text-white/60'].join(' ')}>
            {nav.icon}
          </button>
        ))}
        <button type="button" title="New chat" onClick={startNewChat}
          className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-[13px] text-white/35 transition hover:bg-white/6 hover:text-white">
          ✎
        </button>
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-2">

        {sidebarView === 'home' && (
          <div>
            <button type="button" onClick={startNewChat}
              className="mb-3 flex w-full items-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-sm text-white/65 transition hover:border-white/20 hover:text-white">
              <span>✎</span><span className="font-medium">New conversation</span>
            </button>
            <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-white/25">Recent</p>
            {historyLoading && <p className="px-3 py-2 text-[12px] text-white/25">Loading…</p>}
            {historyError && <p className="px-3 py-2 text-[12px] text-red-400/70">{historyError}</p>}
            {!historyLoading && !historyError && conversations.length === 0 && (
              <p className="px-3 py-2 text-[12px] text-white/25">No conversations yet</p>
            )}
            {!historyLoading && conversations.slice(0, 6).map((c) => <ConvItem key={c.id} conv={c} />)}
            {conversations.length > 6 && (
              <button type="button" onClick={() => setSidebarView('history')}
                className="mt-1 w-full px-3 py-1.5 text-left text-[11px] text-white/28 hover:text-white/60">
                View all {conversations.length} →
              </button>
            )}
          </div>
        )}

        {sidebarView === 'history' && (
          <div>
            <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-white/25">
              All conversations {conversations.length > 0 && `(${conversations.length})`}
            </p>
            {historyLoading && <p className="px-3 py-2 text-[12px] text-white/25">Loading…</p>}
            {historyError && <p className="px-3 py-2 text-[12px] text-red-400/70">{historyError}</p>}
            {!historyLoading && !historyError && conversations.length === 0 && (
              <p className="px-3 py-2 text-[12px] text-white/25">No conversations yet</p>
            )}
            {!historyLoading && conversations.map((c) => <ConvItem key={c.id} conv={c} />)}
          </div>
        )}

        {sidebarView === 'search' && (
          <div>
            <input type="search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations…" autoFocus
              className="mb-3 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/25 focus:border-white/20" />
            {searchLoading && <p className="px-3 py-2 text-[12px] text-white/25">Searching…</p>}
            {!searchLoading && searchQuery.trim() && searchResults.length === 0 && (
              <p className="px-3 py-2 text-[12px] text-white/25">No results for &quot;{searchQuery}&quot;</p>
            )}
            {!searchLoading && searchResults.map((c) => <ConvItem key={c.id} conv={c} />)}
            {!searchQuery.trim() && (
              <p className="px-3 py-2 text-[12px] text-white/20">Search titles and message content</p>
            )}
          </div>
        )}

        {sidebarView === 'projects' && (
          <div>
            <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-white/25">STREAMS Workspace</p>
            {[
              { name: 'Dashboard',        href: '/dashboard',           desc: 'Main workspace' },
              { name: 'Pipeline Builder', href: '/pipeline/test',       desc: 'Visual pipeline' },
              { name: 'Image Generator',  href: '/dashboard/image',     desc: 'Realism-enforced' },
              { name: 'Video Generator',  href: '/dashboard/video',     desc: 'T2V and I2V' },
              { name: 'Voice Studio',     href: '/dashboard/voice',     desc: 'STT / TTS' },
              { name: 'Campaigns',        href: '/dashboard/campaigns', desc: 'Campaign management' },
              { name: 'Library',          href: '/dashboard/library',   desc: 'Generated assets' },
            ].map((p) => (
              <a key={p.href} href={p.href} className="flex flex-col rounded-xl px-3 py-2.5 transition hover:bg-white/[0.06]">
                <span className="text-[13px] font-medium text-white/70">{p.name}</span>
                <span className="text-[11px] text-white/30">{p.desc}</span>
              </a>
            ))}
            <p className="mb-2 mt-4 px-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-white/25">Other Projects</p>
            <p className="px-3 py-1.5 text-[11px] text-white/20">Register other projects via STREAMS Intelligence to see them here.</p>
          </div>
        )}

        {sidebarView === 'apps' && (
          <div>
            <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-white/25">STREAMS Tools</p>
            {STREAMS_APPS.map((app) => (
              <a key={app.id} href={app.href} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-white/[0.06]">
                <span className="text-lg leading-none">{app.icon}</span>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-white/70">{app.name}</p>
                  <p className="text-[11px] text-white/30">{app.desc}</p>
                </div>
              </a>
            ))}
          </div>
        )}

      </div>

      <div className="border-t border-white/8 px-3 py-2">
        <p className="text-[10px] text-white/18">Auto-mode · governed · no manual switching</p>
      </div>
    </div>
  ), [sidebarView, startNewChat, historyLoading, historyError, conversations, searchQuery, searchLoading, searchResults, conversationId, ConvItem]);

  const footer = useMemo(() => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* Activity bar — always on */}
      <ActivityStreamBar />
      {/* Artifact chip — only when code detected and done streaming */}
      {currentArtifact && !artifactStreaming && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 8, background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: '#c4b5fd', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            ⚛ {currentArtifact.componentName} · {currentArtifact.lineCount} lines
          </span>
          <button type="button" onClick={() => setFloatingArtifact(currentArtifact)}
            style={{ fontSize: 9, fontWeight: 700, color: '#c4b5fd', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 4, padding: '2px 7px', cursor: 'pointer', flexShrink: 0 }}>
            Preview
          </button>
        </div>
      )}
      {/* Attachment rail — toggled by + button */}
      {attachmentOpen && (
        <div style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
          <AttachmentRail onAdd={(a) => { addAttachment(a); setAttachmentOpen(false); }} />
        </div>
      )}
      {/* Context chips */}
      {(attachments.length > 0 || voiceTranscript?.trim()) && (
        <ContextChips attachments={attachments} voiceTranscript={voiceTranscript} onRemoveAttachment={removeAttachment} onClearVoice={clearVoiceTranscript} />
      )}
      {brainSaved && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: '#6ee7b7' }}>
          <span>💡</span><span>Saved to STREAMS Brain</span>
        </div>
      )}
      {/* Voice bar */}
      <VoiceBar onTranscript={setVoiceTranscript} speakText={streamingText && !pending ? streamingText : undefined} />
      {/* Input row */}
      <form onSubmit={(e) => { e.preventDefault(); void sendMessage(input); }} style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
        {/* + attachment toggle */}
        <button
          type="button"
          onClick={() => setAttachmentOpen(o => !o)}
          style={{
            width: 36, height: 36, borderRadius: '50%', flexShrink: 0, marginBottom: 4,
            border: attachmentOpen ? '1px solid rgba(103,232,249,0.4)' : '1px solid rgba(255,255,255,0.15)',
            background: attachmentOpen ? 'rgba(103,232,249,0.1)' : 'rgba(255,255,255,0.06)',
            color: attachmentOpen ? '#67e8f9' : 'rgba(255,255,255,0.6)',
            fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          aria-label="Attach file"
        >+</button>
        {/* Textarea */}
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage(input); } }}
          placeholder="Ask, build, explore, verify…"
          rows={1}
          style={{ flex: 1, resize: 'none', borderRadius: 20, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: '#fff', padding: '10px 14px', fontSize: 14, outline: 'none', maxHeight: 120, minHeight: 40 }}
        />
        {/* Model selector */}
          <select
          value={model}
          onChange={(e) => { setModel(e.target.value); if (typeof window !== 'undefined') localStorage.setItem('streams:model', e.target.value); }}
          style={{
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.6)', borderRadius: 10, padding: '4px 6px',
            fontSize: 10, cursor: 'pointer', outline: 'none', marginBottom: 4, flexShrink: 0,
          }}
        >
          <optgroup label="OpenAI">
            <option value="gpt-4o">GPT-4o</option>
            <option value="gpt-4o-mini">GPT-4o mini</option>
            <option value="o1">o1</option>
          </optgroup>
          <optgroup label="Anthropic">
            <option value="claude-sonnet-4-6">Sonnet 4.6</option>
            <option value="claude-opus-4-6">Opus 4.6</option>
            <option value="claude-haiku-4-5-20251001">Haiku 4.5</option>
          </optgroup>
        </select>
        {/* Send button */}
        <button type="submit"
          disabled={(!input.trim() && !attachments.length && !voiceTranscript?.trim()) || pending}
          style={{ height: 40, borderRadius: 20, background: '#fff', color: '#0A0C10', padding: '0 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: ((!input.trim() && !attachments.length && !voiceTranscript?.trim()) || pending) ? 0.4 : 1, border: 'none', flexShrink: 0, marginBottom: 0 }}>
          {pending ? '…' : 'Send'}
        </button>
      </form>
    </div>
  ), [addAttachment, attachments, attachmentOpen, artifactStreaming, brainSaved, clearVoiceTranscript, currentArtifact, input, model, pending, removeAttachment, sendMessage, setAttachmentOpen, setFloatingArtifact, setVoiceTranscript, streamingText, voiceTranscript]);

  return (
    <>
      {sidebarOpen ? (
        <div
          className={["fixed z-[70] pointer-events-auto flex overflow-hidden bg-[#0A0C10]", isMobile ? "inset-0 border-0 rounded-none shadow-none" : "bottom-6 right-6 border border-white/12 rounded-[28px] shadow-[0_40px_120px_rgba(0,0,0,0.8)]"].join(" ")}
          style={isMobile ? { touchAction: "none" } : { width: 660, height: 680 }}
        >
          {!isMobile && <div className="w-48 shrink-0 border-r border-white/8">{sidebarContent}</div>}
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex items-center justify-between border-b border-white/8 px-4 py-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">STREAMS Chat</p>
                <p className="text-sm font-semibold text-white">
                  {conversationId
                    ? (conversations.find((c) => c.id === conversationId)?.title ?? 'Conversation')
                    : 'New conversation'}
                </p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={startNewChat}
                  className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-white/45 hover:border-white/20 hover:text-white">
                  ✎ New
                </button>
                <button type="button" onClick={() => setSidebarOpen(false)}
                  className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-white/45 hover:border-white/20 hover:text-white">
                  ✕
                </button>
              </div>
            </header>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <AssistantMessageList messages={messages} streamingText={streamingText} streamingMode={streamingMode} pending={pending} />
            </div>
            <div className="border-t border-white/8 px-4 py-3" style={isMobile ? { paddingBottom: "calc(12px + env(safe-area-inset-bottom))" } : undefined}>{footer}</div>
          </div>
        </div>
      ) : (
        <AIAssistantShell
          title="STREAMS Chat"
          subtitle="Auto-mode · governed · multimodal"
          onClose={() => undefined}
          footer={
            <div className="grid gap-2">
              <div className="flex items-center gap-2">
                <button type="button"
                  onClick={() => { setSidebarOpen(true); setSidebarView('home'); }}
                  className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[12px] text-white/45 hover:border-white/20 hover:text-white">
                  <span>☰</span><span>Chats</span>
                  {conversations.length > 0 && (
                    <span className="rounded-full bg-white/10 px-1.5 text-[10px] text-white/55">{conversations.length}</span>
                  )}
                </button>
                <button type="button" onClick={startNewChat}
                  className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[12px] text-white/45 hover:border-white/20 hover:text-white">
                  <span>✎</span><span>New</span>
                </button>
              </div>
              {footer}
            </div>
          }
        >
          <AssistantMessageList messages={messages} streamingText={streamingText} streamingMode={streamingMode} pending={pending} />
        </AIAssistantShell>
      )}
      {/* Feature 2 — Floating preview panel */}
      {floatingArtifact && (
        <FloatingPreviewPanel
          artifact={floatingArtifact}
          onClose={() => setFloatingArtifact(null)}
        />
      )}
      {/* Feature 2 — Live preview modal overlay */}
      {livePreviewArtifact && (
        <div
          className="pointer-events-auto fixed inset-0 z-[200] flex flex-col items-center justify-center gap-3 bg-black/65 backdrop-blur-sm"
          onClick={() => setLivePreviewArtifact(null)}
        >
          <div onClick={(e) => e.stopPropagation()} className="overflow-hidden rounded-xl shadow-[0_24px_80px_rgba(0,0,0,0.6)]">
            <LivePreviewRenderer
              artifact={livePreviewArtifact.artifact}
              width={livePreviewArtifact.dest === 'desktop' ? 900 : 390}
              height={livePreviewArtifact.dest === 'desktop' ? 600 : 700}
            />
          </div>
          <button
            onClick={() => setLivePreviewArtifact(null)}
            className="rounded-lg border border-white/15 bg-white/8 px-5 py-2 text-sm font-semibold text-white"
          >
            Close preview
          </button>
        </div>
      )}
    </>
  );
}
