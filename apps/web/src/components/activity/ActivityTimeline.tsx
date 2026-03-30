"use client";

import type { RunStreamEvent } from "@streams/contracts";

interface TimelineEntry {
  id: string;
  type: "phase" | "tool" | "job" | "artifact" | "error";
  label: string;
  detail?: string | undefined;
  status: "active" | "ok" | "error" | "waiting";
  timestamp: string;
}

interface ActivityTimelineProps {
  events: RunStreamEvent[];
}

export function ActivityTimeline({ events }: ActivityTimelineProps) {
  const entries = buildEntries(events);
  if (entries.length === 0) return null;

  return (
    <div style={styles.container} aria-label="Run activity">
      {entries.map((entry, i) => (
        <div key={entry.id} style={styles.row}>
          {/* Track line */}
          <div style={styles.track}>
            <div
              style={{
                ...styles.dot,
                background: dotColor(entry.status),
                boxShadow: entry.status === "active"
                  ? `0 0 0 3px ${dotColor(entry.status)}22`
                  : "none",
              }}
            />
            {i < entries.length - 1 && <div style={styles.line} />}
          </div>

          {/* Content */}
          <div style={styles.content}>
            <div style={styles.label}>
              <span style={{ ...styles.typeBadge, ...typeBadgeStyle(entry.type) }}>
                {entry.type}
              </span>
              <span style={styles.labelText}>{entry.label}</span>
            </div>
            {entry.detail && (
              <div style={styles.detail}>{entry.detail}</div>
            )}
            <div style={styles.timestamp}>{entry.timestamp}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function buildEntries(events: RunStreamEvent[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  const now = () => new Date().toLocaleTimeString();

  for (const event of events) {
    switch (event.type) {
      case "phase_changed":
        entries.push({
          id: `phase-${event.phase}-${entries.length}`,
          type: "phase",
          label: event.label,
          status: "active",
          timestamp: now(),
        });
        break;

      case "tool_called":
        entries.push({
          id: `tool-${event.callId}`,
          type: "tool",
          label: event.toolName,
          status: "active",
          timestamp: now(),
        });
        break;

      case "tool_result": {
        const existing = entries.find(
          (e) => e.id === `tool-${event.callId}`
        );
        if (existing) {
          existing.status = event.ok ? "ok" : "error";
        }
        break;
      }

      case "queue_job_created":
        entries.push({
          id: `job-${event.jobId}`,
          type: "job",
          label: event.jobType,
          detail: `Queue: ${event.queue}`,
          status: "waiting",
          timestamp: now(),
        });
        break;

      case "job_progress": {
        const existing = entries.find((e) => e.id === `job-${event.jobId}`);
        if (existing) {
          existing.status = "active";
          existing.detail = event.message;
        }
        break;
      }

      case "artifact_ready":
        entries.push({
          id: `artifact-${entries.length}`,
          type: "artifact",
          label: event.artifactType,
          detail: event.url,
          status: "ok",
          timestamp: now(),
        });
        break;

      case "run_failed":
        entries.push({
          id: `error-${entries.length}`,
          type: "error",
          label: "Run failed",
          detail: event.error.slice(0, 120),
          status: "error",
          timestamp: now(),
        });
        break;
    }
  }

  return entries;
}

function dotColor(status: TimelineEntry["status"]): string {
  switch (status) {
    case "active":  return "var(--color-accent)";
    case "ok":      return "var(--color-ok-text)";
    case "error":   return "var(--color-err-text)";
    case "waiting": return "var(--color-text-tertiary)";
  }
}

function typeBadgeStyle(type: TimelineEntry["type"]): React.CSSProperties {
  const map: Record<TimelineEntry["type"], React.CSSProperties> = {
    phase:    { background: "#e8f0fe", color: "#1a73e8" },
    tool:     { background: "#fce8ff", color: "#8e24aa" },
    job:      { background: "#fff3e0", color: "#e65100" },
    artifact: { background: "var(--color-ok-bg)", color: "var(--color-ok-text)" },
    error:    { background: "var(--color-err-bg)", color: "var(--color-err-text)" },
  };
  return map[type];
}

const styles = {
  container: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 0,
  },
  row: {
    display: "flex",
    gap: "var(--spacing-3)",
    minHeight: "40px",
  },
  track: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    flexShrink: 0,
    width: "16px",
    paddingTop: "var(--spacing-1)",
  },
  dot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    flexShrink: 0,
    transition: "background var(--motion-fast) var(--motion-easing), box-shadow var(--motion-fast) var(--motion-easing)",
  },
  line: {
    flex: 1,
    width: "1px",
    background: "var(--color-border)",
    marginTop: "var(--spacing-1)",
    marginBottom: 0,
  },
  content: {
    flex: 1,
    paddingBottom: "var(--spacing-4)",
  },
  label: {
    display: "flex",
    alignItems: "center",
    gap: "var(--spacing-2)",
  },
  typeBadge: {
    fontSize: "var(--font-size-xs)",
    fontWeight: 500,
    padding: "1px 6px",
    borderRadius: "var(--radius-full)",
    textTransform: "capitalize" as const,
  },
  labelText: {
    fontSize: "var(--font-size-sm)",
    color: "var(--color-text-primary)",
    fontFamily: "var(--font-mono)",
  },
  detail: {
    fontSize: "var(--font-size-xs)",
    color: "var(--color-text-secondary)",
    marginTop: "var(--spacing-1)",
    wordBreak: "break-all" as const,
  },
  timestamp: {
    fontSize: "var(--font-size-xs)",
    color: "var(--color-text-tertiary)",
    marginTop: "2px",
  },
} as const;
