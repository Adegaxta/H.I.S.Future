import { invoke } from "@tauri-apps/api/core";
import { isBrowserDevProjectActive } from "../project/browserDevBackend";
import {
  createBrowserDevTag,
  deleteBrowserDevTag,
  listBrowserDevNodeTags,
  listBrowserDevTags,
  reorderBrowserDevTags,
  setBrowserDevNodeTag,
  updateBrowserDevTag,
} from "../project/browserDevBackend";
import { asErrorMessage } from "../project/runtime";
import type { Tag, TagDraft } from "./types";

export const TAGS_CHANGED_EVENT = "hisfuture:tags-changed";
const notifyTagsChanged = () => window.dispatchEvent(new Event(TAGS_CHANGED_EVENT));

function validateDraft(draft: TagDraft): TagDraft {
  const name = draft.name.trim();
  if (!name || name.length > 80) throw new Error("El nombre del Tag debe tener entre 1 y 80 caracteres.");
  if (!/^#[0-9a-f]{6}$/i.test(draft.color)) throw new Error("El color del Tag no es válido.");
  return { name, color: draft.color.toUpperCase() };
}

export async function listTags(): Promise<Tag[]> {
  try {
    return isBrowserDevProjectActive() ? listBrowserDevTags() : await invoke<Tag[]>("list_tags");
  } catch (error) { throw new Error(asErrorMessage(error)); }
}

export async function getNodeTags(nodeId: string): Promise<Tag[]> {
  try {
    return isBrowserDevProjectActive() ? listBrowserDevNodeTags(nodeId) : await invoke<Tag[]>("list_node_tags", { nodeId });
  } catch (error) { throw new Error(asErrorMessage(error)); }
}

export async function createTag(draft: TagDraft): Promise<Tag> {
  const valid = validateDraft(draft);
  const id = `tag_${crypto.randomUUID()}`;
  try {
    const created = isBrowserDevProjectActive()
      ? createBrowserDevTag({ id, ...valid })
      : await invoke<Tag>("create_tag", { id, ...valid });
    notifyTagsChanged();
    return created;
  } catch (error) { throw new Error(asErrorMessage(error)); }
}

export async function updateTag(id: string, draft: TagDraft): Promise<Tag> {
  const valid = validateDraft(draft);
  try {
    const updated = isBrowserDevProjectActive()
      ? updateBrowserDevTag({ id, ...valid })
      : await invoke<Tag>("update_tag", { id, ...valid });
    notifyTagsChanged();
    return updated;
  } catch (error) { throw new Error(asErrorMessage(error)); }
}

export async function deleteTag(id: string): Promise<void> {
  try {
    if (isBrowserDevProjectActive()) deleteBrowserDevTag(id);
    else await invoke("delete_tag", { id });
    notifyTagsChanged();
  } catch (error) { throw new Error(asErrorMessage(error)); }
}

export async function setNodeTag(nodeId: string, tagId: string, assigned: boolean): Promise<void> {
  try {
    if (isBrowserDevProjectActive()) setBrowserDevNodeTag(nodeId, tagId, assigned);
    else await invoke("set_node_tag", { nodeId, tagId, assigned });
    notifyTagsChanged();
  } catch (error) { throw new Error(asErrorMessage(error)); }
}

export async function reorderTags(ids: string[]): Promise<void> {
  try {
    if (isBrowserDevProjectActive()) reorderBrowserDevTags(ids);
    else await invoke("reorder_tags", { ids });
    notifyTagsChanged();
  } catch (error) { throw new Error(asErrorMessage(error)); }
}
