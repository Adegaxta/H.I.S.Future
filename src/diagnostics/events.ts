export type DiagnosticLevel = "ERROR" | "WARN" | "INFO" | "DEBUG" | "TRACE";

export interface DiagnosticEvent {
  timestamp: string;
  level: DiagnosticLevel;
  category: string;
  action: string;
  operation?: string;
  operationId?: string;
  traceId?: string;
  nodeId?: string;
  relatedNodeIds?: string[];
  resourceId?: string;
  message: string;
  technicalDetail: string;
}

export const MAX_DIAGNOSTIC_EVENTS = 300;

export type DiagnosticEventInput = Omit<DiagnosticEvent, "timestamp"> & {
  timestamp?: string;
};

let events: DiagnosticEvent[] = [];
let trackingPaused = false;
const listeners = new Set<() => void>();

function notifyListeners() {
  for (const listener of listeners) listener();
}

export function createDiagnosticEvent(input: DiagnosticEventInput): DiagnosticEvent {
  return {
    timestamp: input.timestamp ?? new Date().toISOString(),
    level: input.level,
    category: input.category,
    action: input.action,
    ...(input.operation ? { operation: input.operation } : {}),
    ...(input.operationId ? { operationId: input.operationId } : {}),
    ...(input.traceId ? { traceId: input.traceId } : {}),
    ...(input.nodeId ? { nodeId: input.nodeId } : {}),
    ...(input.relatedNodeIds?.length ? { relatedNodeIds: [...input.relatedNodeIds] } : {}),
    ...(input.resourceId ? { resourceId: input.resourceId } : {}),
    message: input.message,
    technicalDetail: input.technicalDetail,
  };
}

export function getDiagnosticEvents(): readonly DiagnosticEvent[] {
  return events;
}

export function subscribeDiagnosticEvents(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isDiagnosticTrackingPaused(): boolean {
  return trackingPaused;
}

export function pauseDiagnosticTracking(paused: boolean): void {
  if (trackingPaused === paused) return;
  trackingPaused = paused;
  notifyListeners();
}

export function clearDiagnosticEvents(): void {
  if (!events.length) return;
  events = [];
  notifyListeners();
}

export function publishDiagnosticEvent(event: DiagnosticEvent): void {
  if (trackingPaused) return;
  events = [...events, event].slice(-MAX_DIAGNOSTIC_EVENTS);
  notifyListeners();
}

export function emitDiagnosticEvent(event: DiagnosticEvent): void {
  publishDiagnosticEvent(event);
  const output = `[${event.category}] ${event.message}`;
  const details = { ...event };
  if (event.level === "ERROR") console.error(output, details);
  else if (event.level === "WARN") console.warn(output, details);
  else if (event.level === "DEBUG" || event.level === "TRACE") console.debug(output, details);
  else console.info(output, details);
}
