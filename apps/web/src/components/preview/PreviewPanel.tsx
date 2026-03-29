"use client";

import { useState } from "react";
import { createPreview } from "@/lib/api-client";

interface PreviewPanelProps {
  projectId: string;
  runId: string | null;
  previewUrl: string | null;
  onPreviewRequested?: (streamUrl: string) => void;
}

export function PreviewPanel({ projectId, runId, previewUrl, onPreviewRequested }: PreviewPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestPreview() {
    if (!runId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await createPreview(projectId, runId);
      onPreviewRequested?.(result.streamUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview request failed");
    } finally {
      setLoading(false);
    }
  }

  if (!previewUrl) {
    return (
      <div style={styles.empty}>
        <div style={styles.emptyIcon} aria-hidden="true">⬡</div>
        <div style={styles.emptyLabel}>No preview yet</div>
        {runId && (
          <button
            type="button"
            onClick={() => void requestPreview()}
            disabled={loading}
            style={{ ...styles.buildButton, opacity: loading ? 0.6 : 1 }}
          >
            {loading ? "Queuing…" : "Build preview"}
          </button>
        )}
        {error && <div style={styles.error}>{error}</div>}
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <span style={styles.url}>{previewUrl}</span>
        <div style={styles.toolbarActions}>
          <a href={previewUrl} target="_blank" rel="noreferrer" style={styles.action}>
            Open ↗
          </a>
          {runId && (
            <button
              type="button"
              onClick={() => void requestPreview()}
              disabled={loading}
              style={{ ...styles.action, border: "none", cursor: "pointer" }}
            >
              {loading ? "…" : "Rebuild"}
            </button>
          )}
        </div>
      </div>
      <iframe
        src={previewUrl}
        style={styles.frame}
        title="Preview"
        sandbox="allow-scripts allow-same-origin allow-forms"
      />
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    flexDirection: "column" as const,
    borderRadius: "var(--radius-lg)",
    border: "1px solid var(--color-border)",
    overflow: "hidden",
    height: "100%",
    minHeight: "400px",
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "var(--spacing-2) var(--spacing-4)",
    background: "var(--color-bg-secondary)",
    borderBottom: "1px solid var(--color-border)",
    gap: "var(--spacing-4)",
  },
  url: {
    fontFamily: "var(--font-mono)",
    fontSize: "var(--font-size-xs)",
    color: "var(--color-text-secondary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    flex: 1,
  },
  toolbarActions: {
    display: "flex",
    gap: "var(--spacing-3)",
    flexShrink: 0,
  },
  action: {
    fontSize: "var(--font-size-sm)",
    color: "var(--color-accent)",
    textDecoration: "none",
    background: "transparent",
    padding: 0,
  },
  frame: {
    flex: 1,
    width: "100%",
    border: "none",
    minHeight: "360px",
  },
  empty: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    gap: "var(--spacing-3)",
    padding: "var(--spacing-12)",
    minHeight: "400px",
    borderRadius: "var(--radius-lg)",
    border: "1px solid var(--color-border)",
  },
  emptyIcon: {
    fontSize: "var(--font-size-2xl)",
    color: "var(--color-text-tertiary)",
  },
  emptyLabel: {
    fontSize: "var(--font-size-base)",
    color: "var(--color-text-secondary)",
  },
  buildButton: {
    padding: "var(--spacing-2) var(--spacing-5)",
    borderRadius: "var(--radius-full)",
    background: "var(--color-accent)",
    color: "var(--color-accent-text)",
    border: "none",
    fontSize: "var(--font-size-sm)",
    fontWeight: 500,
    cursor: "pointer",
    transition: "var(--transition-fast)",
  },
  error: {
    fontSize: "var(--font-size-sm)",
    color: "var(--color-err-text)",
  },
} as const;
