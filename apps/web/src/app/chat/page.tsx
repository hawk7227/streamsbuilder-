"use client";
export const dynamic = "force-dynamic";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { AssistantMessageList } from "@/components/ai-chat/AssistantMessageList";
import type { AssistantMessageShape } from "@/components/ai-chat/AssistantMessage";
import { AttachmentRail } from "@/components/ai-chat/AttachmentRail";
import { ContextChips } from "@/components/ai-chat/ContextChips";
import { VoiceBar } from "@/components/ai-chat/VoiceBar";
import { useAssistantContextBridge } from "@/components/ai-chat/useAssistantContextBridge";
import { ActivityStreamBar } from "@/lib/activity-stream/ActivityStreamBar";
import { ActivityController, registerActivityStreamMiddleware } from "@/lib/activity-stream/index";
import type { ActivityPhase } from "@/lib/activity-stream/index";
import { extractArtifactFromBuffer } from "@/lib/activity-stream/code-extractor";
import type { ExtractedArtifact } from "@/lib/activity-stream/code-extractor";
import { ArtifactCard } from "@/components/pipeline/ArtifactCard";
import type { ArtifactDestination } from "@/components/pipeline/ArtifactCard";
import { FloatingPreviewPanel } from "@/components/pipeline/FloatingPreviewPanel";
import { LivePreviewRenderer } from "@/components/pipeline/LivePreviewRenderer";
import type { AssistantMode } from "@/lib/enforcement/types";
import type { BuilderVerifierBotPayload } from "@/lib/verifier/types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ConversationItem { id: string; title: string; date: string; preview: string; updatedAt: string; }
type SidebarView = "home" | "history" | "search" | "projects" | "apps";
interface Action { type: string; payload: Record<string, unknown>; }

const INITIAL_MESSAGE: AssistantMessageShape = {
  role: "assistant",
  content: [{ type: "text", text: "Hi. I'm STREAMS. Ask me anything, build something, or let's explore an idea." }],
};

const STREAMS_APPS = [
  { id: "pipeline", name: "Pipeline Builder", icon: "⚡", href: "/pipeline/test",      desc: "AI pipeline builder" },
  { id: "image",    name: "Image Generator",  icon: "🖼", href: "/dashboard/image",    desc: "Realism-enforced" },
  { id: "video",    name: "Video Generator",  icon: "🎬", href: "/dashboard/video",    desc: "T2V and I2V" },
  { id: "voice",    name: "Voice Studio",     icon: "🎤", href: "/dashboard/voice",    desc: "STT / TTS" },
  { id: "library",  name: "Library",          icon: "📚", href: "/dashboard/library",  desc: "Generated assets" },
  { id: "editor",   name: "Editor",           icon: "✏️", href: "/editor",             desc: "GitHub file editor" },
] as const;

function detectMedia(text: string) {
  const blocks: AssistantMessageShape["content"] = [];
  const img = text.match(/https?:\/\/\S+\.(png|jpg|jpeg|webp|gif)/i);
  const vid = text.match(/https?:\/\/\S+\.(mp4|webm|mov)/i);
  if (img) blocks.push({ type: "image_url", image_url: { url: img[0] } });
  if (vid) blocks.push({ type: "video_url", image_url: { url: vid[0] } });
  return blocks as AssistantMessageShape["content"];
}

// ── Panel resize hook — same pattern as useAssistantWindow ────────────────────
// Left panel is resizable by dragging the right edge, just like the editor panel

