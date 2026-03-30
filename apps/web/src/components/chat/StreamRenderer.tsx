"use client";

/**
 * StreamRenderer
 *
 * Renders a live run stream. Accepts events and renders:
 * - Phase labels (phase_changed)
 * - Streaming text (response_delta → response_completed)
 * - Tool call activity (tool_called, tool_result)
 * - Queue job progress (queue_job_created, job_progress)
 * - Artifacts (artifact_ready)
 * - Error state (run_failed)
 *
 * No layout-shifting animations. Text streams in place.
 * Motion: opacity only, 180ms.
 */

import { useState, useCallback } from "react";
import { useRunStream } from "@/lib/hooks/useRunStream";
import type { RunStreamEvent } from "@streams/contracts";

interface ToolCall {
  callId: string;
  toolName: string;
  status: "calling" | "ok" | "error";
}

interface QueueJob {
  jobId: string;
  queue: string;
  jobType: string;
  percent?: number | undefined;
  message?: string | undefined;
}

interface Artifact {
  artifactType: string;
  url: string;
}

interface StreamState {
  phase: string | null;
  text: string;
  completed: boolean;
  failed: boolean;
  error: string | null;
  toolCalls: ToolCall[];
  queueJobs: QueueJob[];
  artifacts: Artifact[];
}

const INITIAL_STATE: StreamState = {
  phase: null,
  text: "",
  completed: false,
  failed: false,
  error: null,
  toolCalls: [],
  queueJobs: [],
  artifacts: [],
};

interface StreamRendererProps {
  runId: string | null;
}

