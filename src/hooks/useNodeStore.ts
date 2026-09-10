import { useLocale } from "../i18n/LocaleContext";
import { courseAwareDeletionIds, hasMissingCourseCalendar, reconcileCourseCalendars, synchronizedNodeIds } from "../nodes/course/domain";
import { applyNodeRename } from "../nodes/runtime";
import { isVaultPrimaryNode, reconcileVaultPrimary } from "../nodes/project/domain";
import { useDebouncedPersistence } from "./useDebouncedPersistence";
import { useEffect, useRef, useState } from "react";
import { listNodes, saveNodes, loadDeletedNodes } from "../project/nodeRepository";
import { getNodeDefinition, hasNodeCapability } from "../defs/nodeTypes";
import type { BaseNodeType, NodeItem } from "../types/nodes";
import { setLoreMembership } from "../utils/loreTree";
import {
  changedNodeIds,
  recordRecentActivity,
  type RecentActivityKind,
} from "../utils/recentActivity";
import {
  getChildren,
  reorderMultipleNodes,
  reorderNodes,
  sanitizeParentIds,
  sortNodesForPersistence,
  wouldCreateCycle,
} from "../utils/nodeTree";
import { PersistenceQueue } from "../lifecycle/PersistenceQueue";
import { measureActiveCloseProjectPhase } from "../lifecycle/metrics";

interface NodePersistenceRequest {
  nodes: NodeItem[];
  deletedNodes: NodeItem[];
  version: number;
}

