import { createDiagnosticEvent, emitDiagnosticEvent } from "../diagnostics/events";

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
  emitDiagnosticEvent(createDiagnosticEvent({
    level: "INFO",
    category: "PROJECT",
    action: "close.started",
    operation: "workspace.close",
    operationId: id,
    message: "Closing project",
    technicalDetail: JSON.stringify({ traceId: id }),
  }));
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
  emitDiagnosticEvent(createDiagnosticEvent({
    level: "DEBUG",
    category: "PROJECT",
    action: "close.phase.completed",
    operation: "workspace.close",
    operationId: traceId,
    message: `${name} completed`,
    technicalDetail: JSON.stringify({ phase: name, durationMs: Number(durationMs.toFixed(1)) }),
  }));
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
    emitDiagnosticEvent(createDiagnosticEvent({
      level: "INFO",
      category: "PROJECT",
      action: "close.completed",
      operation: "workspace.close",
      operationId: trace.id,
      message: "Project closed",
      technicalDetail: JSON.stringify({
        phases: rows,
        totalMs: Number((finished - trace.started).toFixed(1)),
      }),
    }));
    if (activeCloseTraceId === trace.id) activeCloseTraceId = null;
    globalThis.setTimeout(() => closeTraces.delete(trace.id), 10_000);
  }, 50);
}

export function failCloseProjectTrace(error: unknown): void {
  if (!activeCloseTraceId) return;
  const trace = closeTraces.get(activeCloseTraceId);
  if (trace) {
    const detail = error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) };
    emitDiagnosticEvent(createDiagnosticEvent({
      level: "ERROR",
      category: "PROJECT",
      action: "close.failed",
      operation: "workspace.close",
      operationId: trace.id,
      message: "Project could not be closed safely",
      technicalDetail: JSON.stringify({
        ...detail,
        elapsedMs: Number((performance.now() - trace.started).toFixed(1)),
      }),
    }));
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
  emitDiagnosticEvent(createDiagnosticEvent({
    level: "DEBUG",
    category: "SYSTEM",
    action: "lifecycle.flow.completed",
    message: `${name}.${finalPhase} completed`,
    technicalDetail: JSON.stringify({ flow: name, finalPhase, durationMs: Number(duration.toFixed(1)) }),
  }));
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
