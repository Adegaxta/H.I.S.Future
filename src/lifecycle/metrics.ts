const flowStarts = new Map<string, number>();

interface CloseProjectTrace {
  id: string;
  started: number;
  transitionStarted?: number;
  homeLayoutAt?: number;
  paintFinishedAt?: number;
  phases: Map<string, number>;
}

const closeTraces = new Map<string, CloseProjectTrace>();
let activeCloseTraceId: string | null = null;

function traceId(): string {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(16).slice(2, 10);
  return `close-${Date.now().toString(36)}-${suffix}`;
}

export function beginCloseProjectTrace(): string {
  const id = traceId();
  closeTraces.set(id, { id, started: performance.now(), phases: new Map() });
  activeCloseTraceId = id;
  console.info(`[lifecycle][${id}] close-project requested`);
  return id;
}

export function getActiveCloseProjectTraceId(): string | null {
  return activeCloseTraceId;
}

export function recordCloseProjectPhase(traceId: string | null, name: string, durationMs: number): void {
  if (!traceId) return;
  const trace = closeTraces.get(traceId);
  if (!trace) return;
  trace.phases.set(name, (trace.phases.get(name) ?? 0) + durationMs);
  console.info(`[lifecycle][${traceId}] ${name}: ${durationMs.toFixed(1)} ms`);
}

export function measureActiveCloseProjectPhase<T>(name: string, task: () => T): T {
  const id = activeCloseTraceId;
  const started = performance.now();
  const result = task();
  if (result instanceof Promise) {
    return result.finally(() => recordCloseProjectPhase(id, name, performance.now() - started)) as T;
  }
  recordCloseProjectPhase(id, name, performance.now() - started);
  return result;
}

export function markCloseProjectReactTransition(): void {
  const trace = activeCloseTraceId ? closeTraces.get(activeCloseTraceId) : undefined;
  if (trace) trace.transitionStarted = performance.now();
}

export function markCloseProjectHomeLayout(): void {
  const trace = activeCloseTraceId ? closeTraces.get(activeCloseTraceId) : undefined;
  if (!trace || trace.homeLayoutAt !== undefined) return;
  trace.homeLayoutAt = performance.now();
  if (trace.transitionStarted !== undefined) {
    recordCloseProjectPhase(trace.id, "React transition", trace.homeLayoutAt - trace.transitionStarted);
  }
}

export function finishCloseProjectAtHomePaint(): void {
  const trace = activeCloseTraceId ? closeTraces.get(activeCloseTraceId) : undefined;
  if (!trace || trace.paintFinishedAt !== undefined) return;
  const finished = performance.now();
  trace.paintFinishedAt = finished;
  if (trace.homeLayoutAt !== undefined) {
    recordCloseProjectPhase(trace.id, "Home useful paint", finished - trace.homeLayoutAt);
  }
  // Passive unmount cleanup (including PDF.js destroy) may run just after the
  // first painted frame. Keep the trace open for one task so those durations
  // retain the Close Project correlation id without delaying Home.
  globalThis.setTimeout(() => {
    const rows = [...trace.phases].map(([phase, duration]) => ({
      phase,
      ms: Number(duration.toFixed(1)),
    }));
    rows.push({ phase: "close-project total", ms: Number((finished - trace.started).toFixed(1)) });
    console.info(`[lifecycle][${trace.id}] close-project trace ${JSON.stringify(rows)}`);
    console.groupCollapsed(`[lifecycle][${trace.id}] close-project total ${(finished - trace.started).toFixed(1)} ms`);
    console.table(rows);
    console.groupEnd();
    if (activeCloseTraceId === trace.id) activeCloseTraceId = null;
    globalThis.setTimeout(() => closeTraces.delete(trace.id), 10_000);
  }, 50);
}

export function failCloseProjectTrace(error: unknown): void {
  if (!activeCloseTraceId) return;
  const trace = closeTraces.get(activeCloseTraceId);
  if (trace) {
    console.error(`[lifecycle][${trace.id}] close-project failed after ${(performance.now() - trace.started).toFixed(1)} ms`, error);
    closeTraces.delete(trace.id);
  }
  activeCloseTraceId = null;
}

export function startLifecycleFlow(name: string): void {
  flowStarts.set(name, performance.now());
}

export function finishLifecycleFlow(name: string, finalPhase: string): number | null {
  const started = flowStarts.get(name);
  if (started === undefined) return null;
  flowStarts.delete(name);
  const duration = performance.now() - started;
  console.info(`[lifecycle] ${name}.${finalPhase}: ${duration.toFixed(1)} ms`);
  return duration;
}

export async function measureLifecyclePhase<T>(name: string, task: () => Promise<T>): Promise<T> {
  const started = performance.now();
  try {
    return await task();
  } finally {
    console.info(`[lifecycle] ${name}: ${(performance.now() - started).toFixed(1)} ms`);
  }
}
