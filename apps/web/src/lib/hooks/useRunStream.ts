"use client";

import { useEffect, useRef } from "react";
import { connectToRunStream } from "@/lib/sse";
import type { SSEHandler, SSEErrorHandler } from "@/lib/sse";

export function useRunStream(
  runId: string | null,
  onEvent: SSEHandler,
  onError?: SSEErrorHandler
): void {
  // Stable refs so effect doesn't re-fire on every render
  const onEventRef = useRef(onEvent);
  const onErrorRef = useRef(onError);
  onEventRef.current = onEvent;
  onErrorRef.current = onError;

  useEffect(() => {
    if (!runId) return;

    const conn = connectToRunStream(
      runId,
      (event) => onEventRef.current(event),
      (err) => onErrorRef.current?.(err)
    );

    return () => conn.close();
  }, [runId]);
}
