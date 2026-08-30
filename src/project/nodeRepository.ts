import { invoke } from "@tauri-apps/api/core";
import type { NodeItem } from "../types/nodes";
import { asErrorMessage } from "./runtime";
import type { PersistedNode } from "./types";

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
    const rows = await invoke<PersistedNode[]>("list_nodes");
    return rows.map(toNodeItem);
  } catch (error) {
    throw new Error(asErrorMessage(error));
  }
}

export async function saveNodes(nodes: NodeItem[]): Promise<void> {
  try {
    await invoke("save_nodes", { nodes: nodes.map(toRecord) });
  } catch (error) {
    throw new Error(asErrorMessage(error));
  }
}