function usePanelResize(defaultWidth = 420, minWidth = 300, maxWidth = 720, storageKey = "streams:chat-panel-width") {
  const [width, setWidth] = useState(() => {
    if (typeof window === "undefined") return defaultWidth;
    const stored = localStorage.getItem(storageKey);
    return stored ? parseInt(stored, 10) : defaultWidth;
  });
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    startX.current = e.clientX;
    startW.current = width;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [width]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      const next = Math.min(maxWidth, Math.max(minWidth, startW.current + (e.clientX - startX.current)));
      setWidth(next);
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      if (typeof window !== "undefined") localStorage.setItem(storageKey, String(width));
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp);
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
  }, [maxWidth, minWidth, storageKey, width]);

  return { width, onPointerDown };
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const PROJECT_ID = "00000000-0000-0000-0000-000000000001";

  // Panel resize
  const panel = usePanelResize();

  // Core chat state
  const [messages, setMessages] = useState<AssistantMessageShape[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [streamingMode, setStreamingMode] = useState<AssistantMode>("conversation");
  const [model, setModel] = useState(() => typeof window !== "undefined" ? (localStorage.getItem("streams:model") ?? "gpt-4o") : "gpt-4o");
  const [conversationId, setConversationId] = useState<string | undefined>(() => typeof window !== "undefined" ? (localStorage.getItem("streams_conv_id") ?? undefined) : undefined);
  const [verificationPayload, setVerificationPayload] = useState<BuilderVerifierBotPayload | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);

  // Artifact state
  const [currentArtifact, setCurrentArtifact] = useState<ExtractedArtifact | null>(null);
  const [artifactStreaming, setArtifactStreaming] = useState(false);
  const [floatingArtifact, setFloatingArtifact] = useState<ExtractedArtifact | null>(null);
  const [livePreviewArtifact, setLivePreviewArtifact] = useState<{ artifact: ExtractedArtifact; dest: ArtifactDestination } | null>(null);

  // Sidebar + attachment
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarView, setSidebarView] = useState<SidebarView>("home");
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ConversationItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [brainSaved, setBrainSaved] = useState(false);
  const [attachmentOpen, setAttachmentOpen] = useState(false);

  // Right panel — iframe workspace
  const [rightUrl, setRightUrl] = useState("");
  const [rightInput, setRightInput] = useState("");

  // Context bridge
  const { attachments, voiceTranscript, setVoiceTranscript, addAttachment, removeAttachment, clearAttachments, clearVoiceTranscript, requestContext } = useAssistantContextBridge(PROJECT_ID);

  // Activity stream
  useEffect(() => registerActivityStreamMiddleware(), []);

  // Conversation history
  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/conversations", { credentials: "include" });
      if (res.ok) { const d = await res.json() as { data: ConversationItem[] }; setConversations(d.data ?? []); }
    } catch { /* non-fatal */ }
    setHistoryLoading(false);
  }, []);

  useEffect(() => { if (sidebarOpen) void fetchHistory(); }, [sidebarOpen, fetchHistory]);

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    setSearchLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/conversations/search?q=${encodeURIComponent(searchQuery)}`, { credentials: "include" });
        if (res.ok) { const d = await res.json() as { data: ConversationItem[] }; setSearchResults(d.data ?? []); }
      } catch { /* non-fatal */ }
      setSearchLoading(false);
    }, 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const loadConversation = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/conversations/${id}`, { credentials: "include" });
      if (!res.ok) return;
      const d = await res.json() as { data: { messages: Array<{ role: string; content: string }> } };
      const loaded: AssistantMessageShape[] = (d.data.messages ?? []).map((m) => ({ role: m.role as AssistantMessageShape["role"], content: [{ type: "text" as const, text: m.content }] }));
      setMessages(loaded.length ? loaded : [INITIAL_MESSAGE]);
      setConversationId(id);
      if (typeof window !== "undefined") localStorage.setItem("streams_conv_id", id);
      setSidebarOpen(false);
    } catch { /* non-fatal */ }
  }, []);

  const deleteConversation = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`/api/conversations/${id}`, { method: "DELETE", credentials: "include" });
    setConversations((p) => p.filter((c) => c.id !== id));
    if (conversationId === id) { setConversationId(undefined); setMessages([INITIAL_MESSAGE]); if (typeof window !== "undefined") localStorage.removeItem("streams_conv_id"); }
  }, [conversationId]);

  const startNewChat = useCallback(() => {
    setMessages([INITIAL_MESSAGE]); setStreamingText(""); setConversationId(undefined);
    setCurrentArtifact(null); setArtifactStreaming(false); setInput("");
    setVerificationPayload(undefined);
    if (typeof window !== "undefined") localStorage.removeItem("streams_conv_id");
    setSidebarOpen(false);
  }, []);

  const performAction = useCallback((action: Action) => {
    switch (action.type) {
      case "generate_image": void fetch("/api/generate-image", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ prompt: action.payload.prompt ?? "Generate image" }) }); break;
      case "generate_video": void fetch("/api/video/scratch", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ prompt: action.payload.prompt ?? "Generate video" }) }); break;
      case "run_pipeline": void fetch("/api/pipeline/run", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ mode: "runPipeline" }) }); break;
      case "run_step": void fetch("/api/pipeline/run-node", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ type: action.payload.stepId, data: action.payload.data ?? {} }) }); break;
      case "save_to_brain":
        void fetch("/api/brain", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ type: "decision", content: String(action.payload.content ?? ""), projectId: PROJECT_ID, conversationId, title: String(action.payload.content ?? "").slice(0, 60) }) });
        setBrainSaved(true); setTimeout(() => setBrainSaved(false), 2000); break;
    }
  }, [conversationId]);

  const handleArtifactPreview = useCallback((dest: ArtifactDestination) => {
    if (!currentArtifact) return;
    if (dest === "float") setFloatingArtifact(currentArtifact);
    else setLivePreviewArtifact({ artifact: currentArtifact, dest });
  }, [currentArtifact]);

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (rawMessage: string) => {
    const message = rawMessage.trim();
    if ((!message && !attachments.length && !voiceTranscript.trim()) || pending) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const parts: AssistantMessageShape["content"] = [];
    if (message) parts.push({ type: "text", text: message });
    if (attachments.length) parts.push({ type: "text", text: `[attachments: ${attachments.map((a) => `${a.kind}:${a.label}`).join(", ")}]` });
    if (voiceTranscript.trim()) parts.push({ type: "text", text: `[voice]\n${voiceTranscript.trim()}` });

    const nextMessages = [...messages, { role: "user" as const, content: parts }];
    setMessages(nextMessages); setInput(""); setPending(true);
    setStreamingText(""); setStreamingMode("conversation");
    setCurrentArtifact(null); setArtifactStreaming(false);
    setVerificationPayload(undefined);
    ActivityController.responseStarted();

    try {
      const res = await fetch("/api/ai-assistant", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        signal: controller.signal,
        body: JSON.stringify({ messages: nextMessages, context: { projectId: PROJECT_ID }, requestContext, conversationId, model }),
      });
      if (!res.ok || !res.body) throw new Error(await res.text().catch(() => "Assistant failed"));

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "", fullText = "", mode: AssistantMode = "conversation";
      let pendingVerificationPayload: BuilderVerifierBotPayload | undefined;

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
            const evt = JSON.parse(line.slice(6)) as { type: string; delta?: string; action?: Action; phase?: string; label?: string; message?: string; conversationId?: string; mode?: AssistantMode; payload?: BuilderVerifierBotPayload; };
            if (evt.type === "phase" && evt.phase) ActivityController.phase(evt.phase as ActivityPhase, evt.label);
            else if (evt.type === "conversation_id" && evt.conversationId) { setConversationId(evt.conversationId); if (typeof window !== "undefined") localStorage.setItem("streams_conv_id", evt.conversationId); }
            else if (evt.type === "verification_result" && evt.payload) { pendingVerificationPayload = evt.payload; }
            else if (evt.type === "text" && evt.delta) {
              fullText += evt.delta; setStreamingText(fullText);
              const detected = extractArtifactFromBuffer(fullText);
              if (detected) { setCurrentArtifact(detected); setArtifactStreaming(!detected.isComplete); if (!detected.isComplete) ActivityController.toolStarted("code_generator", "Generating…"); else ActivityController.toolCompleted("code_generator", "Ready"); }
            } else if (evt.type === "action" && evt.action) performAction(evt.action);
            else if (evt.type === "done") { if (evt.conversationId) { setConversationId(evt.conversationId); if (typeof window !== "undefined") localStorage.setItem("streams_conv_id", evt.conversationId); } if (evt.mode) mode = evt.mode; setStreamingMode(mode); }
            else if (evt.type === "error" && evt.message) { fullText += `\n\n${evt.message}`; setStreamingText(fullText); ActivityController.toolFailed("unknown", evt.message); }
          } catch { /* skip malformed */ }
        }
      }

      setArtifactStreaming(false); setStreamingText("");
      const finalPayload = pendingVerificationPayload;
      setMessages((prev) => [...prev, {
        role: "assistant", mode,
        content: finalPayload ? [{ type: "text" as const, text: "" }] : ([{ type: "text" as const, text: fullText || "Request completed." }, ...detectMedia(fullText)] as AssistantMessageShape["content"]),
        verificationPayload: finalPayload,
      } as AssistantMessageShape]);
      if (finalPayload) setVerificationPayload(finalPayload);
      ActivityController.responseCompleted(); clearAttachments(); clearVoiceTranscript();
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      const msg = err instanceof Error ? err.message : "Assistant failed";
      ActivityController.toolFailed("unknown", msg); setStreamingText("");
      setMessages((prev) => [...prev, { role: "assistant", mode: "conversation", content: [{ type: "text" as const, text: `Error: ${msg}` }] }]);
    } finally { setPending(false); abortRef.current = null; }
  }, [attachments, voiceTranscript, pending, messages, requestContext, conversationId, model, clearAttachments, clearVoiceTranscript, performAction]);

  // ── Sidebar content ───────────────────────────────────────────────────────
  const ConvItem = useCallback(({ conv }: { conv: ConversationItem }) => (
    <div onClick={() => void loadConversation(conv.id)} style={{ padding: "8px 12px", borderRadius: 8, cursor: "pointer", display: "flex", flexDirection: "column", gap: 2, background: conversationId === conv.id ? "rgba(255,255,255,0.08)" : "transparent" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: conversationId === conv.id ? "#fff" : "rgba(255,255,255,0.7)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{conv.title}</span>
        <button type="button" onClick={(e) => void deleteConversation(conv.id, e)} style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", background: "none", border: "none", cursor: "pointer", padding: "0 4px", flexShrink: 0 }}>✕</button>
      </div>
      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{conv.date}</span>
    </div>
  ), [conversationId, loadConversation, deleteConversation]);

  const footer = useMemo(() => (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <ActivityStreamBar />
      {currentArtifact && (
        <ArtifactCard artifact={currentArtifact} isStreaming={artifactStreaming} autoPreview={true} onPreview={handleArtifactPreview} onViewCode={() => setFloatingArtifact(currentArtifact)} />
      )}
      {brainSaved && <div style={{ fontSize: 11, color: "#6ee7b7" }}>💡 Saved to STREAMS Brain</div>}
      {attachmentOpen && (
        <div style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden" }}>
          <AttachmentRail onAdd={(a) => { addAttachment(a); setAttachmentOpen(false); }} />
        </div>
      )}
      {(attachments.length > 0 || voiceTranscript?.trim()) && (
        <ContextChips attachments={attachments} voiceTranscript={voiceTranscript} onRemoveAttachment={removeAttachment} onClearVoice={clearVoiceTranscript} />
      )}
      <VoiceBar onTranscript={setVoiceTranscript} speakText={streamingText && !pending ? streamingText : undefined} />
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
        <button type="button" onClick={() => setAttachmentOpen((o) => !o)}
          style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0, marginBottom: 4, border: attachmentOpen ? "1px solid rgba(103,232,249,0.4)" : "1px solid rgba(255,255,255,0.15)", background: attachmentOpen ? "rgba(103,232,249,0.1)" : "rgba(255,255,255,0.06)", color: attachmentOpen ? "#67e8f9" : "rgba(255,255,255,0.6)", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
        <textarea id="chat-input" name="chat-input" value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(input); } }}
          placeholder="Ask, build, explore, verify…" rows={1} disabled={pending}
          style={{ flex: 1, resize: "none", borderRadius: 20, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.2)", color: "#fff", padding: "10px 14px", fontSize: 14, outline: "none", maxHeight: 120, minHeight: 40, fontFamily: "inherit" }} />
        <select value={model} onChange={(e) => { setModel(e.target.value); if (typeof window !== "undefined") localStorage.setItem("streams:model", e.target.value); }}
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.6)", borderRadius: 10, padding: "4px 6px", fontSize: 10, cursor: "pointer", outline: "none", marginBottom: 4, flexShrink: 0 }}>
          <optgroup label="OpenAI"><option value="gpt-4o">GPT-4o</option><option value="gpt-4o-mini">GPT-4o mini</option></optgroup>
          <optgroup label="Anthropic"><option value="claude-sonnet-4-6">Sonnet 4.6</option><option value="claude-opus-4-6">Opus 4.6</option><option value="claude-haiku-4-5-20251001">Haiku 4.5</option></optgroup>
        </select>
        <button type="button" onClick={() => void sendMessage(input)} disabled={(!input.trim() && !attachments.length && !voiceTranscript?.trim()) || pending}
          style={{ height: 40, borderRadius: 20, background: "#fff", color: "#0A0C10", padding: "0 18px", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: ((!input.trim() && !attachments.length && !voiceTranscript?.trim()) || pending) ? 0.4 : 1, border: "none", flexShrink: 0 }}>
          {pending ? "…" : "Send"}
        </button>
      </div>
    </div>
  ), [addAttachment, attachments, attachmentOpen, artifactStreaming, brainSaved, clearVoiceTranscript, currentArtifact, handleArtifactPreview, input, model, pending, removeAttachment, sendMessage, setVoiceTranscript, streamingText, voiceTranscript]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "#0A0C10", color: "#fff", fontFamily: "system-ui,-apple-system,sans-serif" }}>

      {/* ── Sidebar overlay ──────────────────────────────────────────────── */}
      {sidebarOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex" }}>
          <div style={{ width: 260, height: "100%", background: "#0A0C10", borderRight: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 2, borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "8px" }}>
              {([{ id: "home", icon: "⌂" }, { id: "history", icon: "◷" }, { id: "search", icon: "⌕" }, { id: "projects", icon: "⊞" }, { id: "apps", icon: "⊕" }] as const).map((nav) => (
                <button key={nav.id} type="button" onClick={() => setSidebarView(nav.id)}
                  style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, fontSize: 14, background: sidebarView === nav.id ? "rgba(255,255,255,0.12)" : "transparent", color: sidebarView === nav.id ? "#fff" : "rgba(255,255,255,0.35)", border: "none", cursor: "pointer" }}>
                  {nav.icon}
                </button>
              ))}
              <button type="button" onClick={startNewChat} style={{ width: 28, height: 28, marginLeft: "auto", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, fontSize: 14, background: "transparent", color: "rgba(255,255,255,0.35)", border: "none", cursor: "pointer" }}>✎</button>
              <button type="button" onClick={() => setSidebarOpen(false)} style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, fontSize: 14, background: "transparent", color: "rgba(255,255,255,0.35)", border: "none", cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 6px" }}>
              {sidebarView === "home" && (
                <div>
                  <button type="button" onClick={startNewChat} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", marginBottom: 8, borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "rgba(255,255,255,0.65)", fontSize: 13, cursor: "pointer" }}><span>✎</span><span>New conversation</span></button>
                  <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: "rgba(255,255,255,0.25)", padding: "4px 12px", margin: 0 }}>Recent</p>
                  {historyLoading && <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", padding: "8px 12px", margin: 0 }}>Loading…</p>}
                  {!historyLoading && conversations.slice(0, 6).map((c) => <ConvItem key={c.id} conv={c} />)}
                </div>
              )}
              {sidebarView === "history" && (
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: "rgba(255,255,255,0.25)", padding: "4px 12px", margin: "0 0 4px" }}>All conversations</p>
                  {historyLoading && <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", padding: "8px 12px", margin: 0 }}>Loading…</p>}
                  {!historyLoading && conversations.map((c) => <ConvItem key={c.id} conv={c} />)}
                </div>
              )}
              {sidebarView === "search" && (
                <div>
                  <input id="conv-search" name="conv-search" type="search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search conversations…" autoFocus
                    style={{ width: "100%", padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: 13, outline: "none", marginBottom: 8, boxSizing: "border-box" }} />
                  {searchLoading && <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", padding: "8px 12px", margin: 0 }}>Searching…</p>}
                  {!searchLoading && searchResults.map((c) => <ConvItem key={c.id} conv={c} />)}
                </div>
              )}
              {sidebarView === "projects" && (
                <div>
                  {[{ name: "Pipeline Builder", href: "/pipeline/test", desc: "Visual pipeline" }, { name: "Image Generator", href: "/dashboard/image", desc: "Realism-enforced" }, { name: "Video Generator", href: "/dashboard/video", desc: "T2V and I2V" }, { name: "Voice Studio", href: "/dashboard/voice", desc: "STT / TTS" }, { name: "Library", href: "/dashboard/library", desc: "Generated assets" }].map((p) => (
                    <a key={p.href} href={p.href} style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 12px", borderRadius: 8, textDecoration: "none" }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.7)" }}>{p.name}</span>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{p.desc}</span>
                    </a>
                  ))}
                </div>
              )}
              {sidebarView === "apps" && (
                <div>
                  {STREAMS_APPS.map((app) => (
                    <a key={app.id} href={app.href} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", borderRadius: 8, textDecoration: "none" }}>
                      <span style={{ fontSize: 18 }}>{app.icon}</span>
                      <div><p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.7)", margin: 0 }}>{app.name}</p><p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", margin: 0 }}>{app.desc}</p></div>
                    </a>
                  ))}
                </div>
              )}
            </div>
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", padding: "8px 12px" }}>
              <p style={{ fontSize: 10, color: "rgba(255,255,255,0.18)", margin: 0 }}>Auto-mode · governed · no manual switching</p>
            </div>
          </div>
          <div style={{ flex: 1, background: "rgba(0,0,0,0.5)", cursor: "pointer" }} onClick={() => setSidebarOpen(false)} />
        </div>
      )}

      {/* ── LEFT: Chat panel (resizable) ─────────────────────────────────── */}
      <div style={{ width: panel.width, flexShrink: 0, display: "flex", flexDirection: "column", borderRight: "1px solid rgba(255,255,255,0.08)", overflow: "hidden", position: "relative" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 16px", height: 48, borderBottom: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
          <button type="button" onClick={() => setSidebarOpen(true)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "rgba(255,255,255,0.5)", padding: "4px 8px", borderRadius: 6 }}>☰</button>
          <div style={{ flex: 1, textAlign: "center" }}>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.18em", color: "rgba(255,255,255,0.35)" }}>STREAMS CHAT</span>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#fff", margin: 0 }}>{conversationId ? (conversations.find((c) => c.id === conversationId)?.title ?? "Conversation") : "New conversation"}</p>
          </div>
          <button type="button" onClick={startNewChat} style={{ borderRadius: 999, border: "1px solid rgba(255,255,255,0.1)", padding: "4px 10px", fontSize: 11, color: "rgba(255,255,255,0.45)", background: "none", cursor: "pointer" }}>✎ New</button>
        </div>

        {/* Messages */}
        <AssistantMessageList messages={messages} streamingText={streamingText} streamingMode={streamingMode} pending={pending} />

        {/* Footer */}
        <div style={{ flexShrink: 0, borderTop: "1px solid rgba(255,255,255,0.08)", padding: "8px 16px 12px" }}>
          {footer}
        </div>

        {/* ── Drag handle — right edge, same as editor panel pattern ────── */}
        <div
          onPointerDown={panel.onPointerDown}
          style={{
            position: "absolute", right: 0, top: 0, bottom: 0, width: 4,
            cursor: "col-resize",
            background: "transparent",
            zIndex: 10,
            transition: "background 150ms",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(103,232,249,0.25)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
        />
      </div>

      {/* ── RIGHT: Workspace iframe panel ────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
        {/* URL bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 12px", height: 48, borderBottom: "1px solid rgba(255,255,255,0.08)", flexShrink: 0, background: "rgba(0,0,0,0.15)" }}>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", flexShrink: 0 }}>WORKSPACE</span>
          <div style={{ flex: 1, display: "flex", gap: 6, alignItems: "center" }}>
            <input id="workspace-url" name="workspace-url" value={rightInput} onChange={(e) => setRightInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") setRightUrl(rightInput.startsWith("http") ? rightInput : `https://${rightInput}`); }}
              placeholder="Enter URL to load in workspace…"
              style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", padding: "6px 10px", fontSize: 12, outline: "none" }} />
            <button type="button" onClick={() => setRightUrl(rightInput.startsWith("http") ? rightInput : `https://${rightInput}`)}
              style={{ borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)", padding: "6px 12px", fontSize: 11, cursor: "pointer" }}>Go</button>
          </div>
          {/* Quick links */}
          <div style={{ display: "flex", gap: 4 }}>
            {[{ label: "Pipeline", url: "/pipeline/test" }, { label: "Images", url: "/dashboard/image" }, { label: "Video", url: "/dashboard/video" }].map((q) => (
              <button key={q.label} type="button" onClick={() => { setRightUrl(q.url); setRightInput(q.url); }}
                style={{ borderRadius: 6, border: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "rgba(255,255,255,0.4)", padding: "4px 8px", fontSize: 10, cursor: "pointer" }}>
                {q.label}
              </button>
            ))}
          </div>
        </div>

        {/* Iframe or empty state */}
        {rightUrl ? (
          <iframe src={rightUrl} style={{ flex: 1, width: "100%", border: "none", background: "#000" }} title="Workspace" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals" />
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, background: "rgba(0,0,0,0.1)" }}>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.2)", margin: 0 }}>Workspace — load a URL above</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
              {STREAMS_APPS.map((app) => (
                <button key={app.id} type="button" onClick={() => { setRightUrl(app.href); setRightInput(app.href); }}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "16px 20px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", cursor: "pointer", minWidth: 100 }}>
                  <span style={{ fontSize: 24 }}>{app.icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.6)" }}>{app.name}</span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{app.desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Overlays ──────────────────────────────────────────────────────── */}
      {floatingArtifact && <FloatingPreviewPanel artifact={floatingArtifact} onClose={() => setFloatingArtifact(null)} />}
      {livePreviewArtifact && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }} onClick={() => setLivePreviewArtifact(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ borderRadius: 12, overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
            <LivePreviewRenderer artifact={livePreviewArtifact.artifact} width={livePreviewArtifact.dest === "desktop" ? 900 : 390} height={livePreviewArtifact.dest === "desktop" ? 600 : 700} />
          </div>
          <button onClick={() => setLivePreviewArtifact(null)} style={{ borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.08)", padding: "8px 20px", fontSize: 13, fontWeight: 600, color: "#fff", cursor: "pointer" }}>Close</button>
        </div>
      )}
    </div>
  );
}
