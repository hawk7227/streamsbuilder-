"use client";

import React from "react";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface AssistantWindowState {
  x: number;
  y: number;
  width: number;
  height: number;
  open: boolean;
}

interface UseAssistantWindowOptions {
  storageKey?: string;
  defaultWidth?: number;
  defaultHeight?: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  defaultOpen?: boolean;
}

type ResizeEdge = "right" | "bottom" | "corner";

const DEFAULTS: Required<UseAssistantWindowOptions> = {
  storageKey: "streams:ai-chat-window",
  defaultWidth: 440,
  defaultHeight: 680,
  minWidth: 360,
  minHeight: 480,
  maxWidth: 720,
  maxHeight: 900,
  defaultOpen: true,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getViewportBounds() {
  if (typeof window === "undefined") {
    return { width: 1440, height: 900 };
  }

  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

function getInitialState(opts: Required<UseAssistantWindowOptions>): AssistantWindowState {
  const { width: viewportWidth, height: viewportHeight } = getViewportBounds();
  const width = clamp(opts.defaultWidth, opts.minWidth, Math.min(opts.maxWidth, viewportWidth - 24));
  const height = clamp(opts.defaultHeight, opts.minHeight, Math.min(opts.maxHeight, viewportHeight - 24));

  return {
    x: Math.max(12, viewportWidth - width - 24),
    y: Math.max(12, viewportHeight - height - 32),
    width,
    height,
    open: opts.defaultOpen,
  };
}

function normalizeState(state: AssistantWindowState, opts: Required<UseAssistantWindowOptions>): AssistantWindowState {
  const { width: viewportWidth, height: viewportHeight } = getViewportBounds();

  const width = clamp(state.width, opts.minWidth, Math.min(opts.maxWidth, viewportWidth - 12));
  const height = clamp(state.height, opts.minHeight, Math.min(opts.maxHeight, viewportHeight - 12));
  const x = clamp(state.x, 0, Math.max(0, viewportWidth - width));
  const y = clamp(state.y, 0, Math.max(0, viewportHeight - height));

  return {
    ...state,
    x,
    y,
    width,
    height,
  };
}

export function useAssistantWindow(options?: UseAssistantWindowOptions) {
  const opts = useMemo(() => ({ ...DEFAULTS, ...(options ?? {}) }), [options]);
  const [state, setState] = useState<AssistantWindowState>(() => getInitialState(opts));
  const dragStateRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const resizeStateRef = useRef<{ edge: ResizeEdge; startX: number; startY: number; originWidth: number; originHeight: number } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Skip localStorage restore on mobile — persisted desktop dimensions corrupt mobile layout
    if (window.innerWidth < 600) return;
    try {
      const raw = window.localStorage.getItem(opts.storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as AssistantWindowState;
      setState(normalizeState({ ...getInitialState(opts), ...parsed }, opts));
    } catch {
      // Ignore invalid persisted state.
    }
  }, [opts]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Don't persist state on mobile — nothing to restore
    if (window.innerWidth < 600) return;
    window.localStorage.setItem(opts.storageKey, JSON.stringify(state));
  }, [opts.storageKey, state]);

  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [mounted, setMounted] = useState<boolean>(false);

  useEffect(() => {
    // Resolve isMobile immediately on mount — before any paint on mobile
    setIsMobile(window.innerWidth < 600);
    setMounted(true);

    const onResize = () => {
      setState((current) => normalizeState(current, opts));
      setIsMobile(window.innerWidth < 600);
    };
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, [opts]);

  const setOpen = useCallback((open: boolean) => {
    setState((current) => ({ ...current, open }));
  }, []);

  const toggleOpen = useCallback(() => {
    setState((current) => ({ ...current, open: !current.open }));
  }, []);

  const startDrag = useCallback((event: React.PointerEvent<HTMLElement>) => {
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: state.x,
      originY: state.y,
    };
  }, [state.x, state.y]);

  const onDragMove = useCallback((event: PointerEvent) => {
    const dragState = dragStateRef.current;
    if (!dragState) return;

    const dx = event.clientX - dragState.startX;
    const dy = event.clientY - dragState.startY;

    setState((current) => normalizeState({
      ...current,
      x: dragState.originX + dx,
      y: dragState.originY + dy,
    }, opts));
  }, [opts]);

  const stopDrag = useCallback(() => {
    dragStateRef.current = null;
  }, []);

  const startResize = useCallback((edge: ResizeEdge) => (event: React.PointerEvent<HTMLElement>) => {
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    resizeStateRef.current = {
      edge,
      startX: event.clientX,
      startY: event.clientY,
      originWidth: state.width,
      originHeight: state.height,
    };
  }, [state.height, state.width]);

  const onResizeMove = useCallback((event: PointerEvent) => {
    const resizeState = resizeStateRef.current;
    if (!resizeState) return;

    const dx = event.clientX - resizeState.startX;
    const dy = event.clientY - resizeState.startY;

    setState((current) => {
      let width = resizeState.originWidth;
      let height = resizeState.originHeight;

      if (resizeState.edge === "right" || resizeState.edge === "corner") {
        width = resizeState.originWidth + dx;
      }
      if (resizeState.edge === "bottom" || resizeState.edge === "corner") {
        height = resizeState.originHeight + dy;
      }

      return normalizeState({ ...current, width, height }, opts);
    });
  }, [opts]);

  const stopResize = useCallback(() => {
    resizeStateRef.current = null;
  }, []);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      onDragMove(event);
      onResizeMove(event);
    };

    const handlePointerUp = () => {
      stopDrag();
      stopResize();
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerup", handlePointerUp, { passive: true });
    window.addEventListener("pointercancel", handlePointerUp, { passive: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [onDragMove, onResizeMove, stopDrag, stopResize]);

  const shellStyle = useMemo(() => {
    if (isMobile) {
      // On mobile: position fixed directly to viewport — bypasses any absolute ancestor
      return {
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: "100%",
        height: "100%",
        transform: "none",
        willChange: "auto",
        borderRadius: 0,
        zIndex: 80,
      } as React.CSSProperties;
    }
    return {
      width: `${state.width}px`,
      height: `${state.height}px`,
      transform: `translate3d(${state.x}px, ${state.y}px, 0)`,
      willChange: "transform",
    } as React.CSSProperties;
  }, [state, isMobile]);

  return {
    state,
    shellStyle,
    isMobile,
    mounted,
    setOpen,
    toggleOpen,
    startDrag,
    startResize,
  };
}
