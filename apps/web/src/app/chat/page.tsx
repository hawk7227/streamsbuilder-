"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Composer } from "@/components/chat/Composer";
import { StreamRenderer } from "@/components/chat/StreamRenderer";
import { ActivityTimeline } from "@/components/activity/ActivityTimeline";
import { FileUpload } from "@/components/files/FileUpload";
import { PreviewPanel } from "@/components/preview/PreviewPanel";
import { createBotTurn } from "@/lib/api-client";
import { useRunStream } from "@/lib/hooks/useRunStream";
import type { BotRequest, RunStreamEvent } from "@streams/contracts";
import { ActivityStreamBar } from "@/lib/activity-stream/ActivityStreamBar";
import { ActivityController, registerActivityStreamMiddleware } from "@/lib/activity-stream/index";
import { extractArtifactFromBuffer } from "@/lib/activity-stream/code-extractor";
import type { ExtractedArtifact } from "@/lib/activity-stream/code-extractor";
import { ArtifactCard } from "@/components/pipeline/ArtifactCard";
import type { ArtifactDestination } from "@/components/pipeline/ArtifactCard";
import { FloatingPreviewPanel } from "@/components/pipeline/FloatingPreviewPanel";
import { LivePreviewRenderer } from "@/components/pipeline/LivePreviewRenderer";
import { AttachmentRail } from "@/components/ai-chat/AttachmentRail";
import { ContextChips } from "@/components/ai-chat/ContextChips";
import { VoiceBar } from "@/components/ai-chat/VoiceBar";
import { useAssistantContextBridge } from "@/components/ai-chat/useAssistantContextBridge";
import type { AssistantMode } from "@/lib/enforcement/types";

const DEFAULT_PROJECT_ID = "00000000-0000-0000-0000-000000000001";

// ── Types ─────────────────────────────────────────────────────────────────────

interface LLMMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  mode?: AssistantMode;
}

interface WorkerMessage {
  id: string;
  role: "assistant";
  runId: string;
}

type Message = LLMMessage | WorkerMessage;

function isWorkerMessage(m: Message): m is WorkerMessage {
  return "runId" in m;
}

type PanelView = "activity" | "files" | "preview";
type SidebarView = "home" | "history" | "search" | "projects" | "apps";

interface ConversationItem {
  id: string;
  title: string;
  date: string;
  preview: string;
  updatedAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getStoredConversationId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return localStorage.getItem("streams_conv_id") ?? undefined;
}

