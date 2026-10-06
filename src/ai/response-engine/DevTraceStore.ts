import type { AnswerSpec } from "./types";

export interface GemitaVDevTrace {
  requestId: string;
  recordedAt: string;
  rawAnswerSpec: AnswerSpec;
  rawGemmaDraft: string | null;
  finalRender: string;
}

const MAX_DEV_TRACES = 20;
const traces: GemitaVDevTrace[] = [];

export function recordGemitaVDevTrace(trace: Omit<GemitaVDevTrace, "recordedAt">): void {
  if (!import.meta.env.DEV) return;
  traces.push({ ...trace, recordedAt: new Date().toISOString() });
  if (traces.length > MAX_DEV_TRACES) traces.splice(0, traces.length - MAX_DEV_TRACES);
}

export function listGemitaVDevTraces(): readonly GemitaVDevTrace[] {
  return import.meta.env.DEV ? [...traces] : [];
}