export function StreamRenderer({ runId }: StreamRendererProps) {
  const [state, setState] = useState<StreamState>(INITIAL_STATE);

  const handleEvent = useCallback((event: RunStreamEvent) => {
    setState((prev) => {
      switch (event.type) {
        case "response_started":
          return { ...INITIAL_STATE };

        case "phase_changed":
          return { ...prev, phase: event.label };

        case "response_delta":
          return { ...prev, text: prev.text + event.text };

        case "response_completed":
          return { ...prev, text: event.text, completed: true, phase: null };

        case "tool_called":
          return {
            ...prev,
            toolCalls: [
              ...prev.toolCalls,
              { callId: event.callId, toolName: event.toolName, status: "calling" },
            ],
          };

        case "tool_result":
          return {
            ...prev,
            toolCalls: prev.toolCalls.map((t) =>
              t.callId === event.callId
                ? { ...t, status: event.ok ? "ok" : "error" }
                : t
            ),
          };

        case "queue_job_created":
          return {
            ...prev,
            queueJobs: [
              ...prev.queueJobs,
              { jobId: event.jobId, queue: event.queue, jobType: event.jobType },
            ],
          };

        case "job_progress":
          return {
            ...prev,
            queueJobs: prev.queueJobs.map((j) =>
              j.jobId === event.jobId
                ? { ...j, percent: event.percent, message: event.message }
                : j
            ),
          };

        case "artifact_ready":
          return {
            ...prev,
            artifacts: [...prev.artifacts, { artifactType: event.artifactType, url: event.url }],
          };

        case "run_failed":
          return { ...prev, failed: true, error: event.error, phase: null };

        default:
          return prev;
      }
    });
  }, []);

  useRunStream(runId, handleEvent);

  if (!runId) return null;

  return (
    <div style={styles.container}>
      {/* Phase indicator */}
      {state.phase && (
        <div style={styles.phase}>
          <span style={styles.phaseSpinner} aria-hidden="true" />
          {state.phase}
        </div>
      )}

      {/* Tool call activity */}
      {state.toolCalls.length > 0 && (
        <div style={styles.toolList}>
          {state.toolCalls.map((t) => (
            <div key={t.callId} style={styles.toolItem}>
              <span
                style={{
                  ...styles.toolDot,
                  background:
                    t.status === "ok" ? "var(--color-ok-text)"
                    : t.status === "error" ? "var(--color-err-text)"
                    : "var(--color-text-tertiary)",
                }}
              />
              <span style={styles.toolName}>{t.toolName}</span>
              <span style={styles.toolStatus}>
                {t.status === "calling" ? "running" : t.status}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Queue jobs */}
      {state.queueJobs.length > 0 && (
        <div style={styles.jobList}>
          {state.queueJobs.map((j) => (
            <div key={j.jobId} style={styles.jobItem}>
              <div style={styles.jobHeader}>
                <span style={styles.jobType}>{j.jobType}</span>
                {j.percent != null && (
                  <span style={styles.jobPercent}>{j.percent}%</span>
                )}
              </div>
              {j.message && <div style={styles.jobMessage}>{j.message}</div>}
              {j.percent != null && (
                <div style={styles.progressTrack}>
                  <div
                    style={{
                      ...styles.progressBar,
                      width: `${Math.min(j.percent, 100)}%`,
                    }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Streaming / completed text */}
      {state.text && (
        <div
          style={{
            ...styles.textBlock,
            opacity: state.completed ? 1 : 0.9,
          }}
        >
          <pre style={styles.pre}>{state.text}</pre>
          {!state.completed && <span style={styles.cursor} aria-hidden="true" />}
        </div>
      )}

      {/* Artifacts */}
      {state.artifacts.map((a, i) => (
        <a key={i} href={a.url} style={styles.artifact} target="_blank" rel="noreferrer">
          <span style={styles.artifactIcon}>↗</span>
          <span>{a.artifactType}</span>
        </a>
      ))}

      {/* Error */}
      {state.failed && state.error && (
        <div style={styles.error} role="alert">
          <strong style={styles.errorLabel}>Run failed</strong>
          <pre style={styles.errorText}>{state.error}</pre>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "var(--spacing-3)",
    width: "100%",
  },
  phase: {
    display: "flex",
    alignItems: "center",
    gap: "var(--spacing-2)",
    fontSize: "var(--font-size-sm)",
    color: "var(--color-text-secondary)",
    opacity: 1,
    transition: "opacity var(--motion-base) var(--motion-easing)",
  },
  phaseSpinner: {
    display: "inline-block",
    width: "10px",
    height: "10px",
    borderRadius: "50%",
    border: "1.5px solid var(--color-text-tertiary)",
    borderTopColor: "var(--color-accent)",
    animation: "spin 600ms linear infinite",
  },
  toolList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "var(--spacing-1)",
  },
  toolItem: {
    display: "flex",
    alignItems: "center",
    gap: "var(--spacing-2)",
    fontSize: "var(--font-size-sm)",
    color: "var(--color-text-secondary)",
  },
  toolDot: {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    flexShrink: 0,
    transition: "background var(--motion-fast) var(--motion-easing)",
  },
  toolName: {
    fontFamily: "var(--font-mono)",
    fontSize: "var(--font-size-xs)",
  },
  toolStatus: {
    marginLeft: "auto",
    fontSize: "var(--font-size-xs)",
    color: "var(--color-text-tertiary)",
  },
  jobList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "var(--spacing-2)",
  },
  jobItem: {
    padding: "var(--spacing-3)",
    borderRadius: "var(--radius-sm)",
    background: "var(--color-bg-secondary)",
    border: "1px solid var(--color-border)",
  },
  jobHeader: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "var(--font-size-sm)",
    marginBottom: "var(--spacing-1)",
  },
  jobType: {
    fontFamily: "var(--font-mono)",
    fontSize: "var(--font-size-xs)",
    color: "var(--color-text-secondary)",
  },
  jobPercent: {
    fontSize: "var(--font-size-xs)",
    color: "var(--color-text-tertiary)",
  },
  jobMessage: {
    fontSize: "var(--font-size-sm)",
    color: "var(--color-text-secondary)",
    marginBottom: "var(--spacing-2)",
  },
  progressTrack: {
    height: "3px",
    borderRadius: "var(--radius-full)",
    background: "var(--color-bg-tertiary)",
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    borderRadius: "var(--radius-full)",
    background: "var(--color-accent)",
    transition: "width var(--motion-slow) var(--motion-easing)",
  },
  textBlock: {
    position: "relative" as const,
    transition: "opacity var(--motion-base) var(--motion-easing)",
  },
  pre: {
    fontFamily: "var(--font-mono)",
    fontSize: "var(--font-size-sm)",
    lineHeight: "1.7",
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
    color: "var(--color-text-primary)",
  },
  cursor: {
    display: "inline-block",
    width: "2px",
    height: "14px",
    background: "var(--color-accent)",
    verticalAlign: "text-bottom",
    animation: "blink 1s step-end infinite",
  },
  artifact: {
    display: "inline-flex",
    alignItems: "center",
    gap: "var(--spacing-1)",
    padding: "var(--spacing-2) var(--spacing-3)",
    borderRadius: "var(--radius-full)",
    background: "var(--color-bg-secondary)",
    border: "1px solid var(--color-border)",
    fontSize: "var(--font-size-sm)",
    color: "var(--color-accent)",
    textDecoration: "none",
    transition: "var(--transition-fast)",
  },
  artifactIcon: {
    fontSize: "var(--font-size-xs)",
  },
  error: {
    padding: "var(--spacing-4)",
    borderRadius: "var(--radius-md)",
    background: "var(--color-err-bg)",
    border: "1px solid var(--color-err-border)",
  },
  errorLabel: {
    display: "block",
    fontSize: "var(--font-size-sm)",
    color: "var(--color-err-text)",
    fontWeight: 500,
    marginBottom: "var(--spacing-2)",
  },
  errorText: {
    fontFamily: "var(--font-mono)",
    fontSize: "var(--font-size-xs)",
    color: "var(--color-err-text)",
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
  },
} as const;
