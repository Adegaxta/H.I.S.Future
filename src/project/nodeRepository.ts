import { invoke } from "@tauri-apps/api/core";
import { createDiagnosticEvent, emitDiagnosticEvent } from "../diagnostics/events";
import type { BaseNodeType } from "../types/nodes";
import type { NodeItem } from "../types/nodes";
import { asErrorMessage, isDesktopRuntime } from "./runtime";
import type { PersistedNode } from "./types";
import { getProjectSetting } from "./settingsRepository";
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

function emitPersistenceEvent(
  level: "INFO" | "ERROR",
  action: string,
  message: string,
  detail: Record<string, unknown>,
  operation: string,
  relatedNodeIds?: string[],
) {
  const operationId = getActiveCloseProjectTraceId();
  emitDiagnosticEvent(createDiagnosticEvent({
    level,
    category: "DATABASE",
    action,
    operation,
    ...(operationId ? { operationId } : {}),
    ...(relatedNodeIds?.length ? { relatedNodeIds } : {}),
    message,
    technicalDetail: JSON.stringify(detail),
  }));
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
      const hidden = new Set<string>(JSON.parse(hiddenSetting || "[]"));
      return rows.map((row) => ({ ...toNodeItem(row), loreHidden: hidden.has(row.id) }));
    }
    const [rows, hiddenSetting] = await measureLifecyclePhase("project.load-nodes", () => Promise.all([
      invoke<PersistedNode[]>("list_nodes", { defaultNodeType }), getProjectSetting("loreHiddenIds"),
    ]));
    const hidden = new Set<string>(JSON.parse(hiddenSetting || "[]"));
    return rows.map((row) => ({ ...toNodeItem(row), loreHidden: hidden.has(row.id) }));
  } catch (error) {
    throw new Error(asErrorMessage(error));
  }
}

export async function loadWorkspaceSnapshot(defaultNodeType: BaseNodeType = "pagina"): Promise<LoadedWorkspaceSnapshot> {
  const started = performance.now();
  try {
    let result: LoadedWorkspaceSnapshot;
    if (!isDesktopRuntime()) {
      const [nodes, deletedNodes] = await Promise.all([listNodes(defaultNodeType), loadDeletedNodes()]);
      result = { nodes, deletedNodes };
    } else {
      const snapshot = await measureLifecyclePhase("project.load-workspace", () =>
        invoke<PersistedWorkspaceSnapshot>("load_workspace_snapshot", { defaultNodeType }),
      );
      const hidden = new Set<string>(JSON.parse(snapshot.loreHiddenIds || "[]"));
      const nodes = snapshot.nodes.map((row) => ({ ...toNodeItem(row), loreHidden: hidden.has(row.id) }));
      const parsedDeleted: unknown = snapshot.deletedNodes === null ? null : JSON.parse(snapshot.deletedNodes);
      const deletedNodes = parsedDeleted === null
        ? null
        : Array.isArray(parsedDeleted) && parsedDeleted.every((node) => node && typeof node.id === "string" && typeof node.content === "string")
          ? parsedDeleted as NodeItem[]
          : (() => { throw new Error("La papelera guardada no tiene un formato válido."); })();
      result = { nodes, deletedNodes };
    }
    emitPersistenceEvent("INFO", "workspace.loaded", "Workspace loaded", {
      nodeCount: result.nodes.length,
      deletedNodeCount: result.deletedNodes?.length ?? null,
      durationMs: Number((performance.now() - started).toFixed(2)),
      runtime: isDesktopRuntime() ? "tauri" : "browser",
    }, "workspace.load");
    return result;
  } catch (error) {
    emitPersistenceEvent("ERROR", "workspace.load.failed", "Workspace could not be loaded", {
      error: asErrorMessage(error),
      durationMs: Number((performance.now() - started).toFixed(2)),
    }, "workspace.load");
    throw new Error(asErrorMessage(error));
  }
}

export async function saveNodes(nodes: NodeItem[], deletedNodes: NodeItem[], nodeTags?: [string, string[]]): Promise<void> {
  try {
    const serializeStarted = performance.now();
    const payload = {
      nodes: nodes.map(toRecord),
      hiddenIds: nodes.filter((node) => node.loreHidden).map((node) => node.id),
      deletedNodes: JSON.stringify(deletedNodes),
      nodeTags,
      traceId: getActiveCloseProjectTraceId(),
    };
    const serializeMs = Number((performance.now() - serializeStarted).toFixed(2));
    if (isBrowserDevProjectActive()) {
      await measureLifecyclePhase("persistence.backend-roundtrip", async () => {
        saveBrowserDevWorkspace(payload.nodes, payload.hiddenIds, payload.deletedNodes, nodeTags);
      });
      emitPersistenceEvent("INFO", "workspace.checkpoint.saved", "Workspace saved", {
        nodeCount: nodes.length,
        deletedNodeCount: deletedNodes.length,
        serializeMs,
        runtime: "browser",
      }, "workspace.save");
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
    emitPersistenceEvent("INFO", "workspace.checkpoint.saved", "Workspace saved", {
      nodeCount: nodes.length,
      deletedNodeCount: deletedNodes.length,
      changedRows: timings.changedRows,
      serializeMs,
      resourceScanMs: timings.resourceScanMs,
      sqliteMs: timings.sqliteMs,
      resourceCleanupMs: timings.resourceCleanupMs,
      totalMs: timings.totalMs,
      runtime: "tauri",
    }, "workspace.save");
  } catch (error) {
    emitPersistenceEvent("ERROR", "workspace.checkpoint.failed", "Workspace save failed", {
      error: asErrorMessage(error),
    }, "workspace.save");
    throw new Error(asErrorMessage(error));
  }
}

export async function saveNodeContents(changes: NodeContentChange[]): Promise<void> {
  if (!changes.length) return;
  try {
    const serializeStarted = performance.now();
    const payload = { changes, traceId: getActiveCloseProjectTraceId() };
    const serializeMs = Number((performance.now() - serializeStarted).toFixed(2));
    if (isBrowserDevProjectActive()) {
      await measureLifecyclePhase("persistence.incremental.backend-roundtrip", async () => {
        saveBrowserDevNodeContents(changes);
      });
      emitPersistenceEvent("INFO", "workspace.incremental.saved", "Node content saved", {
        changedNodeCount: changes.length,
        serializeMs,
        runtime: "browser",
      }, "workspace.save", changes.map(({ id }) => id));
      return;
    }
    const timings = await measureActiveCloseProjectPhase("backend incremental persistence", () =>
      measureLifecyclePhase("persistence.incremental.backend-roundtrip", () =>
        invoke<SaveWorkspaceTimings>("save_node_contents", payload),
      ),
    );
    emitPersistenceEvent("INFO", "workspace.incremental.saved", "Node content saved", {
      changedNodeCount: changes.length,
      changedRows: timings.changedRows,
      serializeMs,
      sqliteMs: timings.sqliteMs,
      totalMs: timings.totalMs,
      runtime: "tauri",
    }, "workspace.save", changes.map(({ id }) => id));
  } catch (error) {
    emitPersistenceEvent("ERROR", "workspace.incremental.failed", "Node content save failed", {
      error: asErrorMessage(error),
      changedNodeCount: changes.length,
    }, "workspace.save", changes.map(({ id }) => id));
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
