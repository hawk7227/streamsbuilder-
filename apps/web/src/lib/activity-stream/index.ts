'use client';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ActivityPhase =
  | 'idle' | 'starting' | 'understanding_request' | 'reviewing_context'
  | 'scanning_workspace' | 'planning' | 'preparing_preview' | 'building_ui'
  | 'updating_files' | 'rendering_preview' | 'validating' | 'optimizing'
  | 'finalizing' | 'completed' | 'error';

export type InternalToolName =
  | 'file_search' | 'repo_reader' | 'web_lookup' | 'code_generator'
  | 'patch_applier' | 'preview_renderer' | 'validator' | 'test_runner'
  | 'optimizer' | 'unknown';

export type StreamsCapability =
  | 'STREAMS Intelligence' | 'STREAMS Build Engine' | 'STREAMS Preview Engine'
  | 'STREAMS Quality Engine' | 'STREAMS Optimization Engine' | 'STREAMS Response Engine';

export type ActivityPriority = 'low' | 'normal' | 'high' | 'critical';

export interface ToolEvent {
  id: string;
  tool: InternalToolName;
  action: 'started' | 'progress' | 'completed' | 'failed' | 'opened' | 'updated' | 'rendered';
  phase?: ActivityPhase;
  message?: string;
  progress?: number;
  timestamp: number;
  meta?: Record<string, unknown>;
}

export interface BrandedEvent {
  id: string;
  phase: ActivityPhase;
  capability: StreamsCapability;
  label: string;
  detail?: string;
  progress?: number;
  visible: boolean;
  priority: ActivityPriority;
  timestamp: number;
  sticky?: boolean;
  sourceTool?: InternalToolName;
}

export interface ActivityStreamState {
  current: BrandedEvent | null;
  queue: BrandedEvent[];
  history: BrandedEvent[];
  isActive: boolean;
  startedAt: number | null;
  completedAt: number | null;
}

export interface ActivityStreamConfig {
  minVisibleMs: number;
  dedupeWindowMs: number;
  maxHistory: number;
  idleGraceMs: number;
  progressThrottleMs: number;
}

// ── Config ────────────────────────────────────────────────────────────────────

export const ACTIVITY_STREAM_CONFIG: ActivityStreamConfig = {
  minVisibleMs: 700,
  dedupeWindowMs: 450,
  maxHistory: 50,
  idleGraceMs: 250,
  progressThrottleMs: 200,
};

// ── Labels ────────────────────────────────────────────────────────────────────

export const PHASE_LABELS: Record<ActivityPhase, string> = {
  idle: 'Ready',
  starting: 'Starting secure session...',
  understanding_request: 'Understanding your request...',
  reviewing_context: 'Reviewing context...',
  scanning_workspace: 'Reviewing workspace...',
  planning: 'Preparing the best path...',
  preparing_preview: 'Preparing live preview...',
  building_ui: 'Building your interface...',
  updating_files: 'Updating project files...',
  rendering_preview: 'Rendering preview...',
  validating: 'Verifying output...',
  optimizing: 'Refining experience...',
  finalizing: 'Finalizing response...',
  completed: 'Ready',
  error: 'Needs attention',
};

export const TOOL_TO_CAPABILITY: Record<InternalToolName, StreamsCapability> = {
  file_search: 'STREAMS Intelligence',
  repo_reader: 'STREAMS Intelligence',
  web_lookup: 'STREAMS Intelligence',
  code_generator: 'STREAMS Build Engine',
  patch_applier: 'STREAMS Build Engine',
  preview_renderer: 'STREAMS Preview Engine',
  validator: 'STREAMS Quality Engine',
  test_runner: 'STREAMS Quality Engine',
  optimizer: 'STREAMS Optimization Engine',
  unknown: 'STREAMS Response Engine',
};

export const TOOL_TO_PHASE: Partial<Record<InternalToolName, ActivityPhase>> = {
  file_search: 'scanning_workspace',
  repo_reader: 'reviewing_context',
  web_lookup: 'reviewing_context',
  code_generator: 'building_ui',
  patch_applier: 'updating_files',
  preview_renderer: 'rendering_preview',
  validator: 'validating',
  test_runner: 'validating',
  optimizer: 'optimizing',
};

export const CAPABILITY_DETAIL_LABELS: Record<StreamsCapability, string[]> = {
  'STREAMS Intelligence': ['Scanning workspace...', 'Reviewing project state...', 'Understanding dependencies...'],
  'STREAMS Build Engine': ['Assembling interface...', 'Applying implementation...', 'Updating experience...'],
  'STREAMS Preview Engine': ['Preparing live view...', 'Refreshing preview...', 'Syncing visual state...'],
  'STREAMS Quality Engine': ['Checking quality...', 'Reviewing runtime safety...', 'Validating build state...'],
  'STREAMS Optimization Engine': ['Refining output...', 'Tightening performance...', 'Improving polish...'],
  'STREAMS Response Engine': ['Preparing response...', 'Continuing in sync...', 'Keeping activity visible...'],
};

// ── Event bus ─────────────────────────────────────────────────────────────────

type ActivityListener<T> = (event: T) => void;

class TypedEventBus<T> {
  private readonly listeners = new Set<ActivityListener<T>>();
  subscribe(listener: ActivityListener<T>): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  emit(event: T): void { for (const l of this.listeners) l(event); }
  clear(): void { this.listeners.clear(); }
}

export const toolEventBus = new TypedEventBus<ToolEvent>();
export const brandedEventBus = new TypedEventBus<BrandedEvent>();

