import { invoke, isTauri } from "@tauri-apps/api/core";

export type AILogCategory =
  | "his"
  | "lexicon"
  | "scope"
  | "memory"
  | "resolve"
  | "plan"
  | "retrieval"
  | "graph"
  | "expand"
  | "evidence"
  | "context"
  | "act"
  | "route"
  | "answer_spec"
  | "draft"
  | "validate"
  | "repair"
  | "nlg"
  | "final"
  | "model"
  | "llama"
  | "warn"
  | "error"
  | "chat"
  | "semantic"
  | "reference"
  | "conversation_state"
  | "memory_write"
  | "memory_retrieve"
  | "summary"
  | "context_assembly";

export type AILogLevel = "normal" | "debug";

export interface AILogEvent {
  timestamp: string;
  category: AILogCategory;
  requestId?: string;
  message: string;
  level: AILogLevel;
  metadata?: Record<string, unknown>;
  detail?: string;
}

interface EmitAILogOptions {
  requestId?: string;
  metadata?: Record<string, unknown>;
  detail?: string;
  debugOnly?: boolean;
}

let deliveryQueue = Promise.resolve();

export function emitAILog(
  category: AILogCategory,
  message: string,
  options: EmitAILogOptions = {},
): void {
  if (options.debugOnly && !import.meta.env.DEV) return;
  const event: AILogEvent = {
    timestamp: new Date().toISOString(),
    category,
    message,
    level: options.debugOnly ? "debug" : "normal",
    ...(options.requestId ? { requestId: options.requestId } : {}),
    ...(options.metadata ? { metadata: options.metadata } : {}),
    ...(options.detail ? { detail: options.detail } : {}),
  };

  if (import.meta.env.DEV) console.info("[ai-event]", event);
  if (!isTauri()) return;

  deliveryQueue = deliveryQueue
    .then(() => invoke<void>("emit_ai_diagnostic", { event }))
    .catch((error: unknown) => {
      if (import.meta.env.DEV) console.warn("[ai-event] delivery failed", error);
    });
}
