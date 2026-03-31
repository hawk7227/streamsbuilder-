"use client";
export const dynamic = "force-dynamic";

/**
 * /pipeline/test
 *
 * Permanent left panel (chat) + right pipeline workspace.
 * Chat panel is resizable by dragging its right edge.
 * NO floating AIAssistant overlay — chat is structural, not a floater.
 */

import NextDynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, useMemo } from "react";

// ── Pipeline workspace components ─────────────────────────────────────────────
import { PipelineTopControlPanel } from "@/components/pipeline/PipelineTopControlPanel";
import { PlatformSelector } from "@/components/pipeline/PlatformSelector";
import { PlatformViewer } from "@/components/pipeline/PlatformViewer";
import type { PlatformSelection } from "@/components/pipeline/PlatformSelector";
import type {
  AutomationMode,
  GovernanceSnapshot,
  IdeaCard,
  OutputMode,
  PipelineNiche,
  ReferencePayload,
} from "@/components/pipeline/PipelineTopControlPanel";
import type { PlatformId, ViewId } from "@/lib/platform-views/index";

// MediaEditor uses Fabric.js — client-only dynamic import
const MediaEditor = NextDynamic(
  () => import("@/components/pipeline/MediaEditor"),
  {
    ssr: false,
    loading: () => (
      <div style={{ flex: 1, background: "#111", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 12 }}>Loading editor…</span>
      </div>
    ),
  }
);

// ── Chat components ────────────────────────────────────────────────────────────
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
import { FloatingPreviewPanel } from "@/components/pipeline/FloatingPreviewPanel";
import { LivePreviewRenderer } from "@/components/pipeline/LivePreviewRenderer";
import { ArtifactCard } from "@/components/pipeline/ArtifactCard";
import type { ArtifactDestination } from "@/components/pipeline/ArtifactCard";
import type { AssistantMode } from "@/lib/enforcement/types";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Action { type: string; payload: Record<string, unknown>; }

const INITIAL_MESSAGE: AssistantMessageShape = {
  role: "assistant",
  content: [{ type: "text", text: "Hi. I'm STREAMS. I'm watching this pipeline. Ask me anything or tell me what to build." }],
};

const DEFAULT_GOVERNANCE: GovernanceSnapshot = {
  approvedFactsLoaded: true,
  imageRulesLoaded: true,
  videoRulesLoaded: true,
  marketingLogicLoaded: true,
};