export function emitToolEvent(event: ToolEvent): void { toolEventBus.emit(event); }
export function emitBrandedEvent(event: BrandedEvent): void { brandedEventBus.emit(event); }

// ── Middleware ────────────────────────────────────────────────────────────────

function getPriority(action: ToolEvent['action']): ActivityPriority {
  if (action === 'failed') return 'critical';
  if (action === 'started' || action === 'opened') return 'high';
  if (action === 'progress' || action === 'updated' || action === 'rendered') return 'normal';
  return 'low';
}

function getPhase(e: ToolEvent): ActivityPhase {
  return e.phase ?? TOOL_TO_PHASE[e.tool] ?? 'planning';
}

function getCapability(e: ToolEvent): StreamsCapability {
  return TOOL_TO_CAPABILITY[e.tool] ?? 'STREAMS Response Engine';
}

function hashString(v: string): number {
  let h = 0;
  for (let i = 0; i < v.length; i++) { h = (h << 5) - h + v.charCodeAt(i); h |= 0; }
  return h;
}

function getDetail(cap: StreamsCapability, e: ToolEvent): string {
  if (e.message?.trim()) return e.message.trim();
  const opts = CAPABILITY_DETAIL_LABELS[cap];
  return opts[Math.abs(hashString(`${e.tool}:${e.action}`)) % opts.length]!;
}

export function mapToolEventToBrandedEvent(e: ToolEvent): BrandedEvent {
  const phase = getPhase(e);
  const capability = getCapability(e);
  return {
    id: e.id,
    phase,
    capability,
    label: PHASE_LABELS[phase],
    detail: getDetail(capability, e),
    progress: e.progress,
    visible: true,
    priority: getPriority(e.action),
    timestamp: e.timestamp,
    sticky: e.action === 'failed',
    sourceTool: e.tool,
  };
}

export function registerActivityStreamMiddleware(): () => void {
  return toolEventBus.subscribe((ev) => emitBrandedEvent(mapToolEventToBrandedEvent(ev)));
}

// ── Timing controller ─────────────────────────────────────────────────────────

export class ActivityTimingController {
  private lastShownAt = 0;
  private lastProgressAt = 0;
  private lastSig = '';
  private pending: ReturnType<typeof setTimeout> | null = null;

  shouldDrop(e: BrandedEvent): boolean {
    const now = Date.now();
    const sig = `${e.phase}:${e.capability}:${e.detail ?? ''}`;
    if (sig === this.lastSig && now - this.lastShownAt < ACTIVITY_STREAM_CONFIG.dedupeWindowMs) return true;
    if (typeof e.progress === 'number' && now - this.lastProgressAt < ACTIVITY_STREAM_CONFIG.progressThrottleMs) return true;
    return false;
  }

  markShown(e: BrandedEvent): void {
    const now = Date.now();
    this.lastShownAt = now;
    this.lastSig = `${e.phase}:${e.capability}:${e.detail ?? ''}`;
    if (typeof e.progress === 'number') this.lastProgressAt = now;
  }

  scheduleNext(next: () => void, elapsed: number): void {
    this.clearPending();
    const remaining = Math.max(0, ACTIVITY_STREAM_CONFIG.minVisibleMs - elapsed);
    this.pending = setTimeout(next, remaining);
  }

  clearPending(): void {
    if (this.pending) { clearTimeout(this.pending); this.pending = null; }
  }
}

// ── Runtime controller (call these from your response handlers) ───────────────

function baseToolEvent(
  tool: InternalToolName,
  action: ToolEvent['action'],
  overrides?: Partial<ToolEvent>,
): ToolEvent {
  return { id: Math.random().toString(36).slice(2), tool, action, timestamp: Date.now(), ...overrides };
}

export const ActivityController = {
  responseStarted(message = 'Secure response started'): void {
    emitToolEvent(baseToolEvent('unknown', 'started', { phase: 'starting', message }));
  },
  phase(phase: ActivityPhase, message?: string): void {
    emitToolEvent(baseToolEvent('unknown', 'progress', { phase, message }));
  },
  toolStarted(tool: InternalToolName, message?: string): void {
    emitToolEvent(baseToolEvent(tool, 'started', { message }));
  },
  toolProgress(tool: InternalToolName, progress: number, message?: string): void {
    emitToolEvent(baseToolEvent(tool, 'progress', { progress, message }));
  },
  toolCompleted(tool: InternalToolName, message?: string): void {
    emitToolEvent(baseToolEvent(tool, 'completed', { message }));
  },
  toolFailed(tool: InternalToolName, message: string): void {
    emitToolEvent(baseToolEvent(tool, 'failed', { phase: 'error', message }));
  },
  previewOpened(message = 'Live preview ready'): void {
    emitToolEvent(baseToolEvent('preview_renderer', 'opened', { phase: 'preparing_preview', message }));
  },
  previewRendered(progress?: number, message = 'Preview updated'): void {
    emitToolEvent(baseToolEvent('preview_renderer', 'rendered', { phase: 'rendering_preview', progress, message }));
  },
  responseCompleted(message = 'Response complete'): void {
    emitToolEvent(baseToolEvent('unknown', 'completed', { phase: 'completed', message }));
  },
};

export const ACTIVITY_STREAM_RULES = [
  'Every response must emit visible activity immediately.',
  'Blank waiting states are not allowed.',
  'Raw tool names must never be shown to the user.',
  'User-visible activity must use STREAMS-branded capability labels.',
  'Progress updates must be throttled to avoid flicker and spam.',
  'Each visible activity state must remain on screen long enough to be perceived.',
  'Preview activity is conditional, but response activity is mandatory for every response.',
] as const;
