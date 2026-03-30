"use client";

import { useState, useRef, useCallback, type KeyboardEvent } from "react";
import type { BotRequest } from "@streams/contracts";

type RunMode = BotRequest["mode"];

interface ComposerProps {
  projectId: string;
  conversationId?: string | undefined;
  disabled?: boolean | undefined;
  onSubmit: (req: Omit<BotRequest, "projectId" | "conversationId">) => void;
}

const MODES: { value: RunMode; label: string; hint: string }[] = [
  { value: "auto",    label: "Auto",    hint: "Classifies request automatically" },
  { value: "helper",  label: "Helper",  hint: "Explain, write, debug small tasks" },
  { value: "builder", label: "Builder", hint: "Full system architecture + codegen" },
  { value: "runtime", label: "Runtime", hint: "Build, test, preview execution" },
  { value: "deploy",  label: "Deploy",  hint: "Preflight, CI gates, release" },
];

export function Composer({ projectId, conversationId, disabled = false, onSubmit }: ComposerProps) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<RunMode>("auto");
  const [showModes, setShowModes] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const submit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;

    onSubmit({
      userMessage: trimmed,
      mode,
      attachments: [],
      capabilitiesWanted: [],
    });

    setText("");

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [text, mode, disabled, onSubmit]);

  const handleKey = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        submit();
      }
    },
    [submit]
  );

  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    // Auto-grow textarea — no layout shift, height expands downward
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, []);

  const selectedMode = MODES.find((m) => m.value === mode) ?? MODES[0]!;

  return (
    <div style={styles.wrapper}>
      <div style={{ ...styles.container, opacity: disabled ? 0.6 : 1 }}>
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKey}
          placeholder="Ask anything — helper, builder, runtime, or deploy…"
          disabled={disabled}
          rows={1}
          style={styles.textarea}
          aria-label="Message"
        />

        {/* Footer row */}
        <div style={styles.footer}>
          {/* Mode selector */}
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setShowModes((v) => !v)}
              style={styles.modeButton}
              aria-haspopup="listbox"
              aria-expanded={showModes}
            >
              <span style={styles.modeDot(mode)} aria-hidden="true" />
              {selectedMode.label}
              <span style={styles.chevron} aria-hidden="true">⌄</span>
            </button>

            {showModes && (
              <div style={styles.modeDropdown} role="listbox">
                {MODES.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    role="option"
                    aria-selected={mode === m.value}
                    onClick={() => { setMode(m.value); setShowModes(false); }}
                    style={{
                      ...styles.modeOption,
                      background: mode === m.value ? "var(--color-bg-tertiary)" : "transparent",
                    }}
                  >
                    <span style={styles.modeDot(m.value)} aria-hidden="true" />
                    <span>
                      <span style={styles.modeOptionLabel}>{m.label}</span>
                      <span style={styles.modeOptionHint}>{m.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Char count + send */}
          <div style={styles.footerRight}>
            {text.length > 0 && (
              <span style={styles.charCount}>{text.length.toLocaleString()}</span>
            )}
            <button
              type="button"
              onClick={submit}
              disabled={!text.trim() || disabled}
              style={{
                ...styles.sendButton,
                opacity: !text.trim() || disabled ? 0.4 : 1,
              }}
              aria-label="Send (⌘ Enter)"
            >
              ↑
            </button>
          </div>
        </div>
      </div>

      <p style={styles.hint}>⌘ Enter to send</p>
    </div>
  );
}

function modeDotColor(mode: RunMode): string {
  const map: Record<RunMode, string> = {
    auto:    "var(--color-text-tertiary)",
    helper:  "#34c759",
    builder: "#007aff",
    runtime: "#ff9f0a",
    deploy:  "#ff3b30",
  };
  return map[mode];
}

const styles = {
  wrapper: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "var(--spacing-2)",
    width: "100%",
    maxWidth: "768px",
  },
  container: {
    display: "flex",
    flexDirection: "column" as const,
    borderRadius: "var(--radius-lg)",
    border: "1px solid var(--color-border-strong)",
    background: "var(--color-surface)",
    boxShadow: "var(--shadow-sm)",
    transition: "opacity var(--motion-fast) var(--motion-easing)",
    overflow: "hidden",
  },
  textarea: {
    width: "100%",
    minHeight: "52px",
    maxHeight: "240px",
    padding: "var(--spacing-4) var(--spacing-4) var(--spacing-2)",
    fontFamily: "var(--font-sans)",
    fontSize: "var(--font-size-base)",
    lineHeight: "1.6",
    color: "var(--color-text-primary)",
    background: "transparent",
    border: "none",
    outline: "none",
    resize: "none",
    overflowY: "auto" as const,
  },
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "var(--spacing-2) var(--spacing-3)",
    borderTop: "1px solid var(--color-border)",
  },
  footerRight: {
    display: "flex",
    alignItems: "center",
    gap: "var(--spacing-2)",
  },
  modeButton: {
    display: "flex",
    alignItems: "center",
    gap: "var(--spacing-1)",
    padding: "var(--spacing-1) var(--spacing-2)",
    borderRadius: "var(--radius-full)",
    border: "1px solid var(--color-border)",
    background: "transparent",
    fontSize: "var(--font-size-sm)",
    color: "var(--color-text-secondary)",
    cursor: "pointer",
    transition: "var(--transition-fast)",
  },
  modeDot: (mode: RunMode) => ({
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    background: modeDotColor(mode),
    flexShrink: 0,
  }),
  chevron: {
    fontSize: "var(--font-size-xs)",
    lineHeight: 1,
  },
  modeDropdown: {
    position: "absolute" as const,
    bottom: "calc(100% + var(--spacing-2))",
    left: 0,
    zIndex: 50,
    minWidth: "220px",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--color-border-strong)",
    background: "var(--color-surface-raised)",
    boxShadow: "var(--shadow-md)",
    padding: "var(--spacing-1)",
    display: "flex",
    flexDirection: "column" as const,
    gap: "2px",
  },
  modeOption: {
    display: "flex",
    alignItems: "flex-start",
    gap: "var(--spacing-2)",
    padding: "var(--spacing-2) var(--spacing-3)",
    borderRadius: "var(--radius-sm)",
    border: "none",
    cursor: "pointer",
    textAlign: "left" as const,
    transition: "var(--transition-fast)",
  },
  modeOptionLabel: {
    display: "block",
    fontSize: "var(--font-size-sm)",
    color: "var(--color-text-primary)",
    fontWeight: 500,
  },
  modeOptionHint: {
    display: "block",
    fontSize: "var(--font-size-xs)",
    color: "var(--color-text-tertiary)",
    marginTop: "1px",
  },
  charCount: {
    fontSize: "var(--font-size-xs)",
    color: "var(--color-text-tertiary)",
  },
  sendButton: {
    width: "28px",
    height: "28px",
    borderRadius: "50%",
    border: "none",
    background: "var(--color-accent)",
    color: "var(--color-accent-text)",
    fontSize: "var(--font-size-md)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    transition: "var(--transition-fast)",
    flexShrink: 0,
  },
  hint: {
    fontSize: "var(--font-size-xs)",
    color: "var(--color-text-tertiary)",
    textAlign: "center" as const,
  },
} as const;
