import { useDebouncedPersistence } from "./useDebouncedPersistence";
import { useEffect, useRef, useState } from "react";
import { listNodes, saveNodes } from "../project/nodeRepository";
import { getNodeDefinition } from "../defs/nodeTypes";
import type { BaseNodeType, NodeItem } from "../types/nodes";
import { setLoreMembership } from "../utils/loreTree";
import {
  collectDescendantIds,
  getChildren,
  reorderNodes,
  sanitizeParentIds,
  sortNodesForPersistence,
  wouldCreateCycle,
} from "../utils/nodeTree";

const MAX_TRASH_STORAGE_BYTES = 900_000;

const safePersistTrash = (key: string, value: NodeItem[]) => {
  try {
    const serialized = JSON.stringify(value);
    const size = new Blob([serialized]).size;
    if (size > MAX_TRASH_STORAGE_BYTES) {
      console.warn(
        `[trash] Se descarta la persistencia de la papelera: ${(size / 1024 / 1024).toFixed(1)} MB excede el límite seguro.`,
      );
      localStorage.removeItem(key);
      return;
    }

    localStorage.setItem(key, serialized);
  } catch (error) {
    console.warn("[trash] No se pudo guardar la papelera en localStorage.", error);
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignorado.
    }
  }
};

export function useNodeStore(projectKey?: string) {
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
  const changeVersionRef = useRef(0);
  const persistedVersionRef = useRef(0);
  const pendingSaveRef = useRef<{ nodes: NodeItem[]; version: number } | null>(null);
  const saveQueueRef = useRef<Promise<void> | null>(null);

  nodesRef.current = nodes;

  const enqueueSave = (snapshot: NodeItem[], version: number) => {
    pendingSaveRef.current = { nodes: snapshot, version };
    if (saveQueueRef.current) return saveQueueRef.current;
    const save = (async () => {
      while (pendingSaveRef.current) {
        const next = pendingSaveRef.current;
        pendingSaveRef.current = null;
        const toSave = sortNodesForPersistence(sanitizeParentIds(next.nodes));
        await saveNodes(toSave);
        console.log(
          `%c[guardado] ${new Date().toLocaleTimeString()} — ${toSave.length} nodos persistidos`,
          "color: #4dd8c0; font-weight: bold;",
        );
        persistedVersionRef.current = next.version;
      }
    })();
    saveQueueRef.current = save.finally(() => {
      saveQueueRef.current = null;
    });
    return saveQueueRef.current;
  };

  const markDirty = () => {
    changeVersionRef.current += 1;
  };

  const markRecent = (nodeId: string) => {
    setRecentActivity((current) => ({ ...current, [nodeId]: Date.now() }));
  };

  useEffect(() => {
    if (!recentKey) return;
    localStorage.setItem(recentKey, JSON.stringify(recentActivity));
  }, [recentActivity, recentKey]);

  useEffect(() => {
    if (selectedId) markRecent(selectedId);
  }, [selectedId]);

  useEffect(() => {
    if (!trashKey) return;
    safePersistTrash(trashKey, deletedNodes);
  }, [deletedNodes, trashKey]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const stored = await listNodes();
        if (cancelled) return;
        persistedVersionRef.current = changeVersionRef.current;
        setNodes(stored);
        setHydrated(true);
      } catch (error) {
        console.error(error);
        if (!cancelled) {
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

    const isDirty =
    hydrated && !loadFailed && persistedVersionRef.current !== changeVersionRef.current;

  const persistence = useDebouncedPersistence(
    nodes,
    isDirty,
    () => {
      void enqueueSave(nodesRef.current, changeVersionRef.current).catch((error) =>
        console.error(error),
      );
    },
    { debounceMs: 500, maxWaitMs: 4000 },
  );

    const saveNow = (snapshot = nodesRef.current) => {
    if (loadFailed) {
      return Promise.reject(
        new Error("No se puede guardar: no se pudo cargar el proyecto."),
      );
    }
    persistence.cancelPending();
    if (persistedVersionRef.current === changeVersionRef.current) {
      return Promise.resolve();
    }
    return enqueueSave(snapshot, changeVersionRef.current);
  };

  const mutateNodes = (update: (current: NodeItem[]) => NodeItem[]) => {
    setNodes((current) => {
      const next = update(current);
      if (next !== current) markDirty();
      return next;
    });
  };
  const selectedNode = nodes.find((node) => node.id === selectedId);
  const recentNodes = nodes
    .filter((node) => Boolean(recentActivity[node.id]))
    .sort((a, b) => recentActivity[b.id] - recentActivity[a.id]);
  const selectNode = (id: string | null) => setSelectedId(id);
  const updateContent = (nodeId: string, content: string) => {
    setNodes((current) => {
      const node = current.find((item) => item.id === nodeId);
      if (!node || node.content === content) return current;
      markDirty();
      markRecent(nodeId);
      return current.map((item) =>
        item.id === nodeId ? { ...item, content } : item,
      );
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
      markRecent(id);
      markDirty();
      return [
        ...current,
        {
          id,
          name: name.trim(),
          type,
          parentId,
          order: getChildren(current, parentId).length,
          content,
        },
      ];
    });
    if (parentId) setExpanded((current) => ({ ...current, [parentId]: true }));
    if (selectCreated && (type === "pagina" || type === "curso" || type === "tarea" || type === "video")) setSelectedId(id);
    return id;
  };
  const renameNode = (id: string, name: string) =>
    setNodes((current) => {
      const nextName = name.trim();
      const node = current.find((item) => item.id === id);
      if (!node || node.name === nextName) return current;
      markDirty();
      markRecent(id);
      return current.map((item) =>
        item.id === id ? { ...item, name: nextName } : item,
      );
    });
  const deleteNode = (id: string) => {
    setNodes((current) => {
      const ids = collectDescendantIds(current, id);
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
      return current.filter((node) => !ids.has(node.id));
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
    const ids = new Set(selectedDeletedIds);
    if (!ids.size) return;
    const restoring = deletedNodes.filter((node) => ids.has(node.id));
    if (!restoring.length) return;
    markDirty();
    setNodes((current) => [
      ...current,
      ...restoring.filter((node) => !current.some((item) => item.id === node.id)),
    ]);
    setDeletedNodes((current) => current.filter((node) => !ids.has(node.id)));
    setSelectedDeletedIds([]);
    setDeletedSelectionAnchorId(null);
  };
  const permanentlyDeleteNodes = () => {
    const ids = new Set(selectedDeletedIds);
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
      if (changed) markRecent(draggedId);
      if (changed) markDirty();
      return next;
    });
    if (targetId && position === "inside")
      setExpanded((current) => ({ ...current, [targetId]: true }));
  };

  return {
    nodes,
    hydrated,
    setNodes,
    selectedId,
    setSelectedId,
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
    removeFromLore: (ids: string[]) => changeLoreMembership(ids, false),
    addToLore: (ids: string[]) => changeLoreMembership(ids, true),
    deletedNodes,
    selectedDeletedIds,
    setSelectedDeletedIds,
    selectDeletedNode,
    restoreDeletedNodes,
    permanentlyDeleteNodes,
    moveNode,
    saveNow,
  };
}
