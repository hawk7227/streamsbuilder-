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

const DEFAULT_PROJECT_ID = "00000000-0000-0000-0000-000000000001";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  runId?: string | undefined;
}

type PanelView = "activity" | "files" | "preview";

export default function ChatPage() {
  const [projectId] = useState<string>(DEFAULT_PROJECT_ID);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [events, setEvents] = useState<RunStreamEvent[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [panel, setPanel] = useState<PanelView>("activity");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleStreamEvent = useCallback((event: RunStreamEvent) => {
    setEvents((prev) => [...prev, event]);

    if (event.type === "artifact_ready" && event.artifactType === "preview") {
      setPreviewUrl(event.url);
      setPanel("preview");
    }

    if (event.type === "response_completed" || event.type === "run_failed") {
      setSubmitting(false);
      if (event.type === "run_failed") {
        setError(event.error);
      }
    }
  }, []);

  useRunStream(activeRunId, handleStreamEvent);

  const handleSubmit = useCallback(
    async (req: Omit<BotRequest, "projectId" | "conversationId">) => {
      if (submitting) return;

      setError(null);
      const userMsgId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        { id: userMsgId, role: "user", content: req.userMessage },
      ]);
      setSubmitting(true);
      setEvents([]);

      try {
        const result = await createBotTurn({
          ...req,
          projectId,
          conversationId,
        });

        setConversationId(result.conversationId);
        setActiveRunId(result.runId);

        const assistantMsgId = crypto.randomUUID();
        setMessages((prev) => [
          ...prev,
          { id: assistantMsgId, role: "assistant", content: "", runId: result.runId },
        ]);
      } catch (err) {
        setSubmitting(false);
        const msg = err instanceof Error ? err.message : "Request failed";
        setError(msg);
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `Error: ${msg}`,
          },
        ]);
      }
    },
    [submitting, conversationId, projectId]
  );

  return (
    <div style={styles.shell}>
      {/* Left: Chat column */}
      <div style={styles.chatColumn}>
        {/* Error banner */}
        {error && (
          <div style={styles.errorBanner} role="alert">
            <span>{error}</span>
            <button
              type="button"
              style={styles.errorDismiss}
              onClick={() => { setError(null); }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Message list */}
        <div style={styles.messages}>
          {messages.length === 0 && (
            <div style={styles.emptyState}>
              <div style={styles.emptyHeading}>Streams</div>
              <div style={styles.emptySubheading}>
                Helper · Builder · Runtime · Deploy
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                ...styles.message,
                ...(msg.role === "user" ? styles.userMessage : styles.assistantMessage),
              }}
            >
              {msg.role === "user" ? (
                <div style={styles.userBubble}>{msg.content}</div>
              ) : (
                <StreamRenderer runId={msg.runId ?? null} />
              )}
            </div>
          ))}

          <div ref={bottomRef} />
        </div>

        {/* Composer */}
        <div style={styles.composerWrapper}>
          <Composer
            projectId={projectId}
            conversationId={conversationId}
            disabled={submitting}
            onSubmit={(req) => { void handleSubmit(req); }}
          />
        </div>
      </div>

      {/* Right: Side panel */}
      <div style={styles.sidePanel}>
        <div style={styles.panelTabs}>
          {(["activity", "files", "preview"] as PanelView[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => { setPanel(tab); }}
              style={{
                ...styles.panelTab,
                borderBottom: panel === tab
                  ? "2px solid var(--color-accent)"
                  : "2px solid transparent",
                color: panel === tab
                  ? "var(--color-text-primary)"
                  : "var(--color-text-tertiary)",
              }}
            >
              {tab === "activity" ? "Activity" : tab === "files" ? "Files" : "Preview"}
            </button>
          ))}
        </div>

        <div style={styles.panelContent}>
          {panel === "activity" && <ActivityTimeline events={events} />}

          {panel === "files" && (
            <FileUpload
              projectId={projectId}
              onUploaded={(fileId) => {
                console.log("[chat] file uploaded:", fileId);
              }}
            />
          )}

          {panel === "preview" && (
            <PreviewPanel
              projectId={projectId}
              runId={activeRunId}
              previewUrl={previewUrl}
              onPreviewRequested={(streamUrl) => {
                console.log("[chat] preview stream:", streamUrl);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  shell: {
    display: "flex",
    height: "100vh",
    overflow: "hidden",
    background: "var(--color-bg)",
  },
  chatColumn: {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    minWidth: 0,
    borderRight: "1px solid var(--color-border)",
  },
  errorBanner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "var(--spacing-3) var(--spacing-6)",
    background: "var(--color-err-bg)",
    borderBottom: "1px solid var(--color-err-border)",
    color: "var(--color-err-text)",
    fontSize: "var(--font-size-sm)",
    flexShrink: 0,
  },
  errorDismiss: {
    background: "none",
    border: "none",
    color: "var(--color-err-text)",
    cursor: "pointer",
    fontSize: "var(--font-size-sm)",
    padding: "0 var(--spacing-1)",
  },
  messages: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "var(--spacing-8) var(--spacing-6)",
    display: "flex",
    flexDirection: "column" as const,
    gap: "var(--spacing-6)",
  },
  emptyState: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    gap: "var(--spacing-3)",
    padding: "var(--spacing-24) var(--spacing-6)",
  },
  emptyHeading: {
    fontSize: "var(--font-size-2xl)",
    fontWeight: 500,
    color: "var(--color-text-primary)",
    letterSpacing: "-0.02em",
  },
  emptySubheading: {
    fontSize: "var(--font-size-base)",
    color: "var(--color-text-tertiary)",
  },
  message: {
    display: "flex",
    flexDirection: "column" as const,
    maxWidth: "720px",
  },
  userMessage: {
    alignSelf: "flex-end",
    alignItems: "flex-end",
  },
  assistantMessage: {
    alignSelf: "flex-start",
    alignItems: "flex-start",
    width: "100%",
  },
  userBubble: {
    background: "var(--color-accent)",
    color: "var(--color-accent-text)",
    padding: "var(--spacing-3) var(--spacing-5)",
    borderRadius: "var(--radius-lg)",
    fontSize: "var(--font-size-base)",
    lineHeight: "1.6",
    maxWidth: "600px",
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
  },
  composerWrapper: {
    padding: "var(--spacing-4) var(--spacing-6) var(--spacing-6)",
    borderTop: "1px solid var(--color-border)",
    display: "flex",
    justifyContent: "center",
    flexShrink: 0,
  },
  sidePanel: {
    width: "400px",
    flexShrink: 0,
    display: "flex",
    flexDirection: "column" as const,
    background: "var(--color-bg-secondary)",
  },
  panelTabs: {
    display: "flex",
    borderBottom: "1px solid var(--color-border)",
    padding: "0 var(--spacing-4)",
    flexShrink: 0,
  },
  panelTab: {
    padding: "var(--spacing-4) var(--spacing-4)",
    background: "transparent",
    border: "none",
    fontSize: "var(--font-size-sm)",
    fontWeight: 500,
    cursor: "pointer",
    transition: "color var(--motion-fast) var(--motion-easing)",
  },
  panelContent: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "var(--spacing-5)",
  },
} as const;
