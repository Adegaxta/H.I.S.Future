import { invoke } from "@tauri-apps/api/core";
import type { NodeItem } from "../types/nodes";
import { asErrorMessage } from "./runtime";
import type { PersistedNode } from "./types";
import { getProjectSetting } from "./settingsRepository";

function toNodeItem(record: PersistedNode): NodeItem {
  return {
    id: record.id,
    name: record.name,
    type: record.type,
    parentId: record.parentId,
    order: record.order,
    content: record.content,
  };
}

function toRecord(node: NodeItem): PersistedNode {
  return {
    id: node.id,
    name: node.name,
    type: node.type,
    parentId: node.parentId,
    order: node.order,
    content: node.content,
  };
}

export async function listNodes(): Promise<NodeItem[]> {
  try {
    const [rows, hiddenSetting] = await Promise.all([
      invoke<PersistedNode[]>("list_nodes"), getProjectSetting("loreHiddenIds"),
    ]);
    const hidden = new Set<string>(JSON.parse(hiddenSetting || "[]"));
    return rows.map((row) => ({ ...toNodeItem(row), loreHidden: hidden.has(row.id) }));
  } catch (error) {
    throw new Error(asErrorMessage(error));
  }
}

export async function saveNodes(nodes: NodeItem[], deletedNodes: NodeItem[]): Promise<void> {
  try {
    await invoke("save_nodes", {
      nodes: nodes.map(toRecord),
      hiddenIds: nodes.filter((node) => node.loreHidden).map((node) => node.id),
      deletedNodes: JSON.stringify(deletedNodes),
    });
  } catch (error) {
    throw new Error(asErrorMessage(error));
  }
}

export async function loadDeletedNodes(): Promise<NodeItem[] | null> {
  const value = await getProjectSetting("deletedNodes");
  if (value === null) return null;
  const nodes: unknown = JSON.parse(value);
  if (!Array.isArray(nodes) || nodes.some((node) => !node || typeof node.id !== "string" || typeof node.content !== "string")) {
    throw new Error("La papelera del proyecto no es válida.");
  }
  return nodes as NodeItem[];
}
