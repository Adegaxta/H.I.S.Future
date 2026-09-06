import { useEffect, useRef, useState } from "react";
import type {
  BaseNodeType,
  CreatingState,
  DropPosition,
  DropTarget,
  NodeItem,
} from "../types/nodes";
import { getChildren } from "../utils/nodeTree";
import { useNodeStore } from "./useNodeStore";

export function useTreeController(
  defaultNodeType: BaseNodeType = "pagina",
  projectKey?: string,
) {
  const store = useNodeStore(projectKey);
  const [creating, setCreating] = useState<CreatingState | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftType, setDraftType] = useState<BaseNodeType>("pagina");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [dragPreviewId, setDragPreviewId] = useState<string | null>(null);
  const [dragPreviewPosition, setDragPreviewPosition] = useState({
    x: 0,
    y: 0,
  });
  const [isDraggingNode, setIsDraggingNode] = useState(false);
  const [pendingEditorFocusId, setPendingEditorFocusId] = useState<
    string | null
  >(null);
  const [pendingEditorNodeDrop, setPendingEditorNodeDrop] = useState<{
    nodeId: string;
    x: number;
    y: number;
  } | null>(null);
  const draggedId = useRef<string | null>(null);
  const draggedIds = useRef<string[]>([]);
  const pointerStart = useRef({ x: 0, y: 0 });
  const pointerDragging = useRef(false);
  const isPointerDown = useRef(false);
  const suppressClick = useRef(false);
  const dropTargetRef = useRef<DropTarget | null>(null);

  const updateDropTarget = (target: DropTarget | null) => {
    dropTargetRef.current = target;
    setDropTarget(target);
  };

  const resetDrag = () => {
    const dragged = pointerDragging.current;
    isPointerDown.current = false;
    pointerDragging.current = false;
    draggedId.current = null;
    draggedIds.current = [];
    if (dragged) {
      suppressClick.current = true;
      window.setTimeout(() => {
        suppressClick.current = false;
      }, 0);
    }
    setDragPreviewId(null);
    setIsDraggingNode(false);
    updateDropTarget(null);
  };

  useEffect(() => {
    const finishDrag = () => {
      if (pointerDragging.current) resetDrag();
      isPointerDown.current = false;
    };
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", finishDrag);
    window.addEventListener("blur", finishDrag);
    return () => {
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);
      window.removeEventListener("blur", finishDrag);
    };
  }, []);

  const openCreate = (parentId: string | null, initialType: BaseNodeType = defaultNodeType) => {
    setCreating({ parentId });
    setDraftName("");
    setDraftType(initialType);
    if (parentId !== null)
      store.setExpanded((current) => ({ ...current, [parentId]: true }));
  };

  const confirmCreate = () => {
    if (!draftName.trim() || !creating) return;
    const createdId = store.createNode(draftName, draftType, creating.parentId);
    if (draftType === "pagina" || draftType === "imagen") {
      setPendingEditorFocusId(createdId);
    }
    setCreating(null);
  };

  const startRename = (node: NodeItem) => {
    setEditingId(node.id);
    setEditingName(node.name);
  };

  const confirmRename = () => {
    if (editingId && editingName.trim())
      store.renameNode(editingId, editingName);
    setEditingId(null);
    setEditingName("");
  };

  const deleteNode = (id: string) => store.deleteNode(id);

  const handleDrop = (
    targetId: string | null,
    position: DropPosition = "inside",
  ) => {
    const dragged = draggedIds.current.length
      ? draggedIds.current
      : draggedId.current
        ? [draggedId.current]
        : [];
    if (!dragged.length || dragged.includes(targetId ?? "")) {
      resetDrag();
      return;
    }
    store.moveNodes(dragged, targetId, position);
    resetDrag();
  };

  return {
    ...store,
    creating,
    setCreating,
    draftName,
    setDraftName,
    draftType,
    setDraftType,
    editingId,
    setEditingId,
    editingName,
    setEditingName,
    dropTarget,
    setDropTarget: updateDropTarget,
    dragPreviewId,
    setDragPreviewId,
    dragPreviewPosition,
    setDragPreviewPosition,
    isDraggingNode,
    setIsDraggingNode,
    openCreate,
    confirmCreate,
    startRename,
    confirmRename,
    deleteNode,
    handleDrop,
    resetDrag,
    dropTargetRef,
    draggedId,
    draggedIds,
    pointerStart,
    pointerDragging,
    isPointerDown,
    suppressClick,
    pendingEditorFocusId,
    clearPendingEditorFocus: () => setPendingEditorFocusId(null),
    pendingEditorNodeDrop,
    queueEditorNodeDrop: (nodeId: string, x: number, y: number) =>
      setPendingEditorNodeDrop({ nodeId, x, y }),
    clearPendingEditorNodeDrop: () => setPendingEditorNodeDrop(null),
    childrenOf: (id: string | null) => getChildren(store.nodes, id),
  };
}