function getStoredModel(): string {
  if (typeof window === "undefined") return "gpt-4o";
  return localStorage.getItem("streams:model") ?? "gpt-4o";
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const [projectId] = useState<string>(DEFAULT_PROJECT_ID);

  // ── Worker/SSE state (runtime/deploy modes) ──────────────────────────────
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [events, setEvents] = useState<RunStreamEvent[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [panel, setPanel] = useState<PanelView>("activity");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // ── LLM streaming state (helper/builder/auto modes) ──────────────────────
  const [streamingText, setStreamingText] = useState("");
  const [model, setModel] = useState<string>(getStoredModel);
  const [conversationId, setConversationId] = useState<string | undefined>(getStoredConversationId);
  const abortRef = useRef<AbortController | null>(null);

  // ── Artifact state ────────────────────────────────────────────────────────
  const [currentArtifact, setCurrentArtifact] = useState<ExtractedArtifact | null>(null);
  const [artifactStreaming, setArtifactStreaming] = useState(false);
  const [floatingArtifact, setFloatingArtifact] = useState<ExtractedArtifact | null>(null);
  const [livePreviewArtifact, setLivePreviewArtifact] = useState<{ artifact: ExtractedArtifact; dest: ArtifactDestination } | null>(null);

  // ── Sidebar state ─────────────────────────────────────────────────────────
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarView, setSidebarView] = useState<SidebarView>("home");
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ConversationItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [brainSaved, setBrainSaved] = useState(false);
  const [attachmentOpen, setAttachmentOpen] = useState(false);

  // ── Context bridge (attachments + voice) ─────────────────────────────────
  const {
    attachments,
    voiceTranscript,
    setVoiceTranscript,
    addAttachment,
    removeAttachment,
    clearAttachments,
    clearVoiceTranscript,
    requestContext,
  } = useAssistantContextBridge(projectId);

  // ── Activity stream middleware ─────────────────────────────────────────────
  useEffect(() => {
    const unsub = registerActivityStreamMiddleware();
    return unsub;
  }, []);

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  // ── Worker stream event handler ───────────────────────────────────────────
  const handleStreamEvent = useCallback((event: RunStreamEvent) => {
    setEvents((prev) => [...prev, event]);
    if (event.type === "artifact_ready" && event.artifactType === "preview") {
      setPreviewUrl(event.url);
      setPanel("preview");
    }
    if (event.type === "response_completed" || event.type === "run_failed") {
      setSubmitting(false);
      if (event.type === "run_failed") setError(event.error);
    }
  }, []);

  useRunStream(activeRunId, handleStreamEvent);

  // ── Conversation history ──────────────────────────────────────────────────
  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/conversations", { credentials: "include" });
      if (res.ok) {
        const data = await res.json() as { data: ConversationItem[] };
        setConversations(data.data ?? []);
      }
    } catch { /* non-fatal */ }
    setHistoryLoading(false);
  }, []);

  useEffect(() => {
    if (sidebarOpen) void fetchHistory();
  }, [sidebarOpen, fetchHistory]);

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    setSearchLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/conversations/search?q=${encodeURIComponent(searchQuery)}`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json() as { data: ConversationItem[] };
          setSearchResults(data.data ?? []);
        }
      } catch { /* non-fatal */ }
      setSearchLoading(false);
    }, 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const loadConversation = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/conversations/${id}`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json() as { data: { messages: Array<{ role: string; content: string; id: string }> } };
      const loaded: Message[] = (data.data.messages ?? []).map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
      setMessages(loaded);
      setConversationId(id);
      if (typeof window !== "undefined") localStorage.setItem("streams_conv_id", id);
      setSidebarOpen(false);
    } catch { /* non-fatal */ }
  }, []);

  const deleteConversation = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`/api/conversations/${id}`, { method: "DELETE", credentials: "include" });
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (conversationId === id) {
      setConversationId(undefined);
      setMessages([]);
      if (typeof window !== "undefined") localStorage.removeItem("streams_conv_id");
    }
  }, [conversationId]);

  const startNewChat = useCallback(() => {
    setMessages([]);
    setStreamingText("");
    setConversationId(undefined);
    setCurrentArtifact(null);
    setArtifactStreaming(false);
    setEvents([]);
    setActiveRunId(null);
    setPreviewUrl(null);
    if (typeof window !== "undefined") localStorage.removeItem("streams_conv_id");
    setSidebarOpen(false);
  }, []);

  // ── Brain save ────────────────────────────────────────────────────────────
  const saveToBrain = useCallback((content: string) => {
    void fetch("/api/brain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        type: "decision",
        content,
        projectId,
        conversationId,
        title: content.slice(0, 60),
      }),
    });
    setBrainSaved(true);
    setTimeout(() => setBrainSaved(false), 2000);
  }, [projectId, conversationId]);

  // ── Artifact destination handler ──────────────────────────────────────────
  const handleArtifactPreview = useCallback((dest: ArtifactDestination) => {
    if (!currentArtifact) return;
    if (dest === "float") {
      setFloatingArtifact(currentArtifact);
    } else {
      setLivePreviewArtifact({ artifact: currentArtifact, dest });
    }
  }, [currentArtifact]);

  // ── Action callbacks ──────────────────────────────────────────────────────
  const handleGenerateImage = useCallback(async (conceptId?: string, prompt?: string) => {
    try {
      await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ prompt: prompt ?? "Generate image", conceptId, mode: "images" }),
      });
    } catch { /* non-fatal */ }
  }, []);

  const handleGenerateVideo = useCallback(async (conceptId?: string, prompt?: string) => {
    try {
      await fetch("/api/video/scratch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ prompt: prompt ?? "Generate video", conceptId }),
      });
    } catch { /* non-fatal */ }
  }, []);

  const handleRunPipeline = useCallback(async () => {
    try {
      await fetch("/api/pipeline/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mode: "runPipeline" }),
      });
    } catch { /* non-fatal */ }
  }, []);

  const handleRunStep = useCallback(async (stepId: string, data?: Record<string, unknown>) => {
    try {
      await fetch("/api/pipeline/run-node", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type: stepId, data: data ?? {} }),
      });
    } catch { /* non-fatal */ }
  }, []);

  // ── LLM streaming submit (helper/builder/auto) ────────────────────────────
  const handleLLMSubmit = useCallback(async (text: string) => {
    if (!text.trim() && !attachments.length && !voiceTranscript.trim()) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const userMsg: LLMMessage = { id: crypto.randomUUID(), role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setSubmitting(true);
    setStreamingText("");
    setCurrentArtifact(null);
    setArtifactStreaming(false);

    ActivityController.responseStarted();

    try {
      const historyMessages = messages
        .filter((m): m is LLMMessage => !isWorkerMessage(m))
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        signal: controller.signal,
        body: JSON.stringify({
          messages: [...historyMessages, { role: "user", content: text }],
          context: { projectId },
          requestContext,
          conversationId,
          model,
        }),
      });

      if (!res.ok || !res.body) throw new Error(await res.text().catch(() => "Assistant failed"));

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";
      let responseMode: AssistantMode = "conversation";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const line = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          try {
            const evt = JSON.parse(line.slice(6)) as {
              type: string;
              delta?: string;
              phase?: string;
              label?: string;
              conversationId?: string;
              mode?: AssistantMode;
              message?: string;
              action?: { type: string; payload: Record<string, unknown> };
            };

            if (evt.type === "phase" && evt.phase) {
              ActivityController.phase(evt.phase as Parameters<typeof ActivityController.phase>[0], evt.label);
            } else if (evt.type === "conversation_id" && evt.conversationId) {
              setConversationId(evt.conversationId);
              if (typeof window !== "undefined") localStorage.setItem("streams_conv_id", evt.conversationId);
            } else if (evt.type === "text" && evt.delta) {
              fullText += evt.delta;
              setStreamingText(fullText);
              const detected = extractArtifactFromBuffer(fullText);
              if (detected) {
                setCurrentArtifact(detected);
                setArtifactStreaming(!detected.isComplete);
                if (!detected.isComplete) {
                  ActivityController.toolStarted("code_generator", "Generating component...");
                } else {
                  ActivityController.toolCompleted("code_generator", "Component ready");
                }
              }
            } else if (evt.type === "action" && evt.action) {
              const { type, payload } = evt.action;
              if (type === "generate_image") void handleGenerateImage(payload.conceptId as string | undefined, payload.prompt as string | undefined);
              if (type === "generate_video") void handleGenerateVideo(payload.conceptId as string | undefined, payload.prompt as string | undefined);
              if (type === "run_pipeline") void handleRunPipeline();
              if (type === "run_step") void handleRunStep(String(payload.stepId ?? ""), payload.data as Record<string, unknown> | undefined);
              if (type === "save_to_brain") saveToBrain(String(payload.content ?? fullText));
            } else if (evt.type === "done") {
              if (evt.conversationId) {
                setConversationId(evt.conversationId);
                if (typeof window !== "undefined") localStorage.setItem("streams_conv_id", evt.conversationId);
              }
              if (evt.mode) responseMode = evt.mode;
            } else if (evt.type === "error" && evt.message) {
              setError(evt.message);
              ActivityController.toolFailed("unknown", evt.message);
            }
          } catch { /* malformed SSE frame — skip */ }
        }
      }

      setArtifactStreaming(false);
      setStreamingText("");
      const assistantMsg: LLMMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: fullText || "Request completed.",
        mode: responseMode,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      ActivityController.responseCompleted();
      clearAttachments();
      clearVoiceTranscript();
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      const msg = err instanceof Error ? err.message : "Assistant failed";
      ActivityController.toolFailed("unknown", msg);
      setStreamingText("");
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Error: ${msg}`,
      }]);
    } finally {
      setSubmitting(false);
    }
  }, [messages, attachments, voiceTranscript, requestContext, conversationId, model, projectId, clearAttachments, clearVoiceTranscript, handleGenerateImage, handleGenerateVideo, handleRunPipeline, handleRunStep, saveToBrain]);

  // ── Worker submit (runtime/deploy modes) ──────────────────────────────────
  const handleWorkerSubmit = useCallback(async (req: Omit<BotRequest, "projectId" | "conversationId">) => {
    if (submitting) return;
    setError(null);
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content: req.userMessage }]);
    setSubmitting(true);
    setEvents([]);

    try {
      const result = await createBotTurn({ ...req, projectId, conversationId });
      setConversationId(result.conversationId);
      setActiveRunId(result.runId);
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", runId: result.runId }]);
    } catch (err) {
      setSubmitting(false);
      const msg = err instanceof Error ? err.message : "Request failed";
      setError(msg);
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content: `Error: ${msg}` }]);
    }
  }, [submitting, conversationId, projectId]);

  // ── Unified submit — routes by mode ──────────────────────────────────────
  const handleSubmit = useCallback((req: Omit<BotRequest, "projectId" | "conversationId">) => {
    if (req.mode === "runtime" || req.mode === "deploy") {
      void handleWorkerSubmit(req);
    } else {
      void handleLLMSubmit(req.userMessage);
    }
  }, [handleWorkerSubmit, handleLLMSubmit]);

  // ── Sidebar content ───────────────────────────────────────────────────────
  const STREAMS_APPS = [
    { id: "pipeline", name: "Pipeline Builder", icon: "⚡", href: "/pipeline/test", desc: "AI pipeline builder" },
    { id: "image", name: "Image Generator", icon: "🖼", href: "/dashboard/image", desc: "Realism-enforced" },
    { id: "video", name: "Video Generator", icon: "🎬", href: "/dashboard/video", desc: "T2V and I2V" },
    { id: "voice", name: "Voice Studio", icon: "🎙", href: "/dashboard/voice", desc: "STT / TTS" },
    { id: "library", name: "Library", icon: "📚", href: "/dashboard/library", desc: "Generated assets" },
    { id: "operator", name: "Operator", icon: "⚙️", href: "/dashboard/operator", desc: "System health" },
  ];

  const ConvItem = useCallback(({ conv }: { conv: ConversationItem }) => (
    <div
      onClick={() => void loadConversation(conv.id)}
      style={{ padding: "8px 12px", borderRadius: 8, cursor: "pointer", display: "flex", flexDirection: "column", gap: 2, background: conversationId === conv.id ? "rgba(255,255,255,0.08)" : "transparent" }}
      onMouseEnter={(e) => { if (conversationId !== conv.id) (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.04)"; }}
      onMouseLeave={(e) => { if (conversationId !== conv.id) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: conversationId === conv.id ? "#fff" : "rgba(255,255,255,0.7)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{conv.title}</span>
        <button type="button" onClick={(e) => void deleteConversation(conv.id, e)} style={{ fontSize: 10, color: "transparent", background: "none", border: "none", cursor: "pointer", padding: "0 4px", flexShrink: 0 }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.5)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "transparent"; }}>✕</button>
      </div>
      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{conv.date}</span>
    </div>
  ), [conversationId, loadConversation, deleteConversation]);

  return (
    <div style={styles.shell}>
      {/* ── Sidebar overlay ──────────────────────────────────────────── */}
      {sidebarOpen && (
        <div style={styles.sidebarOverlay}>
          <div style={styles.sidebar}>
            {/* Sidebar nav */}
            <div style={styles.sidebarNav}>
              {([
                { id: "home", icon: "⌂", label: "Home" },
                { id: "history", icon: "◷", label: "History" },
                { id: "search", icon: "⌕", label: "Search" },
                { id: "projects", icon: "⊞", label: "Projects" },
                { id: "apps", icon: "⊕", label: "Apps" },
              ] as const).map((nav) => (
                <button key={nav.id} type="button" title={nav.label}
                  onClick={() => setSidebarView(nav.id)}
                  style={{ ...styles.sidebarNavBtn, background: sidebarView === nav.id ? "rgba(255,255,255,0.12)" : "transparent", color: sidebarView === nav.id ? "#fff" : "rgba(255,255,255,0.35)" }}>
                  {nav.icon}
                </button>
              ))}
              <button type="button" title="New chat" onClick={startNewChat} style={{ ...styles.sidebarNavBtn, marginLeft: "auto", color: "rgba(255,255,255,0.35)" }}>✎</button>
              <button type="button" onClick={() => setSidebarOpen(false)} style={{ ...styles.sidebarNavBtn, color: "rgba(255,255,255,0.35)" }}>✕</button>
            </div>

            {/* Sidebar content */}
            <div style={styles.sidebarContent}>
              {sidebarView === "home" && (
                <div>
                  <button type="button" onClick={startNewChat} style={styles.newChatBtn}>
                    <span>✎</span><span style={{ fontWeight: 500 }}>New conversation</span>
                  </button>
                  <p style={styles.sidebarLabel}>Recent</p>
                  {historyLoading && <p style={styles.sidebarMuted}>Loading…</p>}
                  {!historyLoading && conversations.slice(0, 6).map((c) => <ConvItem key={c.id} conv={c} />)}
                  {conversations.length > 6 && (
                    <button type="button" onClick={() => setSidebarView("history")} style={styles.sidebarMoreBtn}>
                      View all {conversations.length} →
                    </button>
                  )}
                </div>
              )}

              {sidebarView === "history" && (
                <div>
                  <p style={styles.sidebarLabel}>All conversations {conversations.length > 0 && `(${conversations.length})`}</p>
                  {historyLoading && <p style={styles.sidebarMuted}>Loading…</p>}
                  {!historyLoading && conversations.map((c) => <ConvItem key={c.id} conv={c} />)}
                </div>
              )}

              {sidebarView === "search" && (
                <div>
                  <input type="search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search conversations…" autoFocus style={styles.searchInput} />
                  {searchLoading && <p style={styles.sidebarMuted}>Searching…</p>}
                  {!searchLoading && searchQuery.trim() && searchResults.length === 0 && (
                    <p style={styles.sidebarMuted}>No results</p>
                  )}
                  {!searchLoading && searchResults.map((c) => <ConvItem key={c.id} conv={c} />)}
                  {!searchQuery.trim() && <p style={styles.sidebarMuted}>Search titles and message content</p>}
                </div>
              )}

              {sidebarView === "projects" && (
                <div>
                  <p style={styles.sidebarLabel}>STREAMS Workspace</p>
                  {[
                    { name: "Pipeline Builder", href: "/pipeline/test", desc: "Visual pipeline" },
                    { name: "Image Generator", href: "/dashboard/image", desc: "Realism-enforced" },
                    { name: "Video Generator", href: "/dashboard/video", desc: "T2V and I2V" },
                    { name: "Voice Studio", href: "/dashboard/voice", desc: "STT / TTS" },
                    { name: "Library", href: "/dashboard/library", desc: "Generated assets" },
                    { name: "Editor", href: "/editor", desc: "GitHub file editor" },
                  ].map((p) => (
                    <a key={p.href} href={p.href} style={styles.sidebarLink}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.7)" }}>{p.name}</span>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{p.desc}</span>
                    </a>
                  ))}
                </div>
              )}

              {sidebarView === "apps" && (
                <div>
                  <p style={styles.sidebarLabel}>STREAMS Tools</p>
                  {STREAMS_APPS.map((app) => (
                    <a key={app.id} href={app.href} style={{ ...styles.sidebarLink, flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <span style={{ fontSize: 18 }}>{app.icon}</span>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.7)", margin: 0 }}>{app.name}</p>
                        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", margin: 0 }}>{app.desc}</p>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>

            <div style={styles.sidebarFooter}>
              <p style={{ fontSize: 10, color: "rgba(255,255,255,0.18)", margin: 0 }}>Auto-mode · governed · multimodal</p>
            </div>
          </div>
          <div style={styles.sidebarBackdrop} onClick={() => setSidebarOpen(false)} />
        </div>
      )}

      {/* ── Left: Chat column ─────────────────────────────────────────── */}
      <div style={styles.chatColumn}>
        {/* Top bar */}
        <div style={styles.topBar}>
          <button type="button" onClick={() => setSidebarOpen(true)} style={styles.topBarBtn}>
            ☰
            {conversations.length > 0 && <span style={styles.convBadge}>{conversations.length}</span>}
          </button>
          <button type="button" onClick={startNewChat} style={styles.topBarBtn}>✎</button>
          <div style={{ flex: 1 }} />
          {/* Model selector */}
          <select value={model} onChange={(e) => {
            setModel(e.target.value);
            if (typeof window !== "undefined") localStorage.setItem("streams:model", e.target.value);
          }} style={styles.modelSelect}>
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
        </div>

        {/* Error banner */}
        {error && (
          <div style={styles.errorBanner} role="alert">
            <span>{error}</span>
            <button type="button" style={styles.errorDismiss} onClick={() => setError(null)}>✕</button>
          </div>
        )}

        {/* Message list */}
        <div style={styles.messages}>
          {messages.length === 0 && !streamingText && (
            <div style={styles.emptyState}>
              <div style={styles.emptyHeading}>Streams</div>
              <div style={styles.emptySubheading}>Helper · Builder · Runtime · Deploy</div>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} style={{ ...styles.message, ...(msg.role === "user" ? styles.userMessage : styles.assistantMessage) }}>
              {msg.role === "user" ? (
                <div style={styles.userBubble}>{isWorkerMessage(msg) ? "" : (msg as LLMMessage).content}</div>
              ) : isWorkerMessage(msg) ? (
                <StreamRenderer runId={(msg as WorkerMessage).runId} />
              ) : (
                <div style={styles.assistantText}>{(msg as LLMMessage).content}</div>
              )}
            </div>
          ))}

          {/* Streaming text in progress */}
          {streamingText && (
            <div style={{ ...styles.message, ...styles.assistantMessage }}>
              <div style={styles.assistantText}>
                {streamingText}
                <span style={styles.cursor} aria-hidden="true">▋</span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Activity bar */}
        <div style={{ padding: "0 var(--spacing-6) 4px" }}>
          <ActivityStreamBar />
        </div>

        {/* Artifact chip */}
        {currentArtifact && (
          <div style={{ padding: "0 var(--spacing-6) 4px" }}>
            <ArtifactCard
              artifact={currentArtifact}
              isStreaming={artifactStreaming}
              autoPreview={true}
              onPreview={handleArtifactPreview}
              onViewCode={() => setFloatingArtifact(currentArtifact)}
            />
          </div>
        )}

        {/* Brain saved flash */}
        {brainSaved && (
          <div style={{ padding: "0 var(--spacing-6) 4px", display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#6ee7b7" }}>
            <span>💡</span><span>Saved to STREAMS Brain</span>
          </div>
        )}

        {/* Attachment rail */}
        {attachmentOpen && (
          <div style={{ padding: "0 var(--spacing-6) 4px" }}>
            <AttachmentRail onAdd={(a) => { addAttachment(a); setAttachmentOpen(false); }} />
          </div>
        )}

        {/* Context chips */}
        {(attachments.length > 0 || voiceTranscript?.trim()) && (
          <div style={{ padding: "0 var(--spacing-6) 4px" }}>
            <ContextChips attachments={attachments} voiceTranscript={voiceTranscript} onRemoveAttachment={removeAttachment} onClearVoice={clearVoiceTranscript} />
          </div>
        )}

        {/* Voice bar */}
        <div style={{ padding: "0 var(--spacing-6) 4px" }}>
          <VoiceBar onTranscript={setVoiceTranscript} speakText={streamingText && !submitting ? streamingText : undefined} />
        </div>

        {/* Attachment toggle + Composer */}
        <div style={styles.composerWrapper}>
          <button type="button" onClick={() => setAttachmentOpen((o) => !o)} style={{ ...styles.attachBtn, background: attachmentOpen ? "rgba(103,232,249,0.1)" : "rgba(255,255,255,0.06)", border: attachmentOpen ? "1px solid rgba(103,232,249,0.4)" : "1px solid rgba(255,255,255,0.15)", color: attachmentOpen ? "#67e8f9" : "rgba(255,255,255,0.6)" }}>+</button>
          <div style={{ flex: 1 }}>
            <Composer
              projectId={projectId}
              conversationId={conversationId}
              disabled={submitting}
              onSubmit={handleSubmit}
            />
          </div>
        </div>
      </div>

      {/* ── Right: Side panel ─────────────────────────────────────────── */}
      <div style={styles.sidePanel}>
        <div style={styles.panelTabs}>
          {(["activity", "files", "preview"] as PanelView[]).map((tab) => (
            <button key={tab} type="button" onClick={() => setPanel(tab)} style={{ ...styles.panelTab, borderBottom: panel === tab ? "2px solid var(--color-accent)" : "2px solid transparent", color: panel === tab ? "var(--color-text-primary)" : "var(--color-text-tertiary)" }}>
              {tab === "activity" ? "Activity" : tab === "files" ? "Files" : "Preview"}
            </button>
          ))}
        </div>

        <div style={styles.panelContent}>
          {panel === "activity" && <ActivityTimeline events={events} />}
          {panel === "files" && (
            <FileUpload projectId={projectId} onUploaded={(fileId) => { console.log("[chat] file uploaded:", fileId); }} />
          )}
          {panel === "preview" && (
            <PreviewPanel
              projectId={projectId}
              runId={activeRunId}
              previewUrl={previewUrl}
              onPreviewRequested={(streamUrl) => { console.log("[chat] preview stream:", streamUrl); }}
            />
          )}
        </div>
      </div>

      {/* ── Floating artifact preview panel ──────────────────────────── */}
      {floatingArtifact && (
        <FloatingPreviewPanel artifact={floatingArtifact} onClose={() => setFloatingArtifact(null)} />
      )}

      {/* ── Live preview modal (iphone1 / iphone2 / desktop) ─────────── */}
      {livePreviewArtifact && (
        <div style={styles.livePreviewOverlay} onClick={() => setLivePreviewArtifact(null)}>
          <div onClick={(e) => e.stopPropagation()} style={styles.livePreviewInner}>
            <LivePreviewRenderer
              artifact={livePreviewArtifact.artifact}
              width={livePreviewArtifact.dest === "desktop" ? 900 : 390}
              height={livePreviewArtifact.dest === "desktop" ? 600 : 700}
            />
          </div>
          <button onClick={() => setLivePreviewArtifact(null)} style={styles.livePreviewClose}>
            Close preview
          </button>
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = {
  shell: { display: "flex", height: "100vh", overflow: "hidden", background: "var(--color-bg)", position: "relative" as const },
  chatColumn: { flex: 1, display: "flex", flexDirection: "column" as const, minWidth: 0, borderRight: "1px solid var(--color-border)" },
  topBar: { display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderBottom: "1px solid var(--color-border)", flexShrink: 0, height: 48 },
  topBarBtn: { background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", borderRadius: 6 },
  convBadge: { fontSize: 10, background: "var(--color-accent)", color: "var(--color-accent-text)", borderRadius: 10, padding: "1px 5px" },
  modelSelect: { background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-secondary)", borderRadius: 8, padding: "4px 8px", fontSize: 11, cursor: "pointer", outline: "none" },
  errorBanner: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 24px", background: "var(--color-err-bg)", borderBottom: "1px solid var(--color-err-border)", color: "var(--color-err-text)", fontSize: 13, flexShrink: 0 },
  errorDismiss: { background: "none", border: "none", color: "var(--color-err-text)", cursor: "pointer", fontSize: 13, padding: "0 4px" },
  messages: { flex: 1, overflowY: "auto" as const, padding: "32px 24px", display: "flex", flexDirection: "column" as const, gap: 24 },
  emptyState: { display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", flex: 1, gap: 12, padding: "96px 24px" },
  emptyHeading: { fontSize: 28, fontWeight: 500, color: "var(--color-text-primary)", letterSpacing: "-0.02em" },
  emptySubheading: { fontSize: 14, color: "var(--color-text-tertiary)" },
  message: { display: "flex", flexDirection: "column" as const, maxWidth: 720 },
  userMessage: { alignSelf: "flex-end" as const, alignItems: "flex-end" as const },
  assistantMessage: { alignSelf: "flex-start" as const, alignItems: "flex-start" as const, width: "100%" },
  userBubble: { background: "var(--color-accent)", color: "var(--color-accent-text)", padding: "10px 16px", borderRadius: 16, fontSize: 14, lineHeight: 1.6, maxWidth: 600, whiteSpace: "pre-wrap" as const, wordBreak: "break-word" as const },
  assistantText: { fontSize: 14, lineHeight: 1.7, color: "var(--color-text-primary)", whiteSpace: "pre-wrap" as const, wordBreak: "break-word" as const },
  cursor: { display: "inline-block", animation: "blink 1s step-start infinite", marginLeft: 1 },
  composerWrapper: { padding: "8px 24px 16px", borderTop: "1px solid var(--color-border)", display: "flex", alignItems: "flex-end", gap: 8, flexShrink: 0 },
  attachBtn: { width: 36, height: 36, borderRadius: "50%", flexShrink: 0, marginBottom: 4, fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 150ms" },
  sidePanel: { width: 400, flexShrink: 0, display: "flex", flexDirection: "column" as const, background: "var(--color-bg-secondary)" },
  panelTabs: { display: "flex", borderBottom: "1px solid var(--color-border)", padding: "0 16px", flexShrink: 0 },
  panelTab: { padding: "16px 16px", background: "transparent", border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer", transition: "color 150ms ease" },
  panelContent: { flex: 1, overflowY: "auto" as const, padding: 20 },
  // Sidebar
  sidebarOverlay: { position: "fixed" as const, inset: 0, zIndex: 100, display: "flex" },
  sidebar: { width: 280, height: "100%", background: "#0A0C10", borderRight: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column" as const, position: "relative" as const, zIndex: 1 },
  sidebarBackdrop: { flex: 1, background: "rgba(0,0,0,0.5)", cursor: "pointer" },
  sidebarNav: { display: "flex", alignItems: "center", gap: 2, borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "8px 8px" },
  sidebarNavBtn: { width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, fontSize: 14, background: "transparent", border: "none", cursor: "pointer" },
  sidebarContent: { flex: 1, overflowY: "auto" as const, padding: "8px 6px" },
  sidebarFooter: { borderTop: "1px solid rgba(255,255,255,0.08)", padding: "8px 12px" },
  sidebarLabel: { fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.15em", color: "rgba(255,255,255,0.25)", padding: "4px 12px 4px", margin: 0 },
  sidebarMuted: { fontSize: 12, color: "rgba(255,255,255,0.25)", padding: "8px 12px", margin: 0 },
  sidebarMoreBtn: { background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "rgba(255,255,255,0.28)", padding: "4px 12px" },
  sidebarLink: { display: "flex", flexDirection: "column" as const, gap: 2, padding: "8px 12px", borderRadius: 8, textDecoration: "none", cursor: "pointer" },
  newChatBtn: { display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", marginBottom: 8, borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "rgba(255,255,255,0.65)", fontSize: 13, cursor: "pointer" },
  searchInput: { width: "100%", padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: 13, outline: "none", marginBottom: 8 },
  // Live preview modal
  livePreviewOverlay: { position: "fixed" as const, inset: 0, zIndex: 200, display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", gap: 12, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" },
  livePreviewInner: { borderRadius: 12, overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" },
  livePreviewClose: { borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.08)", padding: "8px 20px", fontSize: 13, fontWeight: 600, color: "#fff", cursor: "pointer" },
} as const;