export function useNodeStore(projectKey?: string, projectName = "") {
  const { t } = useLocale();
  const trashKey = projectKey ? `hisfuture.project.trash.${projectKey}` : null;
  const recentKey = projectKey ? `hisfuture.project.recent-nodes.${projectKey}` : null;
  const [nodes, setNodes] = useState<NodeItem[]>([]);
  const [deletedNodes, setDeletedNodes] = useState<NodeItem[]>(() => {
    if (!trashKey) return [];
    try {
      const stored = JSON.parse(localStorage.getItem(trashKey) || "[]") as NodeItem[];
      return [...new Map(stored.map((node) => [node.id, node])).values()];
    } catch {
      return [];
    }
  });
  const [selectedDeletedIds, setSelectedDeletedIds] = useState<string[]>([]);
  const [deletedSelectionAnchorId, setDeletedSelectionAnchorId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [recentActivity, setRecentActivity] = useState<Record<string, number>>(() => {
    if (!recentKey) return {};
    try {
      return JSON.parse(localStorage.getItem(recentKey) || "{}") as Record<string, number>;
    } catch {
      return {};
    }
  });
  const [hydrated, setHydrated] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const nodesRef = useRef(nodes);
  const deletedNodesRef = useRef(deletedNodes);
  deletedNodesRef.current = deletedNodes;
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const changeVersionRef = useRef(0);
  const persistedVersionRef = useRef(0);
  const enqueuedVersionRef = useRef(0);
  const persistenceQueueRef = useRef<PersistenceQueue<NodePersistenceRequest> | null>(null);
  if (!persistenceQueueRef.current) {
    persistenceQueueRef.current = new PersistenceQueue(async (request) => {
      const toSave = sortNodesForPersistence(sanitizeParentIds(request.nodes));
      await saveNodes(toSave, request.deletedNodes);
      setPersistenceError(null);
      console.log(
        `%c[guardado] ${new Date().toLocaleTimeString()} — ${toSave.length} nodos persistidos`,
        "color: #4dd8c0; font-weight: bold;",
      );
      persistedVersionRef.current = Math.max(persistedVersionRef.current, request.version);
    });
  }

  nodesRef.current = nodes;

  const enqueueSave = (snapshot: NodeItem[], version: number) => {
    enqueuedVersionRef.current = Math.max(enqueuedVersionRef.current, version);
    return persistenceQueueRef.current!.enqueue({
      nodes: snapshot,
      deletedNodes: deletedNodesRef.current,
      version,
    });
  };

  const markDirty = () => {
    changeVersionRef.current += 1;
  };

  const markRecent = (nodeId: string, kind: RecentActivityKind) => {
    setRecentActivity((current) => recordRecentActivity(current, nodeId, kind));
  };

  useEffect(() => {
    if (!recentKey) return;
    localStorage.setItem(recentKey, JSON.stringify(recentActivity));
  }, [recentActivity, recentKey]);

  // Navigation does not modify activity; mutation handlers below own recent timestamps.

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [stored, trash] = await Promise.all([listNodes(), loadDeletedNodes()]);
        if (cancelled) return;
        persistedVersionRef.current = changeVersionRef.current;
        const previousTrash = trash ?? deletedNodesRef.current.filter((node) => !stored.some((active) => active.id === node.id));
        const repaired = reconcileCourseCalendars(stored, previousTrash, t("nodes.calendar.label"));
        const reconciledNodes = reconcileVaultPrimary(repaired.nodes, projectName);
        setNodes(reconciledNodes);
        setDeletedNodes(repaired.deletedNodes);
        deletedNodesRef.current = repaired.deletedNodes;
        if (trash === null || reconciledNodes !== stored || repaired.deletedNodes !== previousTrash) markDirty();
        setHydrated(true);
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setPersistenceError(String(error));
          setLoadFailed(true);
          setHydrated(true);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Safety net for already-open projects and state changes outside normal mutations.
  // Use the latest state in the updater so repeated effects cannot allocate duplicates.
  useEffect(() => {
    if (!hydrated || loadFailed || !hasMissingCourseCalendar(nodes)) return;
    setNodes((current) => {
      if (!hasMissingCourseCalendar(current)) return current;
      const repaired = reconcileCourseCalendars(current, deletedNodesRef.current, t("nodes.calendar.label"));
      if (repaired.deletedNodes !== deletedNodesRef.current) {
        deletedNodesRef.current = repaired.deletedNodes;
        setDeletedNodes(repaired.deletedNodes);
      }
      if (repaired.nodes !== current) markDirty();
      return repaired.nodes;
    });
  }, [hydrated, loadFailed, nodes, deletedNodes, t]);

  const isDirty =
    hydrated && !loadFailed && persistedVersionRef.current !== changeVersionRef.current;

  const persistence = useDebouncedPersistence(
    [nodes, deletedNodes],
    isDirty,
    () => {
      void enqueueSave(nodesRef.current, changeVersionRef.current).catch((error) =>
        setPersistenceError(String(error)),
      );
    },
    { debounceMs: 500, maxWaitMs: 4000 },
  );

  const saveNow = (snapshot = nodesRef.current) => {
    if (!hydrated || loadFailed) {
      return Promise.reject(
        new Error("No se puede guardar: no se pudo cargar el proyecto."),
      );
    }
    persistence.cancelPending();
    if (snapshot !== nodesRef.current) {
      nodesRef.current = snapshot;
      setNodes(snapshot);
      markDirty();
    }
    if (persistedVersionRef.current === changeVersionRef.current) {
      return measureActiveCloseProjectPhase("PersistenceQueue.flush", () =>
        persistenceQueueRef.current!.flush(),
      );
    }
    if (
      persistenceQueueRef.current!.hasPendingWrites()
      && enqueuedVersionRef.current >= changeVersionRef.current
    ) {
      return measureActiveCloseProjectPhase("PersistenceQueue.flush", () =>
        persistenceQueueRef.current!.flush(),
      );
    }
    return measureActiveCloseProjectPhase("PersistenceQueue.flush", () =>
      enqueueSave(snapshot, changeVersionRef.current),
    );
  };

  const reconcile = (next: NodeItem[]) => {
    const repaired = reconcileCourseCalendars(next, deletedNodesRef.current, t("nodes.calendar.label"));
    if (repaired.deletedNodes !== deletedNodesRef.current) {
      deletedNodesRef.current = repaired.deletedNodes;
      setDeletedNodes(repaired.deletedNodes);
    }
    return reconcileVaultPrimary(repaired.nodes, projectName);
  };
  const mutateNodes = (update: (current: NodeItem[]) => NodeItem[]) => {
    setNodes((current) => {
      const next = reconcile(update(current));
      if (next !== current) {
        markDirty();
        const changedIds = changedNodeIds(current, next);
        if (changedIds.length) {
          const timestamp = Date.now();
          setRecentActivity((activity) => changedIds.reduce(
            (result, id) => recordRecentActivity(result, id, "edit", timestamp),
            activity,
          ));
        }
      }
      return next;
    });
  };
  const selectedNode = nodes.find((node) => node.id === selectedId);
  const recentNodes = nodes
    .filter((node) => Boolean(recentActivity[node.id]) && hasNodeCapability(node.type, "openOnPrimaryAction"))
    .sort((a, b) => recentActivity[b.id] - recentActivity[a.id]);
  const selectNode = (id: string | null) => {
    setSelectedId(id);
    if (id) markRecent(id, "navigate");
  };
  const updateContent = (nodeId: string, content: string) => {
    setNodes((current) => {
      const node = current.find((item) => item.id === nodeId);
      if (!node || node.content === content) return current;
      markDirty();
      markRecent(nodeId, "edit");
      return reconcile(current.map((item) =>
        item.id === nodeId ? { ...item, content } : item,
      ));
    });
  };
  const createNode = (
    name: string,
    type: BaseNodeType,
    parentId: string | null,
    content = getNodeDefinition(type).defaultContent,
    selectCreated = true,
  ) => {
    const id = crypto.randomUUID();
    setNodes((current) => {
      markRecent(id, "create");
      markDirty();
      return reconcile([
        ...current,
        {
          id,
          name: name.trim(),
          type,
          parentId,
          order: getChildren(current, parentId).length,
          content,
        },
      ]);
    });
    if (parentId) setExpanded((current) => ({ ...current, [parentId]: true }));
    if (selectCreated && getNodeDefinition(type).creation.selectAfterCreation) setSelectedId(id);
    return id;
  };
  const renameNode = (id: string, name: string) =>
    setNodes((current) => {
      const nextName = name.trim();
      const node = current.find((item) => item.id === id);
      if (!node || node.name === nextName) return current;
      markDirty();
      markRecent(id, "rename");
      return reconcile(current.map((item) =>
        item.id === id ? applyNodeRename(item, nextName) : item,
      ));
    });
  const deleteNode = (id: string) => {
    setNodes((current) => {
      const target = current.find((node) => node.id === id);
      if (target && isVaultPrimaryNode(target)) return current;
      const ids = courseAwareDeletionIds(current, [id]);
      for (const node of current) if (ids.has(node.id) && isVaultPrimaryNode(node)) ids.delete(node.id);
      const removed = current.filter((node) => ids.has(node.id));
      if (!removed.length) return current;
      markDirty();
      setDeletedNodes((deleted) => {
        const next = new Map(deleted.map((node) => [node.id, node]));
        removed.forEach((node) => next.set(node.id, node));
        return [...next.values()];
      });
      setSelectedId((selected) =>
        selected && !ids.has(selected) ? selected : null,
      );
      return current.filter((node) => !ids.has(node.id)).map((node) => node.parentId && ids.has(node.parentId) ? { ...node, parentId: null } : node);
    });
  };
  const changeLoreMembership = (ids: string[], visible: boolean) => {
    setNodes((current) => {
      const next = setLoreMembership(current, ids, visible);
      if (next.some((node, index) => Boolean(node.loreHidden) !== Boolean(current[index].loreHidden))) markDirty();
      return next;
    });
  };
  const restoreDeletedNodes = () => {
    const ids = synchronizedNodeIds(deletedNodes, selectedDeletedIds);
    if (!ids.size) return;
    const restoring = deletedNodes.filter((node) => ids.has(node.id));
    if (!restoring.length) return;
    markDirty();
    setNodes((current) => reconcile([
      ...current,
      ...restoring.filter((node) => !current.some((item) => item.id === node.id)),
    ]));
    setDeletedNodes((current) => current.filter((node) => !ids.has(node.id)));
    setSelectedDeletedIds([]);
    setDeletedSelectionAnchorId(null);
  };
  const permanentlyDeleteNodes = () => {
    const ids = synchronizedNodeIds(deletedNodes, selectedDeletedIds);
    for (const node of deletedNodes) if (ids.has(node.id) && isVaultPrimaryNode(node)) ids.delete(node.id);
    if (!ids.size) return;
    markDirty();
    setDeletedNodes((current) => current.filter((node) => !ids.has(node.id)));
    setSelectedDeletedIds([]);
    setDeletedSelectionAnchorId(null);
  };
  const selectDeletedNode = (
    id: string,
    options: { ctrlKey?: boolean; shiftKey?: boolean } = {},
  ) => {
    const index = deletedNodes.findIndex((node) => node.id === id);
    if (index < 0) return;
    const anchorIndex = deletedSelectionAnchorId
      ? deletedNodes.findIndex((node) => node.id === deletedSelectionAnchorId)
      : -1;
    if (options.shiftKey && anchorIndex >= 0) {
      const start = Math.min(anchorIndex, index);
      const end = Math.max(anchorIndex, index);
      setSelectedDeletedIds(deletedNodes.slice(start, end + 1).map((node) => node.id));
      return;
    }
    if (options.ctrlKey) {
      setSelectedDeletedIds((current) =>
        current.includes(id)
          ? current.filter((selectedId) => selectedId !== id)
          : [...current, id],
      );
    } else {
      setSelectedDeletedIds([id]);
    }
    setDeletedSelectionAnchorId(id);
  };
  const moveNode = (
    draggedId: string,
    targetId: string | null,
    position: "before" | "inside" | "after",
  ) => {
    setNodes((current) => {
      if (targetId && wouldCreateCycle(current, draggedId, targetId)) {
        return current;
      }
      const next = reorderNodes(current, draggedId, targetId, position);
      const changed = next.some(
        (node, index) =>
          node.parentId !== current[index].parentId ||
          node.order !== current[index].order,
      );
      if (changed) markRecent(draggedId, "move");
      if (changed) markDirty();
      return next;
    });
    if (targetId && position === "inside")
      setExpanded((current) => ({ ...current, [targetId]: true }));
  };
  const moveNodes = (
    draggedIds: string[],
    targetId: string | null,
    position: "before" | "inside" | "after",
  ) => {
    setNodes((current) => {
      const next = reorderMultipleNodes(current, draggedIds, targetId, position);
      const movedIds = draggedIds.filter((id) => {
        const before = current.find((node) => node.id === id);
        const after = next.find((node) => node.id === id);
        return before && after && (before.parentId !== after.parentId || before.order !== after.order);
      });
      if (movedIds.length) {
        movedIds.forEach((id) => markRecent(id, "move"));
        markDirty();
      }
      return next;
    });
    if (targetId && position === "inside")
      setExpanded((current) => ({ ...current, [targetId]: true }));
  };

  return {
    nodes,
    persistenceError,
    hydrated,
    setNodes,
    selectedId,
    setSelectedId: selectNode,
    selectedNode,
    recentNodes,
    recentActivity,
    expanded,
    setExpanded,
    selectNode,
    updateContent,
    mutateNodes,
    createNode,
    renameNode,
    deleteNode,
    canDeleteNode: (id: string) => {
      const node = nodes.find((item) => item.id === id);
      return Boolean(node && !isVaultPrimaryNode(node) && courseAwareDeletionIds(nodes, [id]).has(id));
    },
    removeFromLore: (ids: string[]) => changeLoreMembership(ids, false),
    addToLore: (ids: string[]) => changeLoreMembership(ids, true),
    deletedNodes,
    selectedDeletedIds,
    setSelectedDeletedIds,
    selectDeletedNode,
    restoreDeletedNodes,
    permanentlyDeleteNodes,
    moveNode,
    moveNodes,
    saveNow,
  };
}
