import type { AIModelDescriptor } from "./types";

const baseUrl = "http://127.0.0.1:8080";
const modelPath = "local_ai/models/gemma-3-1b-it-Q4_K_M.gguf";

export const LOCAL_AI_CONFIG = {
  baseUrl,
  chatEndpoint: `${baseUrl}/v1/chat/completions`,
  requestModel: modelPath,
  runtime: {
    baseUrl,
    executablePath: "local_ai/runtime/llama/llama-server.exe",
    modelPath,
    startupTimeoutMs: 120_000,
    pollingIntervalMs: 400,
  },
  model: {
    family: "gemma-3",
    size: "1B",
    quantization: "Q4_K_M",
    variant: "it",
  } satisfies AIModelDescriptor,
} as const;
