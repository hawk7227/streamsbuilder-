"use client";

import React from "react";
import { useAssistantWindow } from "./useAssistantWindow";

interface AIAssistantShellProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  onClose?: () => void;
}

export function AIAssistantShell({ title = "AI Assistant", subtitle = "Governed, streaming, multimodal", children, footer, onClose }: AIAssistantShellProps) {
  const { state, shellStyle, isMobile, mounted, toggleOpen, startDrag, startResize } = useAssistantWindow();

  // Don't render until mounted — isMobile resolves in first effect,
  // rendering before that causes one frame with wrong desktop shellStyle on mobile
  if (!mounted) return null;

  if (!state.open) {
    return (
      <button
        type="button"
        onClick={toggleOpen}
        className="fixed bottom-6 right-6 z-[70] rounded-full border border-white/10 bg-[#0A0C10]/90 px-5 py-3 text-sm font-semibold text-white shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl"
      >
        Open assistant
      </button>
    );
  }

  return (
    <div className={["fixed inset-0 z-[70]", isMobile ? "pointer-events-auto bg-[#0A0C10]" : "pointer-events-none"].join(" ")} style={isMobile ? { touchAction: "none" } : undefined}>
      <section
        className={[
          "pointer-events-auto overflow-hidden bg-[#0A0C10]",
          isMobile
            ? "border-0 rounded-none shadow-none"
            : "absolute border border-white/12 rounded-[28px] shadow-[0_40px_120px_rgba(0,0,0,0.8)]",
        ].join(" ")}
        style={shellStyle}
      >
        
        <div className="relative flex h-full flex-col">
          <header
            onPointerDown={isMobile ? undefined : startDrag}
            className={["flex items-center justify-between border-b border-white/8", isMobile ? "px-4 py-3" : "px-5 py-4 cursor-grab active:cursor-grabbing items-start"].join(" ")}
          >
            <div>
              {!isMobile && <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45">Floating AI chat</div>}
              <div className={isMobile ? "text-[15px] font-semibold text-white" : "mt-1 text-lg font-semibold tracking-[-0.02em] text-white"}>{title}</div>
              {!isMobile && <p className="mt-1 text-sm text-white/55">{subtitle}</p>}
            </div>
            <div className="flex items-center gap-2">
              {!isMobile && <button type="button" onClick={toggleOpen} className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-white/70 transition hover:border-white/20 hover:text-white">Minimize</button>}
              <button type="button" onClick={isMobile ? toggleOpen : onClose} className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-white/70 transition hover:border-white/20 hover:text-white">{isMobile ? "✕" : "Close"}</button>
            </div>
          </header>

          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>

          <footer
            className="relative border-t border-white/8 px-4 py-4"
            style={isMobile ? { paddingBottom: "calc(16px + env(safe-area-inset-bottom))" } : undefined}
          >{footer}</footer>

          {!isMobile && <>
            <button
              type="button"
              onPointerDown={startResize("right")}
              className="absolute right-0 top-14 h-[calc(100%-64px)] w-3 cursor-ew-resize opacity-0"
              aria-label="Resize assistant width"
            />
            <button
              type="button"
              onPointerDown={startResize("bottom")}
              className="absolute bottom-0 left-0 h-3 w-[calc(100%-16px)] cursor-ns-resize opacity-0"
              aria-label="Resize assistant height"
            />
            <button
              type="button"
              onPointerDown={startResize("corner")}
              className="absolute bottom-0 right-0 h-5 w-5 cursor-nwse-resize"
              aria-label="Resize assistant"
            >
              <span className="absolute bottom-1.5 right-1.5 h-2.5 w-2.5 rounded-sm border border-white/20 bg-white/10" />
            </button>
          </>}
        </div>
      </section>
    </div>
  );
}
