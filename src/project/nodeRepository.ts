import { invoke } from "@tauri-apps/api/core";
import type { BaseNodeType } from "../types/nodes";
import type { NodeItem } from "../types/nodes";
import { asErrorMessage, isDesktopRuntime } from "./runtime";
import type { PersistedNode } from "./types";
import { getProjectSetting } from "./settingsRepository";
import { normalizeLoreHiddenIds } from "../utils/loreTree";
import {
  getActiveCloseProjectTraceId,
  measureActiveCloseProjectPhase,
  measureLifecyclePhase,
  recordCloseProjectPhase,
} from "../lifecycle/metrics";
import {
  isBrowserDevProjectActive,
  listBrowserDevNodes,
  saveBrowserDevNodeContents,
  saveBrowserDevWorkspace,
} from "./browserDevBackend";

interface SaveWorkspaceTimings {
  resourceScanMs: number;
  sqliteMs: number;
  resourceCleanupMs: number;
  totalMs: number;
  changedRows: number;
}

export interface NodeContentChange {
  id: string;
  content: string;
}

interface PersistedWorkspaceSnapshot {
  nodes: PersistedNode[];
  loreHiddenIds: string | null;
  deletedNodes: string | null;
}

export interface LoadedWorkspaceSnapshot {
  nodes: NodeItem[];
  deletedNodes: NodeItem[] | null;
}

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

export async function listNodes(defaultNodeType: BaseNodeType = "pagina"): Promise<NodeItem[]> {
  try {
    if (isBrowserDevProjectActive()) {
      const [rows, hiddenSetting] = await measureLifecyclePhase("project.load-nodes", async () => [
        listBrowserDevNodes(), await getProjectSetting("loreHiddenIds"),
      ] as const);
      const hidden = normalizeLoreHiddenIds(rows, new Set<string>(JSON.parse(hiddenSetting || "[]")));
      return rows.map((row) => ({ ...toNodeItem(row), loreHidden: hidden.has(row.id) }));
    }
    const [rows, hiddenSetting] = await measureLifecyclePhase("project.load-nodes", () => Promise.all([
      invoke<PersistedNode[]>("list_nodes", { defaultNodeType }), getProjectSetting("loreHiddenIds"),
    ]));
    const hidden = normalizeLoreHiddenIds(rows, new Set<string>(JSON.parse(hiddenSetting || "[]")));
    return rows.map((row) => ({ ...toNodeItem(row), loreHidden: hidden.has(row.id) }));
  } catch (error) {
    throw new Error(asErrorMessage(error));
  }
}

export async function loadWorkspaceSnapshot(defaultNodeType: BaseNodeType = "pagina"): Promise<LoadedWorkspaceSnapshot> {
  if (!isDesktopRuntime()) {
    const [nodes, deletedNodes] = await Promise.all([listNodes(defaultNodeType), loadDeletedNodes()]);
    return { nodes, deletedNodes };
  }
  try {
    const snapshot = await measureLifecyclePhase("project.load-workspace", () =>
      invoke<PersistedWorkspaceSnapshot>("load_workspace_snapshot", { defaultNodeType }),
    );
    const hidden = normalizeLoreHiddenIds(snapshot.nodes, new Set<string>(JSON.parse(snapshot.loreHiddenIds || "[]")));
    const nodes = snapshot.nodes.map((row) => ({ ...toNodeItem(row), loreHidden: hidden.has(row.id) }));
    const parsedDeleted: unknown = snapshot.deletedNodes === null ? null : JSON.parse(snapshot.deletedNodes);
    const deletedNodes = parsedDeleted === null
      ? null
      : Array.isArray(parsedDeleted) && parsedDeleted.every((node) => node && typeof node.id === "string" && typeof node.content === "string")
        ? parsedDeleted as NodeItem[]
        : (() => { throw new Error("La papelera guardada no tiene un formato válido."); })();
    return { nodes, deletedNodes };
  } catch (error) {
    throw new Error(asErrorMessage(error));
  }
}

export async function saveNodes(nodes: NodeItem[], deletedNodes: NodeItem[]): Promise<void> {
  try {
    const serializeStarted = performance.now();
    const payload = {
      nodes: nodes.map(toRecord),
      hiddenIds: nodes.filter((node) => node.loreHidden).map((node) => node.id),
      deletedNodes: JSON.stringify(deletedNodes),
      traceId: getActiveCloseProjectTraceId(),
    };
    console.info(`[lifecycle] persistence.serialize: ${(performance.now() - serializeStarted).toFixed(1)} ms`);
    if (isBrowserDevProjectActive()) {
      await measureLifecyclePhase("persistence.backend-roundtrip", async () => {
        saveBrowserDevWorkspace(payload.nodes, payload.hiddenIds, payload.deletedNodes);
      });
      return;
    }
    const traceId = getActiveCloseProjectTraceId();
    const timings = await measureActiveCloseProjectPhase("backend persistence", () =>
      measureLifecyclePhase("persistence.backend-roundtrip", () =>
        invoke<SaveWorkspaceTimings>("save_nodes", payload),
      ),
    );
    recordCloseProjectPhase(traceId, "SQLite save", timings.sqliteMs);
    recordCloseProjectPhase(traceId, "resource cleanup", timings.resourceCleanupMs);
  } catch (error) {
    throw new Error(asErrorMessage(error));
  }
}

export async function saveNodeContents(changes: NodeContentChange[]): Promise<void> {
  if (!changes.length) return;
  try {
    const serializeStarted = performance.now();
    const payload = { changes, traceId: getActiveCloseProjectTraceId() };
    console.info(`[lifecycle] persistence.incremental.serialize: ${(performance.now() - serializeStarted).toFixed(1)} ms`);
    if (isBrowserDevProjectActive()) {
      await measureLifecyclePhase("persistence.incremental.backend-roundtrip", async () => {
        saveBrowserDevNodeContents(changes);
      });
      return;
    }
    await measureActiveCloseProjectPhase("backend incremental persistence", () =>
      measureLifecyclePhase("persistence.incremental.backend-roundtrip", () =>
        invoke<SaveWorkspaceTimings>("save_node_contents", payload),
      ),
    );
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
