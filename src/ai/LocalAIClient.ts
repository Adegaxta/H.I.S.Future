import { LOCAL_AI_CONFIG } from "./config";
import type { AIMessageMetrics } from "./types";

export interface LocalAIChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface StreamCallbacks {
  onDelta: (content: string) => void;
}

type JsonRecord = Record<string, unknown>;

export class LocalAIClientError extends Error {
  constructor(
    public readonly kind: "unavailable" | "server" | "invalid-response",
    message: string,
  ) {
    super(message);
    this.name = "LocalAIClientError";
  }
}

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const finiteNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

function metricsFromChunk(chunk: JsonRecord): AIMessageMetrics | null {
  const usage = isRecord(chunk.usage) ? chunk.usage : null;
  const timings = isRecord(chunk.timings) ? chunk.timings : null;
  if (!usage && !timings) return null;
  const predictedMilliseconds = finiteNumber(timings?.predicted_ms);
  return {
    tokens: finiteNumber(usage?.completion_tokens),
    elapsedSeconds: predictedMilliseconds === null ? null : predictedMilliseconds / 1000,
    tokensPerSecond: finiteNumber(timings?.predicted_per_second),
  };
}

function deltaFromChunk(chunk: JsonRecord): string {
  if (!Array.isArray(chunk.choices) || chunk.choices.length === 0) return "";
  const choice = chunk.choices[0];
  if (!isRecord(choice) || !isRecord(choice.delta)) return "";
  return typeof choice.delta.content === "string" ? choice.delta.content : "";
}

function serverErrorDetail(body: string): string {
  try {
    const parsed: unknown = JSON.parse(body);
    if (!isRecord(parsed)) return body;
    if (typeof parsed.error === "string") return parsed.error;
    if (isRecord(parsed.error) && typeof parsed.error.message === "string") return parsed.error.message;
  } catch {
    // A non-JSON response is still useful as a short diagnostic.
  }
  return body;
}

export async function streamLocalAIChat(
  messages: readonly LocalAIChatMessage[],
  callbacks: StreamCallbacks,
  signal: AbortSignal,
  options: { maxTokens?: number } = {},
): Promise<AIMessageMetrics | null> {
  try {
    const response = await fetch(LOCAL_AI_CONFIG.chatEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LOCAL_AI_CONFIG.requestModel,
        messages,
        stream: true,
        stream_options: { include_usage: true },
        ...(options.maxTokens ? { max_tokens: Math.max(8, Math.min(options.maxTokens, 1024)) } : {}),
      }),
      signal,
    });

    if (!response.ok) {
      const detail = serverErrorDetail((await response.text()).slice(0, 500));
      throw new LocalAIClientError("server", detail || `llama-server respondió con HTTP ${response.status}.`);
    }
    if (!response.body) {
      throw new LocalAIClientError("invalid-response", "llama-server no devolvió un stream legible.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let metrics: AIMessageMetrics | null = null;

    const consumeLine = (rawLine: string) => {
      const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
      if (!line.startsWith("data:")) return;
      const data = line.slice(5).trimStart();
      if (!data || data === "[DONE]") return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(data);
      } catch {
        throw new LocalAIClientError("invalid-response", "llama-server devolvió un fragmento SSE inválido.");
      }
      if (!isRecord(parsed)) return;
      const delta = deltaFromChunk(parsed);
      if (delta) callbacks.onDelta(delta);
      const nextMetrics = metricsFromChunk(parsed);
      if (nextMetrics) metrics = nextMetrics;
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newlineIndex = buffer.indexOf("\n");
        while (newlineIndex >= 0) {
          consumeLine(buffer.slice(0, newlineIndex));
          buffer = buffer.slice(newlineIndex + 1);
          newlineIndex = buffer.indexOf("\n");
        }
      }
      buffer += decoder.decode();
      if (buffer) consumeLine(buffer);
    } finally {
      reader.releaseLock();
    }

    return metrics;
  } catch (error) {
    if (signal.aborted) throw error;
    if (error instanceof LocalAIClientError) throw error;
    throw new LocalAIClientError("unavailable", "No se pudo conectar con el modelo local.");
  }
}