// ── Panel resize hook ──────────────────────────────────────────────────────────
function usePanelResize(defaultWidth = 400, min = 300, max = 680, key = "streams:pipeline-chat-width") {
  const [width, setWidth] = useState(() => {
    if (typeof window === "undefined") return defaultWidth;
    const s = localStorage.getItem(key);
    return s ? Math.min(max, Math.max(min, parseInt(s, 10))) : defaultWidth;
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
      setWidth(Math.min(max, Math.max(min, startW.current + (e.clientX - startX.current))));
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      localStorage.setItem(key, String(width));
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp);
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
  }, [key, max, min, width]);

  return { width, onPointerDown };
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function PipelineTestPage() {
  const PROJECT_ID = "00000000-0000-0000-0000-000000000001";
  const panel = usePanelResize();

  // ── Pipeline state ──────────────────────────────────────────────────────────
  const [niche, setNiche] = useState<PipelineNiche>("telehealth");
  const [automationMode, setAutomationMode] = useState<AutomationMode>("manual_mode");
  const [outputMode, setOutputMode] = useState<OutputMode>("image_and_video");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [conceptType, setConceptType] = useState("");
  const [ideas] = useState<IdeaCard[]>([]);
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null);
  const [aiResponse, setAiResponse] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [editorLog, setEditorLog] = useState<string[]>([]);

  // Platform viewer
  const [platformSelection, setPlatformSelection] = useState<PlatformSelection>({
    platformId: "instagram",
    viewId: "feed" as ViewId,
    destination: "mobile",
  });
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const vidRef = useRef<HTMLVideoElement | null>(null);
  const vidRef2 = useRef<HTMLVideoElement | null>(null);

  // ── Chat state ──────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<AssistantMessageShape[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [streamingMode, setStreamingMode] = useState<AssistantMode>("conversation");
  const [model, setModel] = useState(() => typeof window !== "undefined" ? (localStorage.getItem("streams:model") ?? "gpt-4o") : "gpt-4o");
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [currentArtifact, setCurrentArtifact] = useState<ExtractedArtifact | null>(null);
  const [artifactStreaming, setArtifactStreaming] = useState(false);
  const [floatingArtifact, setFloatingArtifact] = useState<ExtractedArtifact | null>(null);
  const [livePreviewArtifact, setLivePreviewArtifact] = useState<{ artifact: ExtractedArtifact; dest: ArtifactDestination } | null>(null);
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const { attachments, voiceTranscript, setVoiceTranscript, addAttachment, removeAttachment, clearAttachments, clearVoiceTranscript, requestContext } = useAssistantContextBridge(PROJECT_ID);

  useEffect(() => registerActivityStreamMiddleware(), []);

  // ── Pipeline handlers ───────────────────────────────────────────────────────
  const onAnalyzeReference = useCallback(async (payload: ReferencePayload) => {
    setReferenceLoading(true);
    try {
      if ("file" in payload) {
        const fd = new FormData();
        fd.append("file", payload.file);
        fd.append("type", payload.type);
        const res = await fetch("/api/files/intake", { method: "POST", body: fd, credentials: "include" });
        if (res.ok) { const d = await res.json() as { url?: string }; if (d.url) setImageUrl(d.url); }
      } else {
        const res = await fetch("/api/intake/url", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ url: payload.value }) });
        if (res.ok) { const d = await res.json() as { url?: string }; if (d.url) setImageUrl(d.url); }
      }
    } catch { /* non-fatal */ }
    setReferenceLoading(false);
  }, []);

  const onRunStep = useCallback((step: string) => {
    void fetch("/api/pipeline/run-node", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ type: step, data: { niche, automationMode, outputMode, selectedIdeaId } }) });
  }, [niche, automationMode, outputMode, selectedIdeaId]);

  const onAskAI = useCallback(async (message: string) => {
    setAiLoading(true); setAiResponse("");
    try {
      const res = await fetch("/api/ai-assistant", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ messages: [{ role: "user", content: [{ type: "text", text: message }] }], context: { projectId: PROJECT_ID, pipelineMode: true }, model }),
      });
      if (!res.ok || !res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "", fullText = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n"); buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const line = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          try { const evt = JSON.parse(line.slice(6)) as { type: string; delta?: string }; if (evt.type === "text" && evt.delta) { fullText += evt.delta; setAiResponse(fullText); } } catch { /* skip */ }
        }
      }
    } catch { /* non-fatal */ }
    setAiLoading(false);
  }, [model]);

  // ── Chat send ───────────────────────────────────────────────────────────────
  const performAction = useCallback((action: Action) => {
    switch (action.type) {
      case "generate_image": void fetch("/api/generate-image", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ prompt: action.payload.prompt ?? "Generate image" }) }); break;
      case "generate_video": void fetch("/api/video/scratch", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ prompt: action.payload.prompt ?? "Generate video" }) }); break;
      case "run_pipeline": void fetch("/api/pipeline/run", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ mode: "runPipeline", niche }) }); break;
      case "run_step": onRunStep(String(action.payload.stepId ?? "")); break;
    }
  }, [niche, onRunStep]);

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
    ActivityController.responseStarted();

    try {
      const res = await fetch("/api/ai-assistant", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        signal: controller.signal,
        body: JSON.stringify({ messages: nextMessages, context: { projectId: PROJECT_ID, pipelineMode: true, niche, automationMode, outputMode }, requestContext, conversationId, model }),
      });
      if (!res.ok || !res.body) throw new Error(await res.text().catch(() => "Assistant failed"));

      const reader = res.body.getReader(); const decoder = new TextDecoder();
      let buffer = "", fullText = "", mode: AssistantMode = "conversation";
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n"); buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const line = chunk.split("\n").find((l) => l.startsWith("data: ")); if (!line) continue;
          try {
            const evt = JSON.parse(line.slice(6)) as { type: string; delta?: string; action?: Action; phase?: string; label?: string; message?: string; conversationId?: string; mode?: AssistantMode; };
            if (evt.type === "phase" && evt.phase) ActivityController.phase(evt.phase as ActivityPhase, evt.label);
            else if (evt.type === "conversation_id" && evt.conversationId) { setConversationId(evt.conversationId); localStorage.setItem("streams_conv_id", evt.conversationId); }
            else if (evt.type === "text" && evt.delta) {
              fullText += evt.delta; setStreamingText(fullText);
              const detected = extractArtifactFromBuffer(fullText);
              if (detected) { setCurrentArtifact(detected); setArtifactStreaming(!detected.isComplete); }
            } else if (evt.type === "action" && evt.action) performAction(evt.action);
            else if (evt.type === "done") { if (evt.mode) mode = evt.mode; setStreamingMode(mode); }
            else if (evt.type === "error" && evt.message) { fullText += `\n\n${evt.message}`; setStreamingText(fullText); }
          } catch { /* skip */ }
        }
      }
      setArtifactStreaming(false); setStreamingText("");
      setMessages((prev) => [...prev, { role: "assistant", mode, content: [{ type: "text" as const, text: fullText || "Done." }] }]);
      ActivityController.responseCompleted(); clearAttachments(); clearVoiceTranscript();
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      const msg = err instanceof Error ? err.message : "Assistant failed";
      ActivityController.toolFailed("unknown", msg); setStreamingText("");
      setMessages((prev) => [...prev, { role: "assistant", mode: "conversation", content: [{ type: "text" as const, text: `Error: ${msg}` }] }]);
    } finally { setPending(false); abortRef.current = null; }
  }, [attachments, voiceTranscript, pending, messages, requestContext, conversationId, model, niche, automationMode, outputMode, clearAttachments, clearVoiceTranscript, performAction]);

  const handleArtifactPreview = useCallback((dest: ArtifactDestination) => {
    if (!currentArtifact) return;
    if (dest === "float") setFloatingArtifact(currentArtifact);
    else setLivePreviewArtifact({ artifact: currentArtifact, dest });
  }, [currentArtifact]);

  const chatFooter = useMemo(() => (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <ActivityStreamBar />
      {currentArtifact && <ArtifactCard artifact={currentArtifact} isStreaming={artifactStreaming} autoPreview={true} onPreview={handleArtifactPreview} onViewCode={() => setFloatingArtifact(currentArtifact)} />}
      {attachmentOpen && <div style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden" }}><AttachmentRail onAdd={(a) => { addAttachment(a); setAttachmentOpen(false); }} /></div>}
      {(attachments.length > 0 || voiceTranscript?.trim()) && <ContextChips attachments={attachments} voiceTranscript={voiceTranscript} onRemoveAttachment={removeAttachment} onClearVoice={clearVoiceTranscript} />}
      <VoiceBar onTranscript={setVoiceTranscript} speakText={streamingText && !pending ? streamingText : undefined} />
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
        <button type="button" onClick={() => setAttachmentOpen((o) => !o)}
          style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0, marginBottom: 4, border: attachmentOpen ? "1px solid rgba(103,232,249,0.4)" : "1px solid rgba(255,255,255,0.15)", background: attachmentOpen ? "rgba(103,232,249,0.1)" : "rgba(255,255,255,0.06)", color: attachmentOpen ? "#67e8f9" : "rgba(255,255,255,0.6)", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
        <textarea id="pipeline-chat-input" name="pipeline-chat-input" value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(input); } }}
          placeholder="Ask about this pipeline…" rows={1} disabled={pending}
          style={{ flex: 1, resize: "none", borderRadius: 20, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.2)", color: "#fff", padding: "10px 14px", fontSize: 14, outline: "none", maxHeight: 120, minHeight: 40, fontFamily: "inherit" }} />
        <select value={model} onChange={(e) => { setModel(e.target.value); if (typeof window !== "undefined") localStorage.setItem("streams:model", e.target.value); }}
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.6)", borderRadius: 10, padding: "4px 6px", fontSize: 10, cursor: "pointer", outline: "none", marginBottom: 4, flexShrink: 0 }}>
          <optgroup label="OpenAI"><option value="gpt-4o">GPT-4o</option><option value="gpt-4o-mini">GPT-4o mini</option></optgroup>
          <optgroup label="Anthropic"><option value="claude-sonnet-4-6">Sonnet 4.6</option><option value="claude-opus-4-6">Opus 4.6</option></optgroup>
        </select>
        <button type="button" onClick={() => void sendMessage(input)} disabled={(!input.trim() && !attachments.length && !voiceTranscript?.trim()) || pending}
          style={{ height: 40, borderRadius: 20, background: "#fff", color: "#0A0C10", padding: "0 18px", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: ((!input.trim() && !attachments.length && !voiceTranscript?.trim()) || pending) ? 0.4 : 1, border: "none", flexShrink: 0 }}>
          {pending ? "…" : "Send"}
        </button>
      </div>
    </div>
  ), [addAttachment, attachments, attachmentOpen, artifactStreaming, clearVoiceTranscript, currentArtifact, handleArtifactPreview, input, model, pending, removeAttachment, sendMessage, setVoiceTranscript, streamingText, voiceTranscript]);

  const platformId = platformSelection.platformId ?? "instagram";
  const viewId = (platformSelection.viewId ?? "feed") as ViewId;

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "#0A0C10", color: "#fff", fontFamily: "system-ui,-apple-system,sans-serif" }}>

      {/* ── LEFT: Permanent chat panel ──────────────────────────────────── */}
      <div style={{ width: panel.width, flexShrink: 0, display: "flex", flexDirection: "column", borderRight: "1px solid rgba(255,255,255,0.08)", overflow: "hidden", position: "relative", background: "#0A0C10" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", height: 48, borderBottom: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
          <div>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.18em", color: "rgba(255,255,255,0.35)" }}>STREAMS Chat</span>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", margin: 0 }}>Pipeline context active</p>
          </div>
          <a href="/chat" style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textDecoration: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "3px 8px" }}>Full chat ↗</a>
        </div>
        <AssistantMessageList messages={messages} streamingText={streamingText} streamingMode={streamingMode} pending={pending} />
        <div style={{ flexShrink: 0, borderTop: "1px solid rgba(255,255,255,0.08)", padding: "8px 16px 12px" }}>{chatFooter}</div>
        {/* Drag handle — right edge */}
        <div onPointerDown={panel.onPointerDown}
          style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 4, cursor: "col-resize", zIndex: 10 }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(103,232,249,0.3)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }} />
      </div>

      {/* ── RIGHT: Pipeline workspace ────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
        <PipelineTopControlPanel
          niche={niche} setNiche={setNiche}
          automationMode={automationMode} setAutomationMode={setAutomationMode}
          outputMode={outputMode} setOutputMode={setOutputMode}
          selectedTemplate={selectedTemplate} setSelectedTemplate={setSelectedTemplate}
          conceptType={conceptType} setConceptType={setConceptType}
          governance={DEFAULT_GOVERNANCE}
          ideas={ideas} selectedIdeaId={selectedIdeaId} onSelectIdea={(idea: IdeaCard) => setSelectedIdeaId(idea.id)}
          onAnalyzeReference={onAnalyzeReference}
          onAskAI={onAskAI}
          onRunStep={onRunStep}
          aiResponse={aiResponse} aiLoading={aiLoading} referenceLoading={referenceLoading}
        />

        <div style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>
          {/* iPhone #1 */}
          <div style={{ width: 320, flexShrink: 0, display: "flex", flexDirection: "column", borderRight: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
            <div style={{ padding: "6px 12px", fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.25)", textTransform: "uppercase" as const, letterSpacing: "0.1em", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>IPHONE 15 PRO MAX #1</div>
            <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
              <PlatformViewer platformId={platformId} viewId={viewId} imageUrl={imageUrl} videoUrl={videoUrl} vidRef={vidRef} conceptId="concept-1" nicheId={niche} />
            </div>
            <PlatformSelector
              value={platformSelection}
              onChange={setPlatformSelection}
              contentType={imageUrl ? "image" : videoUrl ? "video" : null}
              onDesktopView={(pid, vid) => setPlatformSelection({ platformId: pid, viewId: vid, destination: "desktop" })}
            />
          </div>

          {/* Center: MediaEditor */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
            <MediaEditor
              imageUrl={imageUrl}
              videoUrl={videoUrl}
              onSendToScreen={(url: string, type: "image" | "video") => { if (type === "image") setImageUrl(url); else setVideoUrl(url); }}
              onLog={(msg: string) => setEditorLog((prev) => [...prev.slice(-99), msg])}
            />
          </div>

          {/* iPhone #2 */}
          <div style={{ width: 320, flexShrink: 0, display: "flex", flexDirection: "column", borderLeft: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
            <div style={{ padding: "6px 12px", fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.25)", textTransform: "uppercase" as const, letterSpacing: "0.1em", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>IPHONE 15 PRO MAX #2</div>
            <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
              <PlatformViewer platformId={platformId} viewId={viewId} imageUrl={imageUrl} videoUrl={videoUrl} vidRef={vidRef2} conceptId="concept-2" nicheId={niche} />
            </div>
          </div>
        </div>

        {editorLog.length > 0 && (
          <div style={{ height: 28, borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", padding: "0 12px", overflow: "hidden", flexShrink: 0 }}>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{editorLog[editorLog.length - 1]}</span>
          </div>
        )}
      </div>

      {/* Overlays */}
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
