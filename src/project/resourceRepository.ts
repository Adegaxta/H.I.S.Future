import { invoke } from "@tauri-apps/api/core";
import { asErrorMessage } from "./runtime";
import type { ProjectResourceKind } from "./resourceRegistry";
import {
  deleteBrowserDevResource,
  isBrowserDevProjectActive,
  readBrowserDevResource,
  storeBrowserDevResource,
} from "./browserDevBackend";

export type { ProjectResourceKind } from "./resourceRegistry";

export async function storeProjectResource(
  kind: ProjectResourceKind,
  resourceId: string,
  data: Uint8Array,
): Promise<void> {
  if (isBrowserDevProjectActive()) {
    storeBrowserDevResource(kind, resourceId, data);
    return;
  }
  try {
    await invoke("store_project_resource", {
      kind,
      resourceId,
      data: Array.from(data),
    });
  } catch (error) {
    throw new Error(asErrorMessage(error));
  }
}

export async function readProjectResource(
  kind: ProjectResourceKind,
  resourceId: string,
): Promise<Uint8Array> {
  if (isBrowserDevProjectActive()) return readBrowserDevResource(kind, resourceId);
  try {
    const response = await invoke<ArrayBuffer | Uint8Array>("read_project_resource", { kind, resourceId });
    return response instanceof Uint8Array ? response : new Uint8Array(response);
  } catch (error) {
    throw new Error(asErrorMessage(error));
  }
}

export async function deleteProjectResource(
  kind: ProjectResourceKind,
  resourceId: string,
): Promise<void> {
  if (isBrowserDevProjectActive()) {
    deleteBrowserDevResource(kind, resourceId);
    return;
  }
  try {
    await invoke("delete_project_resource", { kind, resourceId });
  } catch (error) {
    throw new Error(asErrorMessage(error));
  }
}
