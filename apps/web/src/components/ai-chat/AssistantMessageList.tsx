"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { AssistantMessage, type AssistantMessageShape } from "./AssistantMessage";

interface AssistantMessageListProps {
  messages: AssistantMessageShape[];
  streamingText?: string;
  streamingMode?: AssistantMessageShape["mode"];
  pending: boolean;
}

export function AssistantMessageList({ messages, streamingText, streamingMode, pending }: AssistantMessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [scrolledToBottom, setScrolledToBottom] = useState(true);

  // Track whether user is at the bottom
  const onScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const threshold = 60;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - threshold;
    setScrolledToBottom(atBottom);
  }, []);

  // Auto-scroll when new content arrives — only if already at bottom
  useEffect(() => {
    if (scrolledToBottom) {
      anchorRef.current?.scrollIntoView({ block: "end", behavior: pending ? "auto" : "smooth" });
    }
  }, [messages, pending, streamingText, scrolledToBottom]);

  function scrollToBottom() {
    anchorRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
    setScrolledToBottom(true);
  }

  return (
    <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div
        ref={containerRef}
        onScroll={onScroll}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px",
          minHeight: 0,
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch" as never,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 760, margin: "0 auto" }}>
          {messages.map((message, index) => (
            <AssistantMessage key={`${message.role}-${index}`} message={message} />
          ))}

          {pending && streamingText ? (
            <AssistantMessage
              message={{
                role: "assistant",
                content: [{ type: "text", text: streamingText }],
                mode: streamingMode,
              }}
            />
          ) : null}

          {/* Pending spinner — no text yet */}
          {pending && !streamingText ? (
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <div style={{ borderRadius: 24, borderBottomLeftRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.06)", padding: "10px 16px" }}>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  {[0, 1, 2].map(i => (
                    <span key={i} style={{
                      width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.4)",
                      animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                    }} />
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <div ref={anchorRef} />
        </div>
      </div>

      {/* Scroll-to-bottom button */}
      {!scrolledToBottom && (
        <button
          type="button"
          onClick={scrollToBottom}
          style={{
            position: "absolute",
            bottom: 12,
            left: "50%",
            transform: "translateX(-50%)",
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.12)",
            border: "1px solid rgba(255,255,255,0.2)",
            color: "#fff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            backdropFilter: "blur(8px)",
            boxShadow: "0 4px 14px rgba(0,0,0,0.3)",
            zIndex: 10,
          }}
          aria-label="Scroll to bottom"
        >
          ↓
        </button>
      )}
    </div>
  );
}
