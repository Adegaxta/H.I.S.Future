import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import type {
  BaseNodeType,
  CreatingState,
  DropPosition,
  DropTarget,
  NodeItem,
  RenderNodeType,
} from "../types/nodes";
import { NODE_REGISTRY, getNodeDefinition, getNodeDisplayLabel } from "../defs/nodeTypes";
import { getChildren, getEffectiveNodeType, opensNodeViewOnClick } from "../utils/nodeTree";
import { useLocale } from "../i18n/LocaleContext";
import { findImportableFile, isImportableDragItem } from "../project/fileNodeImporter";
import { NodeIcon } from "./SidebarIcon";
import { useSearchReveal } from "../hooks/useSearchReveal";
import { useEffect, useRef } from "react";
import { getLoreNodes, selectLoreRange } from "../utils/loreTree";

interface SidebarTreeProps {
  selectedLoreIds: string[];
  setSelectedLoreIds: (ids: string[]) => void;
  nodes: NodeItem[];
  selectedId: string | null;
  contextMenuNodeId?: string | null;
  expanded: Record<string, boolean>;
  creating: CreatingState | null;
  setCreating: (creating: CreatingState | null) => void;
  draftName: string;
  draftType: BaseNodeType;
  editingId: string | null;
  editingName: string;
  dropTarget: DropTarget | null;
  setExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setDraftName: (name: string) => void;
  setDraftType: (type: BaseNodeType) => void;
  setEditingName: (name: string) => void;
  setEditingId: (id: string | null) => void;
  setSelectedId: (id: string) => void;
  openCreate: (parentId: string | null, initialType?: BaseNodeType) => void;
  confirmCreate: () => void;
  confirmRename: () => void;
  startRename: (node: NodeItem) => void;
  setContextMenu: (menu: {
    x: number;
    y: number;
    nodeId: string | null;
    extended?: boolean;
  }) => void;
  setDropTarget: (target: DropTarget | null) => void;
  setDragPreviewPosition: (position: { x: number; y: number }) => void;
  setDragPreviewId: (id: string | null) => void;
  setIsDraggingNode: (value: boolean) => void;
  handleDrop: (targetId: string | null, position?: DropPosition) => void;
  resetDrag: () => void;
  dropTargetRef: React.MutableRefObject<DropTarget | null>;
  draggedId: React.MutableRefObject<string | null>;
  draggedIds: React.MutableRefObject<string[]>;
  pointerStart: React.MutableRefObject<{ x: number; y: number }>;
  pointerDragging: React.MutableRefObject<boolean>;
  isPointerDown: React.MutableRefObject<boolean>;
  suppressClick: React.MutableRefObject<boolean>;
  queueEditorNodeDrop: (nodeId: string, x: number, y: number) => void;
  onFileDrop: (file: File, parentId: string | null) => void;
  query?: string;
}

