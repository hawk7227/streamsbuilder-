"use client";

import { useState, useCallback, useEffect, useRef } from "react";
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

interface ConversationItem {
  id: string;
  title: string;
  date: string;
  preview: string;
  updatedAt: string;
}

type SidebarView = "home" | "history" | "search" | "projects" | "apps";

interface Action { type: string; payload: Record<string, unknown>; }

// ── Helpers ───────────────────────────────────────────────────────────────────

const INITIAL_MESSAGE: AssistantMessageShape = {
  role: "assistant",
  content: [{ type: "text", text: "Hi. I'm STREAMS. Ask me anything, build something, or let's explore an idea." }],
};

function getStored(key: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return localStorage.getItem(key) ?? fallback;
}

function detectMedia(text: string): Array<{ type: "image_url" | "video_url"; image_url: { url: string } }> {
  const blocks: Array<{ type: "image_url" | "video_url"; image_url: { url: string } }> = [];
  const imgRe = /https?:\/\/\S+\.(?:png|jpg|jpeg|webp|gif)(?:\?\S*)?/gi;
  const vidRe = /https?:\/\/\S+\.(?:mp4|webm|mov)(?:\?\S*)?/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(text))) blocks.push({ type: "image_url", image_url: { url: m[0] } });
  while ((m = vidRe.exec(text))) blocks.push({ type: "video_url", image_url: { url: m[0] } });
  return blocks;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const projectId = "00000000-0000-0000-0000-000000000001";

  // ── Core chat state ───────────────────────────────────────────────────────
  const [messages, setMessages] = useState<AssistantMessageShape[]>([INITIAL_MESSAGE]);
  const [pending, setPending] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [streamingMode, setStreamingMode] = useState<AssistantMode>("conversation");
  const [model, setModel] = useState(() => getStored("streams:model", "gpt-4o"));
  const [conversationId, setConversationId] = useState<string | undefined>(
    () => getStored("streams_conv_id", "") || undefined
  );
  const [error, setError] = useState<string | null>(null);
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
  const [input, setInput] = useState("");

  // ── Context bridge ────────────────────────────────────────────────────────
  const {
    attachments, voiceTranscript, setVoiceTranscript,
    addAttachment, removeAttachment, clearAttachments, clearVoiceTranscript, requestContext,
  } = useAssistantContextBridge(projectId);

  // ── Activity stream ───────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = registerActivityStreamMiddleware();
    return unsub;
  }, []);

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
      const loaded: AssistantMessageShape[] = (data.data.messages ?? []).map((m) => ({
        role: m.role as AssistantMessageShape["role"],
        content: [{ type: "text" as const, text: m.content }],
      }));
      setMessages(loaded.length ? loaded : [INITIAL_MESSAGE]);
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
      setMessages([INITIAL_MESSAGE]);
      if (typeof window !== "undefined") localStorage.removeItem("streams_conv_id");
    }
  }, [conversationId]);

  const startNewChat = useCallback(() => {
    setMessages([INITIAL_MESSAGE]);
    setStreamingText("");
    setConversationId(undefined);
    setCurrentArtifact(null);
    setArtifactStreaming(false);
    setError(null);
    setInput("");
    if (typeof window !== "undefined") localStorage.removeItem("streams_conv_id");
    setSidebarOpen(false);
  }, []);

  // ── Action dispatcher ─────────────────────────────────────────────────────
  const performAction = useCallback((action: Action) => {
    switch (action.type) {
      case "generate_image":
        void fetch("/api/generate-image", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ prompt: action.payload.prompt ?? "Generate image", conceptId: action.payload.conceptId, mode: "images" }) });
        break;
      case "generate_video":
        void fetch("/api/video/scratch", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ prompt: action.payload.prompt ?? "Generate video", conceptId: action.payload.conceptId }) });
        break;
      case "run_pipeline":
        void fetch("/api/pipeline/run", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ mode: "runPipeline" }) });
        break;
      case "run_step":
        void fetch("/api/pipeline/run-node", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ type: action.payload.stepId, data: action.payload.data ?? {} }) });
        break;
      case "save_to_brain":
        void fetch("/api/brain", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ type: "decision", content: String(action.payload.content ?? ""), projectId, conversationId, title: String(action.payload.content ?? "").slice(0, 60) }) });
        setBrainSaved(true);
        setTimeout(() => setBrainSaved(false), 2000);
        break;
    }
  }, [projectId, conversationId]);

  // ── Artifact destination ──────────────────────────────────────────────────
  const handleArtifactPreview = useCallback((dest: ArtifactDestination) => {
    if (!currentArtifact) return;
    if (dest === "float") setFloatingArtifact(currentArtifact);
    else setLivePreviewArtifact({ artifact: currentArtifact, dest });
  }, [currentArtifact]);

  // ── Send message — wired exactly like the floater ─────────────────────────
  const sendMessage = useCallback(async (rawMessage: string) => {
    const message = rawMessage.trim();
    if ((!message && !attachments.length && !voiceTranscript.trim()) || pending) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const parts: AssistantMessageShape["content"] = [];
    if (message) parts.push({ type: "text", text: message });
    if (attachments.length) parts.push({ type: "text", text: `[context attachments: ${attachments.map((a) => `${a.kind}:${a.label}`).join(", ")}]` });
    if (voiceTranscript.trim()) parts.push({ type: "text", text: `[voice transcript]\n${voiceTranscript.trim()}` });

    const userMsg: AssistantMessageShape = { role: "user", content: parts };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setPending(true);
    setStreamingText("");
    setStreamingMode("conversation");
    setCurrentArtifact(null);
    setArtifactStreaming(false);
    setError(null);

    ActivityController.responseStarted();

    try {
      const res = await fetch("/api/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        signal: controller.signal,
        body: JSON.stringify({
          messages: nextMessages,
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
      let mode: AssistantMode = "conversation";
      let verificationPayload: BuilderVerifierBotPayload | undefined = undefined;

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
              type: string; delta?: string; action?: Action; phase?: string;
              label?: string; message?: string; conversationId?: string; mode?: AssistantMode;
              payload?: BuilderVerifierBotPayload;
            };

            if (evt.type === "phase" && evt.phase) {
              ActivityController.phase(evt.phase as ActivityPhase, evt.label);
            } else if (evt.type === "conversation_id" && evt.conversationId) {
              setConversationId(evt.conversationId);
              if (typeof window !== "undefined") localStorage.setItem("streams_conv_id", evt.conversationId);
            } else if (evt.type === "verification_result" && evt.payload) {
              verificationPayload = evt.payload;
            } else if (evt.type === "text" && evt.delta) {
              fullText += evt.delta;
              setStreamingText(fullText);
              const detected = extractArtifactFromBuffer(fullText);
              if (detected) {
                setCurrentArtifact(detected);
                setArtifactStreaming(!detected.isComplete);
                if (!detected.isComplete) ActivityController.toolStarted("code_generator", "Generating component...");
                else ActivityController.toolCompleted("code_generator", "Component ready");
              }
            } else if (evt.type === "action" && evt.action) {
              performAction(evt.action);
            } else if (evt.type === "done") {
              if (evt.conversationId) {
                setConversationId(evt.conversationId);
                if (typeof window !== "undefined") localStorage.setItem("streams_conv_id", evt.conversationId);
              }
              if (evt.mode) mode = evt.mode;
              setStreamingMode(mode);
            } else if (evt.type === "error" && evt.message) {
              fullText += `\n\n${evt.message}`;
              setStreamingText(fullText);
              ActivityController.toolFailed("unknown", evt.message);
            }
          } catch { /* malformed SSE frame — skip */ }
        }
      }

      setArtifactStreaming(false);
      setStreamingText("");
      setMessages((prev) => [...prev, {
        role: "assistant",
        mode,
        content: verificationPayload
          ? [{ type: "text" as const, text: "" }]
          : [{ type: "text" as const, text: fullText || "Request completed." }, ...detectMedia(fullText)],
        verificationPayload,
      }]);
      ActivityController.responseCompleted();
      clearAttachments();
      clearVoiceTranscript();
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      const msg = err instanceof Error ? err.message : "Assistant failed";
      ActivityController.toolFailed("unknown", msg);
      setStreamingText("");
      setMessages((prev) => [...prev, {
        role: "assistant",
        mode: "verification",
        content: [{ type: "text", text: `VERIFIED:\n- Request reached the assistant layer.\n\nNOT VERIFIED:\n- Response could not be completed.\n\nREQUIRES RUNTIME:\n- Inspect the failed request path.\n\nRISKS:\n- ${msg}` }],
      }]);
    } finally {
      setPending(false);
      abortRef.current = null;
    }
  }, [attachments, voiceTranscript, pending, messages, requestContext, conversationId, model, projectId, clearAttachments, clearVoiceTranscript, performAction]);

  // ── Sidebar apps ──────────────────────────────────────────────────────────
  const STREAMS_APPS = [
    { id: "pipeline", name: "Pipeline Builder", icon: "⚡", href: "/pipeline/test", desc: "AI pipeline builder" },
    { id: "image",    name: "Image Generator",  icon: "🖼", href: "/dashboard/image",     desc: "Realism-enforced" },
    { id: "video",    name: "Video Generator",  icon: "🎬", href: "/dashboard/video",     desc: "T2V and I2V" },
    { id: "voice",    name: "Voice Studio",     icon: "🎙", href: "/dashboard/voice",     desc: "STT / TTS" },
    { id: "library",  name: "Library",          icon: "📚", href: "/dashboard/library",   desc: "Generated assets" },
    { id: "operator", name: "Operator",         icon: "⚙️", href: "/dashboard/operator",  desc: "System health" },
    { id: "editor",   name: "Editor",           icon: "✏️", href: "/editor",              desc: "GitHub file editor" },
  ];

  const ConvItem = useCallback(({ conv }: { conv: ConversationItem }) => (
    <div onClick={() => void loadConversation(conv.id)} style={{ padding: "8px 12px", borderRadius: 8, cursor: "pointer", display: "flex", flexDirection: "column", gap: 2, background: conversationId === conv.id ? "rgba(255,255,255,0.08)" : "transparent" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: conversationId === conv.id ? "#fff" : "rgba(255,255,255,0.7)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{conv.title}</span>
        <button type="button" onClick={(e) => void deleteConversation(conv.id, e)} style={{ fontSize: 10, color: "transparent", background: "none", border: "none", cursor: "pointer", padding: "0 4px", flexShrink: 0 }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.5)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "transparent"; }}>✕</button>
      </div>
      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{conv.date}</span>
      {conv.preview && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{conv.preview}</span>}
    </div>
  ), [conversationId, loadConversation, deleteConversation]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "#0A0C10", color: "#fff", fontFamily: "system-ui,-apple-system,sans-serif" }}>

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      {sidebarOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex" }}>
          <div style={{ width: 260, height: "100%", background: "#0A0C10", borderRight: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column" }}>
            {/* Nav */}
            <div style={{ display: "flex", alignItems: "center", gap: 2, borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "8px 8px" }}>
              {([{ id: "home", icon: "⌂" }, { id: "history", icon: "◷" }, { id: "search", icon: "⌕" }, { id: "projects", icon: "⊞" }, { id: "apps", icon: "⊕" }] as const).map((nav) => (
                <button key={nav.id} type="button" title={nav.id} onClick={() => setSidebarView(nav.id)}
                  style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, fontSize: 14, background: sidebarView === nav.id ? "rgba(255,255,255,0.12)" : "transparent", color: sidebarView === nav.id ? "#fff" : "rgba(255,255,255,0.35)", border: "none", cursor: "pointer" }}>
                  {nav.icon}
                </button>
              ))}
              <button type="button" title="New chat" onClick={startNewChat} style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, fontSize: 14, background: "transparent", color: "rgba(255,255,255,0.35)", border: "none", cursor: "pointer", marginLeft: "auto" }}>✎</button>
              <button type="button" onClick={() => setSidebarOpen(false)} style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, fontSize: 14, background: "transparent", color: "rgba(255,255,255,0.35)", border: "none", cursor: "pointer" }}>✕</button>
            </div>
            {/* Content */}
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 6px" }}>
              {sidebarView === "home" && (
                <div>
                  <button type="button" onClick={startNewChat} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", marginBottom: 8, borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "rgba(255,255,255,0.65)", fontSize: 13, cursor: "pointer" }}>
                    <span>✎</span><span>New conversation</span>
                  </button>
                  <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: "rgba(255,255,255,0.25)", padding: "4px 12px", margin: 0 }}>Recent</p>
                  {historyLoading && <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", padding: "8px 12px", margin: 0 }}>Loading…</p>}
                  {!historyLoading && conversations.slice(0, 6).map((c) => <ConvItem key={c.id} conv={c} />)}
                  {conversations.length > 6 && (
                    <button type="button" onClick={() => setSidebarView("history")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "rgba(255,255,255,0.28)", padding: "4px 12px" }}>
                      View all {conversations.length} →
                    </button>
                  )}
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
                  <input type="search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search conversations…" autoFocus
                    style={{ width: "100%", padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: 13, outline: "none", marginBottom: 8, boxSizing: "border-box" }} />
                  {searchLoading && <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", padding: "8px 12px", margin: 0 }}>Searching…</p>}
                  {!searchLoading && searchResults.map((c) => <ConvItem key={c.id} conv={c} />)}
                  {!searchQuery.trim() && <p style={{ fontSize: 12, color: "rgba(255,255,255,0.2)", padding: "8px 12px", margin: 0 }}>Search titles and message content</p>}
                </div>
              )}
              {sidebarView === "projects" && (
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: "rgba(255,255,255,0.25)", padding: "4px 12px", margin: "0 0 4px" }}>STREAMS Workspace</p>
                  {[{ name: "Pipeline Builder", href: "/pipeline/test", desc: "Visual pipeline" }, { name: "Image Generator", href: "/dashboard/image", desc: "Realism-enforced" }, { name: "Video Generator", href: "/dashboard/video", desc: "T2V and I2V" }, { name: "Voice Studio", href: "/dashboard/voice", desc: "STT / TTS" }, { name: "Library", href: "/dashboard/library", desc: "Generated assets" }, { name: "Editor", href: "/editor", desc: "GitHub file editor" }].map((p) => (
                    <a key={p.href} href={p.href} style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 12px", borderRadius: 8, textDecoration: "none" }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.7)" }}>{p.name}</span>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{p.desc}</span>
                    </a>
                  ))}
                </div>
              )}
              {sidebarView === "apps" && (
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: "rgba(255,255,255,0.25)", padding: "4px 12px", margin: "0 0 4px" }}>STREAMS Tools</p>
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

      {/* ── Main chat panel ───────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 16px", height: 48, borderBottom: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
          <button type="button" onClick={() => setSidebarOpen(true)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "rgba(255,255,255,0.5)", display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", borderRadius: 6 }}>
            ☰
            {conversations.length > 0 && <span style={{ fontSize: 10, background: "rgba(255,255,255,0.15)", borderRadius: 10, padding: "1px 5px" }}>{conversations.length}</span>}
          </button>
          <div style={{ flex: 1, textAlign: "center" }}>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.18em", color: "rgba(255,255,255,0.35)" }}>STREAMS CHAT</span>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#fff", margin: 0 }}>
              {conversationId ? (conversations.find((c) => c.id === conversationId)?.title ?? "Conversation") : "New conversation"}
            </p>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" onClick={startNewChat} style={{ borderRadius: 999, border: "1px solid rgba(255,255,255,0.1)", padding: "4px 10px", fontSize: 11, color: "rgba(255,255,255,0.45)", background: "none", cursor: "pointer" }}>✎ New</button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 24px", background: "rgba(239,68,68,0.15)", borderBottom: "1px solid rgba(239,68,68,0.3)", color: "#fca5a5", fontSize: 13, flexShrink: 0 }}>
            <span>{error}</span>
            <button type="button" style={{ background: "none", border: "none", color: "#fca5a5", cursor: "pointer", fontSize: 16 }} onClick={() => setError(null)}>✕</button>
          </div>
        )}

        {/* Messages — uses AssistantMessageList exactly like the floater */}
        <AssistantMessageList
          messages={messages}
          streamingText={streamingText}
          streamingMode={streamingMode}
          pending={pending}
        />

        {/* Bottom area */}
        <div style={{ flexShrink: 0, borderTop: "1px solid rgba(255,255,255,0.08)", padding: "8px 16px 12px" }}>
          {/* Activity bar */}
          <ActivityStreamBar />

          {/* Artifact chip */}
          {currentArtifact && (
            <div style={{ marginTop: 6 }}>
              <ArtifactCard artifact={currentArtifact} isStreaming={artifactStreaming} autoPreview={true} onPreview={handleArtifactPreview} onViewCode={() => setFloatingArtifact(currentArtifact)} />
            </div>
          )}

          {/* Brain saved */}
          {brainSaved && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#6ee7b7", marginTop: 4 }}>
              <span>💡</span><span>Saved to STREAMS Brain</span>
            </div>
          )}

          {/* Attachment rail */}
          {attachmentOpen && (
            <div style={{ marginTop: 6, borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden" }}>
              <AttachmentRail onAdd={(a) => { addAttachment(a); setAttachmentOpen(false); }} />
            </div>
          )}

          {/* Context chips */}
          {(attachments.length > 0 || voiceTranscript?.trim()) && (
            <div style={{ marginTop: 6 }}>
              <ContextChips attachments={attachments} voiceTranscript={voiceTranscript} onRemoveAttachment={removeAttachment} onClearVoice={clearVoiceTranscript} />
            </div>
          )}

          {/* Voice bar */}
          <VoiceBar onTranscript={setVoiceTranscript} speakText={streamingText && !pending ? streamingText : undefined} />

          {/* Input row */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, marginTop: 6 }}>
            <button type="button" onClick={() => setAttachmentOpen((o) => !o)}
              style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0, marginBottom: 4, border: attachmentOpen ? "1px solid rgba(103,232,249,0.4)" : "1px solid rgba(255,255,255,0.15)", background: attachmentOpen ? "rgba(103,232,249,0.1)" : "rgba(255,255,255,0.06)", color: attachmentOpen ? "#67e8f9" : "rgba(255,255,255,0.6)", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(input); } }}
              placeholder="Ask, build, explore, verify…"
              rows={1}
              disabled={pending}
              style={{ flex: 1, resize: "none", borderRadius: 20, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.2)", color: "#fff", padding: "10px 14px", fontSize: 14, outline: "none", maxHeight: 120, minHeight: 40, fontFamily: "inherit" }}
            />
            {/* Model selector */}
            <select value={model} onChange={(e) => { setModel(e.target.value); if (typeof window !== "undefined") localStorage.setItem("streams:model", e.target.value); }}
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.6)", borderRadius: 10, padding: "4px 6px", fontSize: 10, cursor: "pointer", outline: "none", marginBottom: 4, flexShrink: 0 }}>
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
            <button type="button" onClick={() => void sendMessage(input)}
              disabled={(!input.trim() && !attachments.length && !voiceTranscript?.trim()) || pending}
              style={{ height: 40, borderRadius: 20, background: "#fff", color: "#0A0C10", padding: "0 18px", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: ((!input.trim() && !attachments.length && !voiceTranscript?.trim()) || pending) ? 0.4 : 1, border: "none", flexShrink: 0 }}>
              {pending ? "…" : "Send"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Floating artifact panel ───────────────────────────────────────── */}
      {floatingArtifact && <FloatingPreviewPanel artifact={floatingArtifact} onClose={() => setFloatingArtifact(null)} />}

      {/* ── Live preview modal ────────────────────────────────────────────── */}
      {livePreviewArtifact && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }} onClick={() => setLivePreviewArtifact(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ borderRadius: 12, overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
            <LivePreviewRenderer artifact={livePreviewArtifact.artifact} width={livePreviewArtifact.dest === "desktop" ? 900 : 390} height={livePreviewArtifact.dest === "desktop" ? 600 : 700} />
          </div>
          <button onClick={() => setLivePreviewArtifact(null)} style={{ borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.08)", padding: "8px 20px", fontSize: 13, fontWeight: 600, color: "#fff", cursor: "pointer" }}>Close preview</button>
        </div>
      )}
    </div>
  );
}
