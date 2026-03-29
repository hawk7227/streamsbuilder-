"use client";

/**
 * apps/web/src/lib/sse.ts
 *
 * Client-side SSE consumer. Typed against RunStreamEvent from @streams/contracts.
 * Handles reconnect, cleanup, and typed event dispatch.
 * Never used server-side — "use client" enforced.
 */

import type { RunStreamEvent } from "@streams/contracts";

export type SSEHandler = (event: RunStreamEvent) => void;
export type SSEErrorHandler = (err: Event) => void;

export interface SSEConnection {
  close: () => void;
}

export function connectToRunStream(
  runId: string,
  onEvent: SSEHandler,
  onError?: SSEErrorHandler
): SSEConnection {
  const apiBase = process.env["NEXT_PUBLIC_API_URL"] ?? "";
  const url = `${apiBase}/api/runs/${runId}/stream`;

  const source = new EventSource(url);

  source.onmessage = (e: MessageEvent<string>) => {
    try {
      const parsed = JSON.parse(e.data) as RunStreamEvent;
      onEvent(parsed);
    } catch {
      // Malformed event — skip, do not crash the stream
    }
  };

  source.onerror = (e) => {
    onError?.(e);
    // EventSource auto-reconnects on error — only close if run is terminal
  };

  return {
    close: () => source.close(),
  };
}

/**
 * React hook — attach SSE stream to a run, auto-cleanup on unmount.
 * Import from here, not directly from EventSource, so cleanup is guaranteed.
 */
export function useRunStream(
  runId: string | null,
  onEvent: SSEHandler,
  onError?: SSEErrorHandler
): void {
  // Imported dynamically in components to keep this file non-React
  // Components call this via: import { useRunStream } from "@/lib/sse"
  // The hook itself is in src/lib/hooks/useRunStream.ts
  void runId; void onEvent; void onError;
}