export default function SidebarTree(props: SidebarTreeProps) {
  const { t, locale } = useLocale();
  const {
    nodes: projectNodes,
    selectedId,
    contextMenuNodeId,
    expanded,
    creating,
    draftName,
    draftType,
    editingId,
    editingName,
    dropTarget,
  } = props;
  const nodes = getLoreNodes(projectNodes);
  const selectionAnchor = useRef<string | null>(null);
  useEffect(() => {
    if (!props.selectedLoreIds.length) {
      selectionAnchor.current = null;
      return;
    }
    if (!selectionAnchor.current || !props.selectedLoreIds.includes(selectionAnchor.current)) {
      selectionAnchor.current = props.selectedLoreIds[props.selectedLoreIds.length - 1];
    }
  }, [props.selectedLoreIds]);
  const normalizedQuery = (props.query ?? "").trim().toLocaleLowerCase(locale);
  const matches = (node: NodeItem) => node.name.toLocaleLowerCase(locale).includes(normalizedQuery);
  const searchRef = useSearchReveal(normalizedQuery, nodes.filter(matches).map((node) => node.id).join(","));
  const visibleIds = new Set<string>();
  if (normalizedQuery) {
    nodes.forEach((node) => {
      if (!matches(node)) return;
      let current: NodeItem | undefined = node;
      while (current) {
        visibleIds.add(current.id);
        current = current.parentId ? nodes.find((candidate) => candidate.id === current?.parentId) : undefined;
      }
    });
  }
  const childrenOf = (id: string) => getChildren(nodes, id);
  const displayedIds: string[] = [];
  const visit = (parentId: string | null) => getChildren(nodes, parentId).forEach((node) => {
    displayedIds.push(node.id);
    if (expanded[node.id] || (normalizedQuery && visibleIds.has(node.id))) visit(node.id);
  });
  visit(null);
  const selectLoreNode = (node: NodeItem, event: ReactMouseEvent) => {
    const additive = event.ctrlKey || event.metaKey;
    props.setSelectedLoreIds(selectLoreRange(displayedIds, props.selectedLoreIds, selectionAnchor.current, node.id, additive, event.shiftKey));
    if (!event.shiftKey) selectionAnchor.current = node.id;
    if (additive || event.shiftKey) return;
    props.setCreating(null);
    const type = getEffectiveNodeType(projectNodes, node);
    if (getNodeDefinition(type).canContainChildren || type === "pagina-carpeta") {
      props.setExpanded((current) => ({ ...current, [node.id]: !current[node.id] }));
    }
    if (opensNodeViewOnClick(node)) props.setSelectedId(node.id);
  };
  const cancelMultiSelection = () => {
    if (props.selectedLoreIds.length <= 1) return;
    const keepId = selectedId && props.selectedLoreIds.includes(selectedId)
      ? selectedId
      : props.selectedLoreIds[0];
    props.setSelectedLoreIds(keepId ? [keepId] : []);
    selectionAnchor.current = keepId ?? null;
  };
  useEffect(() => {
    const collapseSelectionOutsideTree = (event: PointerEvent) => {
      if (props.selectedLoreIds.length <= 1) return;
      const target = event.target;
      if (target instanceof Element && target.closest(".lore-tree, .his-context-menu")) return;
      cancelMultiSelection();
    };
    document.addEventListener("pointerdown", collapseSelectionOutsideTree);
    return () => document.removeEventListener("pointerdown", collapseSelectionOutsideTree);
  }, [props.selectedLoreIds, selectedId]);

  const renderCreateForm = () => (
    <div className="lore-create-form"
      onClick={(event) => event.stopPropagation()}
    >
      <input
        autoFocus
        value={draftName}
        onChange={(event) => props.setDraftName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") props.confirmCreate();
          if (event.key === "Escape") props.setCreating(null);
        }}
        placeholder={t("sidebar.nodeName")}
      />
      <div className="lore-create-form__actions">
        {NODE_REGISTRY.availableForCreation().map(({ type }) => (
          <button
            key={type}
            onClick={() => props.setDraftType(type)}
            className={draftType === type ? "is-active" : ""}
            style={{ "--node-color": getNodeDefinition(type).color } as CSSProperties}
          >
            {getNodeDisplayLabel(type, t)}
          </button>
        ))}
        <button
          onClick={props.confirmCreate}
          className="lore-create-form__confirm"
        >
          {t("sidebar.create")}
        </button>
      </div>
    </div>
  );

  const renderNode = (node: NodeItem, depth: number): React.ReactNode => {
    const children = childrenOf(node.id);
    const type: RenderNodeType = getEffectiveNodeType(projectNodes, node);
    const isFolder =
      getNodeDefinition(type).canContainChildren || type === "pagina-carpeta";
    const canContainChildren =
      isFolder || children.length > 0 || creating?.parentId === node.id;
    const isExpanded = expanded[node.id] || (Boolean(normalizedQuery) && visibleIds.has(node.id));
    const isSelected = contextMenuNodeId === node.id || (props.selectedLoreIds.length || selectionAnchor.current ? props.selectedLoreIds.includes(node.id) : node.id === selectedId);
    const activeDropPosition =
      dropTarget?.id === node.id ? dropTarget.position : null;
    return (
      <div key={node.id} className="lore-branch" style={{ "--node-color": getNodeDefinition(type).color } as CSSProperties}>
        <div
          className={`lore-node ${isSelected ? "is-selected" : ""} ${normalizedQuery && !matches(node) ? "is-search-dimmed" : ""} ${activeDropPosition ? `is-drop-${activeDropPosition}` : ""}`}
          data-search-match={Boolean(normalizedQuery) && matches(node)}
          data-node-id={node.id}
          onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
            if (
              event.button !== 0 ||
              event.ctrlKey || event.metaKey || event.shiftKey ||
              (event.target instanceof Element &&
                event.target.closest("[data-no-drag]"))
            ) {
              return;
            }
            event.currentTarget.setPointerCapture(event.pointerId);
            props.pointerStart.current = { x: event.clientX, y: event.clientY };
            props.pointerDragging.current = false;
            props.suppressClick.current = false;
            props.isPointerDown.current = true;
          }}
          onPointerMove={(event: ReactPointerEvent<HTMLDivElement>) => {
            if (!props.isPointerDown.current) return;
            props.setDragPreviewPosition({
              x: event.clientX,
              y: event.clientY,
            });
            const distance = Math.hypot(
              event.clientX - props.pointerStart.current.x,
              event.clientY - props.pointerStart.current.y,
            );
            if (!props.pointerDragging.current && distance < 6) return;
            if (!props.pointerDragging.current) {
              props.pointerDragging.current = true;
              props.suppressClick.current = true;
              props.draggedId.current = node.id;
              props.draggedIds.current = props.selectedLoreIds.includes(node.id)
                ? [...props.selectedLoreIds]
                : [node.id];
              props.setDragPreviewId(node.id);
              props.setIsDraggingNode(true);
            }
            const target = document
              .elementFromPoint(event.clientX, event.clientY)
              ?.closest<HTMLElement>("[data-node-id]");
            const targetId = target?.dataset.nodeId;
            if (!targetId || targetId === node.id) {
              props.setDropTarget(null);
              return;
            }
            const bounds = target.getBoundingClientRect();
            const relativeY = event.clientY - bounds.top;
            const position: DropPosition =
              relativeY < bounds.height / 3
                ? "before"
                : relativeY > (bounds.height * 2) / 3
                  ? "after"
                  : "inside";
            props.setDropTarget({ id: targetId, position });
          }}
          onPointerUp={(event: ReactPointerEvent<HTMLDivElement>) => {
            props.isPointerDown.current = false;
            if (props.pointerDragging.current) {
              const pointTarget = document.elementFromPoint(
                event.clientX,
                event.clientY,
              );
              const editor = pointTarget?.closest(".editor-content");
              const nodeId = props.draggedId.current;
              if (editor && nodeId) {
                props.queueEditorNodeDrop(nodeId, event.clientX, event.clientY);
              } else if (props.dropTargetRef.current) {
              props.handleDrop(
                  props.dropTargetRef.current.id,
                props.dropTargetRef.current?.position ?? "inside",
              );
              } else {
                props.resetDrag();
              }
            }
          }}
          onClick={(event: ReactMouseEvent) => {
            if (props.suppressClick.current) {
              props.suppressClick.current = false;
              event.stopPropagation();
              return;
            }
            event.stopPropagation();
            selectLoreNode(node, event);
          }}
          onDoubleClick={(event: ReactMouseEvent) => {
            const target = event.target;
            if (target instanceof Element && target.closest(".lore-node__name, .lore-node__add")) return;
            event.preventDefault();
            event.stopPropagation();
            props.setCreating(null);
            props.setSelectedLoreIds([node.id]);
            selectionAnchor.current = node.id;
            if (opensNodeViewOnClick(node)) props.setSelectedId(node.id);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            props.setContextMenu({
              x: event.clientX,
              y: event.clientY,
              nodeId: node.id,
              extended: event.shiftKey,
            });
          }}
        >
          <NodeIcon type={type} className={isFolder && isExpanded ? "is-open" : ""} />
          <span
            onClick={(event) => {
              event.stopPropagation();
              selectLoreNode(node, event);
            }}
            onDoubleClick={(event) => {
              event.stopPropagation();
              cancelMultiSelection();
              props.startRename(node);
            }}
            className="lore-node__name"
            title={editingId === node.id ? undefined : node.name}
          >
            {editingId === node.id ? (
              <input
                data-no-drag="true"
                autoFocus
                value={editingName}
                onChange={(event) => props.setEditingName(event.target.value)}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") props.confirmRename();
                  if (event.key === "Escape") props.setEditingId(null);
                }}
                onBlur={props.confirmRename}
                style={{
                  width: "100%",
                  padding: 0,
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  color: "inherit",
                  font: "inherit",
                  userSelect: "text",
                }}
              />
            ) : (
              node.name
            )}
          </span>
          <span
            data-no-drag="true"
            onClick={(event) => {
              event.stopPropagation();
              cancelMultiSelection();
              props.openCreate(node.id);
              props.setExpanded((current) => ({ ...current, [node.id]: true }));
            }}
            className="lore-node__add"
            title={t("sidebar.addNode")}
          >
            +
          </span>
        </div>
        {canContainChildren && isExpanded && (
          <div
            className={`lore-children ${children.length + Number(creating?.parentId === node.id) === 1 ? "lore-children--single" : "lore-children--multiple"}`}
            style={{ "--parent-color": getNodeDefinition(type).color } as CSSProperties}
          >
            {children.map((child) => renderNode(child, depth + 1))}
            {creating?.parentId === node.id && (
              <div className="lore-create-branch">
                {renderCreateForm()}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      ref={searchRef}
      onDragEnter={(event) => {
        const hasImportableItem = Array.from(event.dataTransfer.items).some((item) =>
          isImportableDragItem(item),
        );
        if (hasImportableItem) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }
      }}
      onDragOver={(event) => {
        const hasImportableItem = Array.from(event.dataTransfer.items).some((item) =>
          isImportableDragItem(item),
        );
        const hasInternalNode =
          Boolean(props.draggedId.current) ||
          Array.from(event.dataTransfer.types).some(
            (type) =>
              type === "application/x-hisfuture-node" || type === "text/plain",
          );

        if (hasImportableItem) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          return;
        }

        if ((event.target as Element).closest("[data-node-id]")) return;
        if (!hasInternalNode) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        props.setDropTarget(null);
      }}
      onDrop={(event) => {
        event.preventDefault();
        const file = findImportableFile(event.dataTransfer);

        if (file) {
          const target = (event.target as Element).closest<HTMLElement>("[data-node-id]");
          const targetId = target?.dataset.nodeId;
          const targetNode = targetId ? nodes.find((node) => node.id === targetId) : null;
          const targetType = targetNode
            ? getEffectiveNodeType(nodes, targetNode)
            : null;
          const canContain = targetType
            ? getNodeDefinition(targetType).canContainChildren || targetType === "pagina-carpeta"
            : false;
          props.onFileDrop(file, canContain ? targetId || null : targetNode?.parentId || null);
          return;
        }
        if ((event.target as Element).closest("[data-node-id]")) return;
        const nodeId = event.dataTransfer.getData(
          "application/x-hisfuture-node",
        ) || event.dataTransfer.getData("text/plain") || props.draggedId.current;
        if (nodeId) {
          props.draggedId.current = nodeId;
          props.resetDrag();
        }
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        props.setContextMenu({
          x: event.clientX,
          y: event.clientY,
          nodeId: null,
        });
      }}
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest("[data-node-id], .lore-create-form")) return;
        cancelMultiSelection();
      }}
      className="lore-tree"
    >
      {nodes.length === 0 && !creating ? (
        <div
          className="node-panels__empty"
        >
          {t("sidebar.emptyLore")}
        </div>
      ) : (
        <>
          {getChildren(nodes, null).map((node) => renderNode(node, 0))}
          {creating?.parentId === null && renderCreateForm()}
        </>
      )}
    </div>
  );
}
