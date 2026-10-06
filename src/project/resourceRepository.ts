import { invoke } from "@tauri-apps/api/core";
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

export async function storeProjectResource(
  kind: ProjectResourceKind,
  resourceId: string,
  data: Uint8Array,
  extension?: string,
): Promise<StoredProjectResource> {
  if (isBrowserDevProjectActive()) {
    const normalized = (extension ?? (kind === "pdf" ? "pdf" : "png")).toLowerCase().replace(/^(jpeg|jfif)$/, "jpg");
    storeBrowserDevResource(kind, resourceId, data, normalized);
    return { extension: normalized, mimeType: kind === "pdf" ? "application/pdf" : IMAGE_MIME_BY_EXTENSION[normalized] ?? "image/png" };
  }
  try {
    return await invoke<StoredProjectResource>("store_project_resource", {
      kind,
      resourceId,
      data: Array.from(data),
      extension,
    });
  } catch (error) {
    throw new Error(asErrorMessage(error));
  }
}

export async function readProjectResource(
  kind: ProjectResourceKind,
  resourceId: string,
  extension?: string,
): Promise<Uint8Array> {
  if (isBrowserDevProjectActive()) return readBrowserDevResource(kind, resourceId, extension);
  try {
    const response = await invoke<ArrayBuffer | Uint8Array>("read_project_resource", { kind, resourceId, extension });
    return response instanceof Uint8Array ? response : new Uint8Array(response);
  } catch (error) {
    throw new Error(asErrorMessage(error));
  }
}

export async function deleteProjectResource(
  kind: ProjectResourceKind,
  resourceId: string,
  extension?: string,
): Promise<void> {
  if (isBrowserDevProjectActive()) {
    deleteBrowserDevResource(kind, resourceId, extension);
    return;
  }
  try {
    await invoke("delete_project_resource", { kind, resourceId, extension });
  } catch (error) {
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
