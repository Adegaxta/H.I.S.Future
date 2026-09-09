import type { MouseEvent } from "react";
import { getNodeDefinition, getNodeDisplayLabel } from "../../defs/nodeTypes";
import { useLocale } from "../../i18n/LocaleContext";
import type { NodeItem } from "../../types/nodes";
import { getImageResourceInfo } from "../../utils/imageResource";

export type TrashViewMode = "gallery" | "list";

interface TrashPanelProps {
  nodes: NodeItem[];
  selectedIds: string[];
  view: TrashViewMode;
  onViewChange: (view: TrashViewMode) => void;
  onOpenNode: (id: string) => void;
  onSelectNode: (id: string, options?: { ctrlKey?: boolean; shiftKey?: boolean }) => void;
  onOpenNodeMenu: (nodeId: string, position: { x: number; y: number }) => void;
  onOpenActionsMenu: (position: { x: number; y: number }) => void;
  onRestoreSelected: () => void;
  onDeleteSelected: () => void;
}

function TrashNodePreview({ node }: { node: NodeItem }) {
  const { t } = useLocale();
  const parsed = new DOMParser().parseFromString(node.content, "text/html");
  const resource = node.type === "imagen" ? getImageResourceInfo(node.content, node.name) : null;
  const imageSource = resource?.src || parsed.querySelector("img")?.getAttribute("src");
  if (imageSource) return <img src={imageSource} alt="" loading="lazy" decoding="async" />;
  const text = parsed.body.textContent?.replace(/\s+/g, " ").trim().slice(0, 180);
  return <span>{text || t("workspace.noPreview")}</span>;
}

export function TrashPanel({
  nodes,
  selectedIds,
  view,
  onViewChange,
  onOpenNode,
  onSelectNode,
  onOpenNodeMenu,
  onOpenActionsMenu,
  onRestoreSelected,
  onDeleteSelected,
}: TrashPanelProps) {
  const { t } = useLocale();
  const hasSelection = selectedIds.length > 0;

  const selectOrOpen = (event: MouseEvent, node: NodeItem) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      onSelectNode(node.id, { ctrlKey: event.ctrlKey || event.metaKey, shiftKey: event.shiftKey });
      return;
    }
    onOpenNode(node.id);
  };

  const openMenu = (event: MouseEvent, node: NodeItem) => {
    event.preventDefault();
    if (!selectedIds.includes(node.id)) onSelectNode(node.id);
    onOpenNodeMenu(node.id, { x: event.clientX, y: event.clientY });
  };

  return <section className="trash-view">
    <div className="trash-view__header">
      <div>
        <div className="project-settings__eyebrow">{t("trash.heading")}</div>
        <h1>{t("trash.deletedNodes")}</h1>
      </div>
      <div className="trash-view__header-right">
        <div className="trash-view__view-toggle" role="group" aria-label={t("trash.view")}>
          <button type="button" className={view === "gallery" ? "is-active" : ""} onClick={() => onViewChange("gallery")}>{t("trash.gallery")}</button>
          <button type="button" className={view === "list" ? "is-active" : ""} onClick={() => onViewChange("list")}>{t("trash.list")}</button>
        </div>
        <div className="trash-view__actions">
          <button
            type="button"
            className="trash-view__more"
            title={t("trash.selectedActions")}
            aria-label={t("trash.selectedActions")}
            onClick={(event) => {
              const bounds = event.currentTarget.getBoundingClientRect();
              onOpenActionsMenu({ x: bounds.right, y: bounds.bottom + 6 });
            }}
          ><span aria-hidden="true">...</span></button>
          <button type="button" title={t("trash.restoreSelected")} disabled={!hasSelection} onClick={onRestoreSelected}>
            <span className="trash-view__action-icon" aria-hidden="true">↶</span>
          </button>
          <button type="button" title={t("trash.deletePermanently")} disabled={!hasSelection} onClick={onDeleteSelected}>
            <span className="trash-view__action-icon" aria-hidden="true">×</span>
          </button>
        </div>
      </div>
    </div>

    {nodes.length === 0 ? <div className="trash-view__empty">{t("trash.empty")}</div> : view === "list" ? (
      <div className="trash-view__list">
        {nodes.map((node) => <div
          key={node.id}
          className={`trash-view__item ${selectedIds.includes(node.id) ? "is-selected" : ""}`}
          onClick={(event) => selectOrOpen(event, node)}
          onContextMenu={(event) => openMenu(event, node)}
        >
          <input
            type="checkbox"
            checked={selectedIds.includes(node.id)}
            onClick={(event) => event.stopPropagation()}
            onChange={() => onSelectNode(node.id, { ctrlKey: true })}
          />
          <button type="button" title={node.name} onClick={(event) => { event.stopPropagation(); selectOrOpen(event, node); }}>
            <span className="trash-view__type-dot" style={{ backgroundColor: getNodeDefinition(node.type).color }} />
            {node.name}
          </button>
          <small>{getNodeDisplayLabel(node.type, t)}</small>
        </div>)}
      </div>
    ) : (
      <div className="trash-view__gallery">
        {nodes.map((node) => <article
          key={node.id}
          className={`trash-view__card ${selectedIds.includes(node.id) ? "is-selected" : ""}`}
          onClick={(event) => selectOrOpen(event, node)}
          onContextMenu={(event) => openMenu(event, node)}
        >
          <div className="trash-view__preview">
            <TrashNodePreview node={node} />
            <small>{getNodeDisplayLabel(node.type, t)}</small>
          </div>
          <div className="trash-view__card-meta">
            <span className="trash-view__card-name" title={node.name}>{node.name}</span>
          </div>
        </article>)}
      </div>
    )}
  </section>;
}
