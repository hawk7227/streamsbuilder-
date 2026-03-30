'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  brandedEventBus,
  ActivityTimingController,
  ACTIVITY_STREAM_CONFIG,
  type BrandedEvent,
  type ActivityStreamState,
} from './index';

// ── Hook ──────────────────────────────────────────────────────────────────────

const INITIAL_STATE: ActivityStreamState = {
  current: null,
  queue: [],
  history: [],
  isActive: false,
  startedAt: null,
  completedAt: null,
};

export function useActivityStream() {
  const [state, setState] = useState<ActivityStreamState>(INITIAL_STATE);
  const timingRef = useRef(new ActivityTimingController());
  const visibleSinceRef = useRef<number | null>(null);
  const queueRef = useRef<BrandedEvent[]>([]);
  const currentRef = useRef<BrandedEvent | null>(null);

  const flushNext = () => {
    setState((prev) => {
      const nextQueue = [...queueRef.current];
      const nextEvent = nextQueue.shift() ?? null;
      queueRef.current = nextQueue;
      currentRef.current = nextEvent;
      visibleSinceRef.current = nextEvent ? Date.now() : null;
      return {
        ...prev,
        current: nextEvent,
        queue: nextQueue,
        history: nextEvent
          ? [...prev.history, nextEvent].slice(-ACTIVITY_STREAM_CONFIG.maxHistory)
          : prev.history,
        isActive: Boolean(nextEvent),
        startedAt: prev.startedAt ?? (nextEvent ? Date.now() : null),
        completedAt: nextEvent ? null : Date.now(),
      };
    });
  };

  useEffect(() => {
    const unsubscribe = brandedEventBus.subscribe((event) => {
      if (timingRef.current.shouldDrop(event)) return;
      timingRef.current.markShown(event);

      const current = currentRef.current;
      const visibleSince = visibleSinceRef.current;
      const elapsed = current && visibleSince
        ? Date.now() - visibleSince
        : ACTIVITY_STREAM_CONFIG.minVisibleMs;

      if (!current) {
        queueRef.current = [];
        currentRef.current = event;
        visibleSinceRef.current = Date.now();
        setState((prev) => ({
          ...prev,
          current: event,
          queue: [],
          history: [...prev.history, event].slice(-ACTIVITY_STREAM_CONFIG.maxHistory),
          isActive: true,
          startedAt: prev.startedAt ?? Date.now(),
          completedAt: null,
        }));
        return;
      }

      queueRef.current = [...queueRef.current, event];
      setState((prev) => ({ ...prev, queue: [...queueRef.current] }));
      timingRef.current.scheduleNext(() => { flushNext(); }, elapsed);
    });

    return () => {
      unsubscribe();
      timingRef.current.clearPending();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return useMemo(() => ({
    current: state.current,
    queue: state.queue,
    history: state.history,
    isActive: state.isActive,
    reset: () => {
      queueRef.current = [];
      currentRef.current = null;
      visibleSinceRef.current = null;
      timingRef.current.clearPending();
      setState(INITIAL_STATE);
    },
    complete: () => {
      queueRef.current = [];
      currentRef.current = null;
      visibleSinceRef.current = null;
      timingRef.current.clearPending();
      setState((prev) => ({ ...prev, current: null, queue: [], isActive: false, completedAt: Date.now() }));
    },
  }), [state]);
}

// ── ActivityStreamBar component ───────────────────────────────────────────────
// Mounts inside the assistant panel, above the voice bar.
// Always visible — idle state shows "Ready", active state shows branded activity.

export function ActivityStreamBar() {
  const { current, isActive } = useActivityStream();

  if (!isActive || !current) {
    return (
      <div style={{
        margin: '0 12px 0',
        padding: '5px 10px',
        borderRadius: 8,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
      }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(103,232,249,0.5)', letterSpacing: '0.08em' }}>
          STREAMS Response Engine
        </span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>Ready</span>
      </div>
    );
  }

  return (
    <div style={{
      margin: '0 12px 0',
      padding: '5px 10px',
      borderRadius: 8,
      background: 'rgba(34,211,238,0.06)',
      border: '1px solid rgba(34,211,238,0.18)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      transition: 'all 200ms',
    }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#67e8f9', letterSpacing: '0.06em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {current.capability}
        </div>
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
          {current.detail ?? current.label}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {typeof current.progress === 'number' && (
          <span style={{ fontSize: 9, fontWeight: 700, color: '#6ee7b7' }}>
            {Math.max(0, Math.min(100, Math.round(current.progress)))}%
          </span>
        )}
        {/* Pulsing dot */}
        <span style={{ position: 'relative', display: 'inline-flex', width: 8, height: 8 }}>
          <span style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background: 'rgba(52,211,153,0.75)',
            animation: 'ping 1s cubic-bezier(0,0,0.2,1) infinite',
          }} />
          <span style={{ position: 'relative', borderRadius: '50%', width: 8, height: 8, background: '#34d399' }} />
        </span>
      </div>
    </div>
  );
}
