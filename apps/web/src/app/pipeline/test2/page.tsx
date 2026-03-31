"use client";
export const dynamic = "force-dynamic";

/**
 * /pipeline/test2
 * Chat UI wired identical to the floater — no extras.
 * Self-contained: no external component deps that may not exist in DO app.
 * Renders the AIAssistantShell + sendMessage loop directly.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useAssistantWindow } from "@/components/ai-chat/useAssistantWindow";
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
import type { AssistantMode } from "@/lib/enforcement/types";

const INITIAL_MESSAGE: AssistantMessageShape = {
  role: "assistant",
  content: [{ type: "text", text: "Hi. I'm STREAMS. Ask me anything, build something, or let's explore an idea." }],
};

interface Action { type: string; payload: Record<string, unknown>; }

function detectMedia(text: string): AssistantMessageShape["content"] {
  const blocks: AssistantMessageShape["content"] = [];
  const img = text.match(/https?:\/\/\S+\.(png|jpg|jpeg|webp|gif)/i);
  const vid = text.match(/https?:\/\/\S+\.(mp4|webm|mov)/i);
  if (img) blocks.push({ type: "image_url", image_url: { url: img[0] } });
  if (vid) blocks.push({ type: "video_url", image_url: { url: vid[0] } });
  return blocks as AssistantMessageShape["content"];
}

export default function PipelineTest2Page() {
  const PROJECT_ID = "00000000-0000-0000-0000-000000000001";

  // ── Floater window state (drag, resize, open/close) ──
  const { state, shellStyle, isMobile, mounted, toggleOpen, startDrag, startResize } = useAssistantWindow();

  // ── Chat state ──
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
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [brainSaved, setBrainSaved] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const { attachments, voiceTranscript, setVoiceTranscript, addAttachment, removeAttachment, clearAttachments, clearVoiceTranscript, requestContext } = useAssistantContextBridge(PROJECT_ID);

  useEffect(() => registerActivityStreamMiddleware(), []);

  const performAction = useCallback((action: Action) => {
    if (action.type === "save_to_brain") {
      void fetch("/api/brain", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ type: "decision", content: String(action.payload.content ?? ""), projectId: PROJECT_ID, title: String(action.payload.content ?? "").slice(0, 60) }) });
      setBrainSaved(true); setTimeout(() => setBrainSaved(false), 2000);
    }
  }, []);

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
        body: JSON.stringify({ messages: nextMessages, context: { projectId: PROJECT_ID }, requestContext, conversationId, model }),
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
              if (detected) { setCurrentArtifact(detected); setArtifactStreaming(!detected.isComplete); if (!detected.isComplete) ActivityController.toolStarted("code_generator", "Generating component..."); else ActivityController.toolCompleted("code_generator", "Component ready"); }
            } else if (evt.type === "action" && evt.action) performAction(evt.action);
            else if (evt.type === "done") { if (evt.conversationId) { setConversationId(evt.conversationId); localStorage.setItem("streams_conv_id", evt.conversationId); } if (evt.mode) mode = evt.mode; setStreamingMode(mode); }
            else if (evt.type === "error" && evt.message) { fullText += `\n\n${evt.message}`; setStreamingText(fullText); ActivityController.toolFailed("unknown", evt.message); }
          } catch { /* skip */ }
        }
      }
      setArtifactStreaming(false); setStreamingText("");
      setMessages((prev) => [...prev, { role: "assistant", mode, content: [{ type: "text" as const, text: fullText || "Request completed." }, ...detectMedia(fullText)] } as AssistantMessageShape]);
      ActivityController.responseCompleted(); clearAttachments(); clearVoiceTranscript();
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      const msg = err instanceof Error ? err.message : "Assistant failed";
      ActivityController.toolFailed("unknown", msg); setStreamingText("");
      setMessages((prev) => [...prev, { role: "assistant", mode: "verification" as AssistantMode, content: [{ type: "text" as const, text: `VERIFIED:\n- Request reached the assistant layer.\n\nNOT VERIFIED:\n- Response could not be completed.\n\nREQUIRES RUNTIME:\n- Inspect the failed request path.\n\nRISKS:\n- ${msg}` }] }]);
    } finally { setPending(false); abortRef.current = null; }
  }, [attachments, voiceTranscript, pending, messages, requestContext, conversationId, model, clearAttachments, clearVoiceTranscript, performAction]);

  if (!mounted) return null;

  // ── Minimized button ──
  if (!state.open) {
    return (
      <button type="button" onClick={toggleOpen}
        className="fixed bottom-6 right-6 z-[70] rounded-full border border-white/10 bg-[#0A0C10]/90 px-5 py-3 text-sm font-semibold text-white shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        Open assistant
      </button>
    );
  }

  const footer = (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <ActivityStreamBar />
      {brainSaved && <div style={{ fontSize: 9, color: "#6ee7b7" }}>💡 Saved to STREAMS Brain</div>}
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
        <textarea value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(input); } }}
          placeholder="Ask, build, explore, verify…" rows={1} disabled={pending}
          style={{ flex: 1, resize: "none", borderRadius: 20, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.2)", color: "#fff", padding: "10px 14px", fontSize: 14, outline: "none", maxHeight: 120, minHeight: 40, fontFamily: "inherit" }} />
        <select value={model} onChange={(e) => { setModel(e.target.value); localStorage.setItem("streams:model", e.target.value); }}
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
  );

  return (
    <>
      <div className={["fixed inset-0 z-[70]", isMobile ? "pointer-events-auto bg-[#0A0C10]" : "pointer-events-none"].join(" ")}>
        <section
          className={["pointer-events-auto overflow-hidden bg-[#0A0C10]", isMobile ? "border-0 rounded-none shadow-none" : "absolute border border-white/12 rounded-[28px] shadow-[0_40px_120px_rgba(0,0,0,0.8)]"].join(" ")}
          style={shellStyle}
        >
          <div className="relative flex h-full flex-col">
            <header
              onPointerDown={isMobile ? undefined : startDrag}
              className={["flex items-center justify-between border-b border-white/8", isMobile ? "px-4 py-3" : "px-5 py-4 cursor-grab active:cursor-grabbing items-start"].join(" ")}
            >
              <div>
                {!isMobile && <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45">FLOATING AI CHAT</div>}
                <div className={isMobile ? "text-[15px] font-semibold text-white" : "mt-1 text-lg font-semibold tracking-[-0.02em] text-white"}>STREAMS Chat</div>
                {!isMobile && <p className="mt-1 text-sm text-white/55">Auto-mode · governed · multimodal</p>}
              </div>
              <div className="flex items-center gap-2">
                {!isMobile && <button type="button" onClick={toggleOpen} className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-white/70 transition hover:border-white/20 hover:text-white">Minimize</button>}
                <button type="button" onClick={toggleOpen} className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-white/70 transition hover:border-white/20 hover:text-white">{isMobile ? "✕" : "Close"}</button>
              </div>
            </header>

            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
              <AssistantMessageList messages={messages} streamingText={streamingText} streamingMode={streamingMode} pending={pending} />
            </div>

            <footer className="relative border-t border-white/8 px-4 py-4" style={isMobile ? { paddingBottom: "calc(16px + env(safe-area-inset-bottom))" } : undefined}>
              {footer}
            </footer>

            {!isMobile && <>
              <button type="button" onPointerDown={startResize("right")} className="absolute right-0 top-14 h-[calc(100%-64px)] w-3 cursor-ew-resize opacity-0" aria-label="Resize width" />
              <button type="button" onPointerDown={startResize("bottom")} className="absolute bottom-0 left-0 h-3 w-[calc(100%-16px)] cursor-ns-resize opacity-0" aria-label="Resize height" />
              <button type="button" onPointerDown={startResize("corner")} className="absolute bottom-0 right-0 h-5 w-5 cursor-nwse-resize" aria-label="Resize">
                <span className="absolute bottom-1.5 right-1.5 h-2.5 w-2.5 rounded-sm border border-white/20 bg-white/10" />
              </button>
            </>}
          </div>
        </section>
      </div>

      {floatingArtifact && <FloatingPreviewPanel artifact={floatingArtifact} onClose={() => setFloatingArtifact(null)} />}

      {/* suppress unused warning */}
      {artifactStreaming && currentArtifact && null}
    </>
  );
}
