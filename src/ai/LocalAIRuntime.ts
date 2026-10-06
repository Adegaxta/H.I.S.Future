import { invoke } from "@tauri-apps/api/core";
import { isDesktopRuntime } from "../project/runtime";
import { LOCAL_AI_CONFIG } from "./config";

export type LocalAIRuntimeState = "stopped" | "starting" | "ready" | "stopping" | "error";

export interface LocalAIRuntimeSnapshot {
  state: LocalAIRuntimeState;
  ownership: "external" | "his" | null;
  pid: number | null;
}

interface RuntimeErrorPayload {
  code?: unknown;
  message?: unknown;
  detail?: unknown;
}

export class LocalAIRuntimeError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly detail: string | null = null,
  ) {
    super(message);
    this.name = "LocalAIRuntimeError";
  }
}

let state: LocalAIRuntimeState = "stopped";
let startupPromise: Promise<LocalAIRuntimeSnapshot> | null = null;

export function getLocalAIRuntimeState(): LocalAIRuntimeState {
  return state;
}

function asRuntimeError(error: unknown): LocalAIRuntimeError {
  const payload = typeof error === "object" && error !== null ? error as RuntimeErrorPayload : null;
  if (payload && typeof payload.message === "string") {
    return new LocalAIRuntimeError(
      typeof payload.code === "string" ? payload.code : "runtime_error",
      payload.message,
      typeof payload.detail === "string" && payload.detail.trim() ? payload.detail : null,
    );
  }
  return new LocalAIRuntimeError("runtime_error", String(error || "No se pudo preparar la IA local."));
}

async function requireExternalServerInBrowser(): Promise<LocalAIRuntimeSnapshot> {
  try {
    const response = await fetch(`${LOCAL_AI_CONFIG.baseUrl}/health`);
    const body: unknown = await response.json();
    const status = typeof body === "object" && body !== null && "status" in body
      ? (body as { status?: unknown }).status
      : null;
    if (response.ok && status === "ok") {
      const propsResponse = await fetch(`${LOCAL_AI_CONFIG.baseUrl}/props`);
      const props: unknown = await propsResponse.json();
      if (
        propsResponse.ok
        && typeof props === "object"
        && props !== null
        && "build_info" in props
        && "model_path" in props
        && "total_slots" in props
      ) {
        return { state: "ready", ownership: "external", pid: null };
      }
    }
  } catch {
    // Browser-only development cannot own a native child process.
  }
  throw new LocalAIRuntimeError(
    "desktop_runtime_required",
    "El inicio automático de llama-server requiere ejecutar H.I.S. mediante Tauri.",
  );
}

export function ensureLocalAIServer(): Promise<LocalAIRuntimeSnapshot> {
  if (startupPromise) return startupPromise;
  state = "starting";
  startupPromise = (isDesktopRuntime()
    ? invoke<LocalAIRuntimeSnapshot>("ensure_local_ai_server", { config: LOCAL_AI_CONFIG.runtime })
    : requireExternalServerInBrowser()
  ).then((snapshot) => {
    state = snapshot.state;
    return snapshot;
  }).catch((error: unknown) => {
    state = "error";
    throw asRuntimeError(error);
  }).finally(() => {
    startupPromise = null;
  });
  return startupPromise;
}
