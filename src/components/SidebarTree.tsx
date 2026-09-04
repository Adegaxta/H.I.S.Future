import type {
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
import { getChildren, getEffectiveNodeType } from "../utils/nodeTree";
import { useLocale } from "../i18n/LocaleContext";
import { findImportableFile, isImportableDragItem } from "../project/fileNodeImporter";

interface SidebarTreeProps {
  nodes: NodeItem[];
  selectedId: string | null;
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
  openCreate: (parentId: string | null) => void;
  confirmCreate: () => void;
  confirmRename: () => void;
  startRename: (node: NodeItem) => void;
  setContextMenu: (menu: {
    x: number;
    y: number;
    nodeId: string | null;
  }) => void;
  setDropTarget: (target: DropTarget | null) => void;
  setDragPreviewPosition: (position: { x: number; y: number }) => void;
  setDragPreviewId: (id: string | null) => void;
  setIsDraggingNode: (value: boolean) => void;
  handleDrop: (targetId: string | null, position?: DropPosition) => void;
  resetDrag: () => void;
  dropTargetRef: React.MutableRefObject<DropTarget | null>;
  draggedId: React.MutableRefObject<string | null>;
  pointerStart: React.MutableRefObject<{ x: number; y: number }>;
  pointerDragging: React.MutableRefObject<boolean>;
  isPointerDown: React.MutableRefObject<boolean>;
  suppressClick: React.MutableRefObject<boolean>;
  queueEditorNodeDrop: (nodeId: string, x: number, y: number) => void;
  onFileDrop: (file: File, parentId: string | null) => void;
}

export default function SidebarTree(props: SidebarTreeProps) {
  const { t } = useLocale();
  const {
    nodes,
    selectedId,
    expanded,
    creating,
    draftName,
    draftType,
    editingId,
    editingName,
    dropTarget,
  } = props;
  const childrenOf = (id: string) => getChildren(nodes, id);

  const renderCreateForm = () => (
    <div
      style={{
        padding: "8px",
        margin: "4px 0",
        background: "#1A1D21",
        border: "1px solid #2A2E33",
        borderRadius: "4px",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
      }}
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
        placeholder="Nombre del nodo..."
        style={{
          background: "#121417",
          border: "1px solid #2A2E33",
          borderRadius: "3px",
          padding: "6px 8px",
          fontSize: "12px",
          color: "#E8E9EA",
          outline: "none",
        }}
      />
      <div style={{ display: "flex", gap: "4px" }}>
        {NODE_REGISTRY.availableForCreation().map(({ type }) => (
          <button
            key={type}
            onClick={() => props.setDraftType(type)}
            style={{
              fontFamily: 'ui-monospace, "SF Mono", "Cascadia Code", monospace',
              fontSize: "9px",
              letterSpacing: "0.08em",
              padding: "5px 8px",
              borderRadius: "3px",
              border: "1px solid",
              borderColor: draftType === type ? getNodeDefinition(type).color : "#2A2E33",
              color: draftType === type ? getNodeDefinition(type).color : "#5A5F66",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            {getNodeDisplayLabel(type, t)}
          </button>
        ))}
        <button
          onClick={props.confirmCreate}
          style={{
            marginLeft: "auto",
            fontFamily: 'ui-monospace, "SF Mono", "Cascadia Code", monospace',
            fontSize: "9px",
            letterSpacing: "0.08em",
            padding: "5px 10px",
            borderRadius: "3px",
            border: "1px solid #4DD8C0",
            color: "#4DD8C0",
            background: "transparent",
            cursor: "pointer",
          }}
        >
          CREAR
        </button>
      </div>
    </div>
  );

  const renderNode = (node: NodeItem, depth: number): React.ReactNode => {
    const children = childrenOf(node.id);
    const type: RenderNodeType = getEffectiveNodeType(nodes, node);
    const isFolder =
      getNodeDefinition(type).canContainChildren || type === "pagina-carpeta";
    const canContainChildren =
      isFolder || children.length > 0 || creating?.parentId === node.id;
    const isExpanded = expanded[node.id];
    const isSelected = node.id === selectedId;
    const activeDropPosition =
      dropTarget?.id === node.id ? dropTarget.position : null;
    return (
      <div key={node.id}>
        <div
          data-node-id={node.id}
          onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
            if (
              event.button !== 0 ||
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
              } else if (pointTarget?.closest("[data-root-drop]")) {
                props.handleDrop(null);
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
            props.setCreating(null);
            if (isFolder) {
              props.setExpanded((current) => ({
                ...current,
                [node.id]: !current[node.id],
              }));
              if (node.type === "calendario") props.setSelectedId(node.id);
            } else props.setSelectedId(node.id);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            props.setContextMenu({
              x: event.clientX,
              y: event.clientY,
              nodeId: node.id,
            });
          }}
          style={{
            display: "grid",
            gridTemplateColumns: "10px 6px minmax(0, 1fr) auto",
            alignItems: "center",
            gap: "6px",
            padding: "6px 8px",
            marginLeft: `${depth * 14}px`,
            userSelect: "none",
            borderRadius: "3px",
            cursor: "pointer",
            background: isSelected
              ? "#1E2226"
              : activeDropPosition === "inside"
                ? "#1A2926"
                : "transparent",
            borderLeft: isSelected
              ? `2px solid ${getNodeDefinition(type).color}`
              : "2px solid transparent",
            outline:
              activeDropPosition === "inside"
                ? `1px dashed ${getNodeDefinition(type).color}`
                : "none",
            borderTop:
              activeDropPosition === "before"
                ? `2px solid ${getNodeDefinition(type).color}`
                : "none",
            borderBottom:
              activeDropPosition === "after"
                ? `2px solid ${getNodeDefinition(type).color}`
                : "none",
          }}
        >
          {isFolder ? (
            <span
              style={{
                fontSize: "9px",
                color: "#5A5F66",
                width: "10px",
                display: "inline-block",
              }}
            >
              {isExpanded ? "▾" : "▸"}
            </span>
          ) : (
            <span style={{ display: "block", width: "10px" }} />
          )}
          <span
            aria-hidden="true"
            style={{
              width: "6px",
              height: "6px",
              flexShrink: 0,
              borderRadius: "50%",
              background: getNodeDefinition(type).color,
            }}
          />
          <span
            data-no-drag="true"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              props.setCreating(null);
              if (isFolder)
                props.setExpanded((current) => ({
                  ...current,
                  [node.id]: !current[node.id],
                }));
              else props.setSelectedId(node.id);
            }}
            onDoubleClick={(event) => {
              event.stopPropagation();
              props.startRename(node);
            }}
            style={{
              fontSize: "13px",
              color: isSelected
                ? "#F2F3F4"
                : type === "categoria"
                  ? "#A7A9AC"
                  : "#C7C9CC",
              display: "inline-block",
              width: "100%",
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
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
              props.openCreate(node.id);
              props.setExpanded((current) => ({ ...current, [node.id]: true }));
            }}
            style={{
              fontFamily: 'ui-monospace, "SF Mono", "Cascadia Code", monospace',
              fontSize: "12px",
              color: "#4A4E54",
              padding: "0 4px",
            }}
            title="Crear nodo dentro"
          >
            +
          </span>
        </div>
        {canContainChildren && isExpanded && (
          <div>
            {children.map((child) => renderNode(child, depth + 1))}
            {creating?.parentId === node.id && (
              <div style={{ marginLeft: `${(depth + 1) * 14}px` }}>
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
      data-root-drop="true"
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
          props.handleDrop(null);
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
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "8px",
        background: "transparent",
      }}
    >
      {nodes.length === 0 && !creating ? (
        <div
          style={{
            padding: "18px 10px",
            fontSize: "12px",
            color: "#5A5F66",
            lineHeight: "1.6",
          }}
        >
          Todavía no hay nada aquí.
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
