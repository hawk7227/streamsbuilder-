"use client";

import { useState, useCallback, useRef } from "react";
import { uploadFile } from "@/lib/api-client";

interface FileUploadProps {
  projectId: string;
  onUploaded?: (fileId: string) => void;
}

interface UploadState {
  status: "idle" | "dragging" | "uploading" | "done" | "error";
  filename?: string | undefined;
  fileId?: string | undefined;
  error?: string | undefined;
}

const MAX_SIZE_BYTES = 100 * 1024 * 1024; // 100MB — mirrors contracts
const _ALLOWED_MIME_TYPES = new Set([
  "text/plain", "text/markdown", "text/typescript", "text/javascript",
  "application/json", "application/pdf", "image/png", "image/jpeg",
  "application/zip", "application/octet-stream",
]);

export function FileUpload({ projectId, onUploaded }: FileUploadProps) {
  const [state, setState] = useState<UploadState>({ status: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    // Client-side validation before hitting the API
    if (file.size > MAX_SIZE_BYTES) {
      setState({ status: "error", error: `File exceeds 100MB limit (${(file.size / 1e6).toFixed(1)}MB)` });
      return;
    }

    setState({ status: "uploading", filename: file.name });

    try {
      const result = await uploadFile({
        projectId,
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      });

      setState({ status: "done", filename: file.name, fileId: result.fileId });
      onUploaded?.(result.fileId);
    } catch (err) {
      setState({
        status: "error",
        filename: file.name,
        error: err instanceof Error ? err.message : "Upload failed",
      });
    }
  }, [projectId, onUploaded]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setState((s) => ({ ...s, status: "idle" }));
    const file = e.dataTransfer.files[0];
    if (file) void processFile(file);
  }, [processFile]);

  const onInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void processFile(file);
  }, [processFile]);

  const isDragging = state.status === "dragging";
  const isUploading = state.status === "uploading";

  return (
    <div
      style={{
        ...styles.zone,
        borderColor: isDragging
          ? "var(--color-accent)"
          : state.status === "error"
          ? "var(--color-err-border)"
          : state.status === "done"
          ? "var(--color-ok-border)"
          : "var(--color-border-strong)",
        background: isDragging ? "var(--color-bg-secondary)" : "transparent",
        opacity: isUploading ? 0.7 : 1,
        transition: "var(--transition-base)",
      }}
      onDragEnter={(e) => { e.preventDefault(); setState((s) => ({ ...s, status: "dragging" })); }}
      onDragOver={(e) => { e.preventDefault(); }}
      onDragLeave={() => setState((s) => s.status === "dragging" ? { ...s, status: "idle" } : s)}
      onDrop={onDrop}
      role="button"
      tabIndex={0}
      aria-label="File upload zone"
      onClick={() => !isUploading && inputRef.current?.click()}
      onKeyDown={(e) => e.key === "Enter" && !isUploading && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        style={{ display: "none" }}
        onChange={onInputChange}
        disabled={isUploading}
        aria-hidden="true"
      />

      {state.status === "idle" || state.status === "dragging" ? (
        <>
          <div style={styles.icon} aria-hidden="true">↑</div>
          <div style={styles.label}>
            {isDragging ? "Drop to upload" : "Upload file"}
          </div>
          <div style={styles.hint}>Drag & drop or click · Max 100MB</div>
        </>
      ) : state.status === "uploading" ? (
        <>
          <div style={styles.spinner} aria-hidden="true" />
          <div style={styles.label}>Uploading {state.filename}…</div>
        </>
      ) : state.status === "done" ? (
        <>
          <div style={{ ...styles.icon, color: "var(--color-ok-text)" }}>✓</div>
          <div style={styles.label}>{state.filename}</div>
          <div style={styles.hint}>
            <button
              type="button"
              style={styles.resetButton}
              onClick={(e) => { e.stopPropagation(); setState({ status: "idle" }); }}
            >
              Upload another
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ ...styles.icon, color: "var(--color-err-text)" }}>✕</div>
          <div style={{ ...styles.label, color: "var(--color-err-text)" }}>{state.error}</div>
          <div style={styles.hint}>
            <button
              type="button"
              style={styles.resetButton}
              onClick={(e) => { e.stopPropagation(); setState({ status: "idle" }); }}
            >
              Try again
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const styles = {
  zone: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    gap: "var(--spacing-2)",
    padding: "var(--spacing-8)",
    borderRadius: "var(--radius-lg)",
    border: "1.5px dashed",
    cursor: "pointer",
    minHeight: "140px",
    userSelect: "none" as const,
  },
  icon: {
    fontSize: "var(--font-size-xl)",
    color: "var(--color-text-tertiary)",
  },
  label: {
    fontSize: "var(--font-size-base)",
    color: "var(--color-text-primary)",
    fontWeight: 500,
  },
  hint: {
    fontSize: "var(--font-size-sm)",
    color: "var(--color-text-tertiary)",
  },
  spinner: {
    width: "24px",
    height: "24px",
    borderRadius: "50%",
    border: "2px solid var(--color-border)",
    borderTopColor: "var(--color-accent)",
    animation: "spin 600ms linear infinite",
  },
  resetButton: {
    background: "none",
    border: "none",
    color: "var(--color-accent)",
    fontSize: "var(--font-size-sm)",
    cursor: "pointer",
    padding: 0,
    textDecoration: "underline",
  },
} as const;
