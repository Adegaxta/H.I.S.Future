import { invoke } from "@tauri-apps/api/core";
import { createDiagnosticEvent, emitDiagnosticEvent } from "../diagnostics/events";
import { getActiveCloseProjectTraceId } from "../lifecycle/metrics";
import { asErrorMessage } from "./runtime";
import type { ProjectResourceKind } from "./resourceRegistry";
import {
  deleteBrowserDevResource,
  browserDevResourceExists,
  isBrowserDevProjectActive,
  readBrowserDevResource,
  storeBrowserDevResource,
} from "./browserDevBackend";

export type { ProjectResourceKind } from "./resourceRegistry";

export interface StoredProjectResource {
  extension: string;
  mimeType: string;
}

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", jfif: "image/jpeg",
  webp: "image/webp", gif: "image/gif", svg: "image/svg+xml", bmp: "image/bmp",
  ico: "image/x-icon", avif: "image/avif", heic: "image/heic", heif: "image/heif",
};

function emitResourceEvent(
  level: "DEBUG" | "INFO" | "ERROR",
  action: string,
  message: string,
  detail: Record<string, unknown>,
  operation: string,
) {
  const operationId = getActiveCloseProjectTraceId();
  emitDiagnosticEvent(createDiagnosticEvent({
    level,
    category: "ASSETS",
    action,
    operation,
    ...(operationId ? { operationId } : {}),
    ...(typeof detail.resourceId === "string" ? { resourceId: detail.resourceId } : {}),
    message,
    technicalDetail: JSON.stringify(detail),
  }));
}

export async function storeProjectResource(
  kind: ProjectResourceKind,
  resourceId: string,
  data: Uint8Array,
  extension?: string,
): Promise<StoredProjectResource> {
  const started = performance.now();
  if (isBrowserDevProjectActive()) {
    try {
      const normalized = (extension ?? (kind === "pdf" ? "pdf" : "png")).toLowerCase().replace(/^(jpeg|jfif)$/, "jpg");
      storeBrowserDevResource(kind, resourceId, data, normalized);
      const result = { extension: normalized, mimeType: kind === "pdf" ? "application/pdf" : IMAGE_MIME_BY_EXTENSION[normalized] ?? "image/png" };
      emitResourceEvent("INFO", "resource.stored", "Resource stored", {
        kind, resourceId, extension: result.extension, byteLength: data.byteLength,
        durationMs: Number((performance.now() - started).toFixed(2)), runtime: "browser",
      }, "resource.write");
      return result;
    } catch (error) {
      emitResourceEvent("ERROR", "resource.store.failed", "Resource could not be stored", {
        kind, resourceId, error: asErrorMessage(error),
      }, "resource.write");
      throw error;
    }
  }
  try {
    const result = await invoke<StoredProjectResource>("store_project_resource", {
      kind,
      resourceId,
      data: Array.from(data),
      extension,
    });
    emitResourceEvent("INFO", "resource.stored", "Resource stored", {
      kind, resourceId, extension: result.extension, byteLength: data.byteLength,
      durationMs: Number((performance.now() - started).toFixed(2)), runtime: "tauri",
    }, "resource.write");
    return result;
  } catch (error) {
    emitResourceEvent("ERROR", "resource.store.failed", "Resource could not be stored", {
      kind, resourceId, error: asErrorMessage(error),
    }, "resource.write");
    throw new Error(asErrorMessage(error));
  }
}

export async function readProjectResource(
  kind: ProjectResourceKind,
  resourceId: string,
  extension?: string,
): Promise<Uint8Array> {
  const started = performance.now();
  if (isBrowserDevProjectActive()) {
    try {
      const data = readBrowserDevResource(kind, resourceId, extension);
      emitResourceEvent("DEBUG", "resource.read", "Resource read", {
        kind, resourceId, extension: extension ?? null, byteLength: data.byteLength,
        durationMs: Number((performance.now() - started).toFixed(2)), runtime: "browser",
      }, "resource.read");
      return data;
    } catch (error) {
      emitResourceEvent("ERROR", "resource.read.failed", "Resource could not be read", {
        kind, resourceId, extension: extension ?? null, error: asErrorMessage(error),
      }, "resource.read");
      throw error;
    }
  }
  try {
    const response = await invoke<ArrayBuffer | Uint8Array>("read_project_resource", { kind, resourceId, extension });
    const data = response instanceof Uint8Array ? response : new Uint8Array(response);
    emitResourceEvent("DEBUG", "resource.read", "Resource read", {
      kind, resourceId, extension: extension ?? null, byteLength: data.byteLength,
      durationMs: Number((performance.now() - started).toFixed(2)), runtime: "tauri",
    }, "resource.read");
    return data;
  } catch (error) {
    emitResourceEvent("ERROR", "resource.read.failed", "Resource could not be read", {
      kind, resourceId, extension: extension ?? null, error: asErrorMessage(error),
    }, "resource.read");
    throw new Error(asErrorMessage(error));
  }
}

export async function deleteProjectResource(
  kind: ProjectResourceKind,
  resourceId: string,
  extension?: string,
): Promise<void> {
  if (isBrowserDevProjectActive()) {
    try {
      deleteBrowserDevResource(kind, resourceId, extension);
      emitResourceEvent("INFO", "resource.deleted", "Resource deleted", {
        kind, resourceId, extension: extension ?? null, runtime: "browser",
      }, "resource.delete");
      return;
    } catch (error) {
      emitResourceEvent("ERROR", "resource.delete.failed", "Resource could not be deleted", {
        kind, resourceId, extension: extension ?? null, error: asErrorMessage(error),
      }, "resource.delete");
      throw error;
    }
  }
  try {
    await invoke("delete_project_resource", { kind, resourceId, extension });
    emitResourceEvent("INFO", "resource.deleted", "Resource deleted", {
      kind, resourceId, extension: extension ?? null, runtime: "tauri",
    }, "resource.delete");
  } catch (error) {
    emitResourceEvent("ERROR", "resource.delete.failed", "Resource could not be deleted", {
      kind, resourceId, extension: extension ?? null, error: asErrorMessage(error),
    }, "resource.delete");
    throw new Error(asErrorMessage(error));
  }
}

export async function projectResourceExists(
  kind: ProjectResourceKind,
  resourceId: string,
  extension?: string,
): Promise<boolean> {
  if (isBrowserDevProjectActive()) return browserDevResourceExists(kind, resourceId, extension);
  try {
    return await invoke<boolean>("project_resource_exists", { kind, resourceId, extension });
  } catch (error) {
    throw new Error(asErrorMessage(error));
  }
}
