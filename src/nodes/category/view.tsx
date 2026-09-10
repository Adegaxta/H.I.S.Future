import type { CSSProperties } from "react";
import type { ContextMenuState, NodeItem } from "../../types/nodes";
import { getNodeDefinition, getNodeDisplayLabel } from "../../defs/nodeTypes";
import { getChildren, getEffectiveNodeType, opensNodeViewOnClick } from "../../utils/nodeTree";
import { useLocale } from "../../i18n/LocaleContext";
import { NodeIcon } from "../NodeIcon";
import NodeTypeLabel from "../../components/NodeTypeLabel";

export default function FolderNodeView({ node, nodes, onSelect, onContextMenu }: { node: NodeItem; nodes: NodeItem[]; onSelect: (id: string) => void; onContextMenu: (menu: ContextMenuState) => void }) {
  const { t } = useLocale();
  const children = getChildren(nodes, node.id);
  return (
    <section className="folder-node-view">
      <NodeTypeLabel type="categoria" node={node} />
      <h1 className="editor-page__title">{node.name}</h1>
      <h2>{t("folder.children")}</h2>
      {children.length === 0 ? <p>{t("folder.empty")}</p> : (
        <ul className="folder-node-view__children">
          {children.map((child) => {
            const type = getEffectiveNodeType(nodes, child);
            return <li key={child.id}>
              <button type="button" onClick={() => { if (opensNodeViewOnClick(child)) onSelect(child.id); }} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); onContextMenu({ context: "folder", nodeId: child.id, x: event.clientX, y: event.clientY, extended: event.shiftKey }); }} style={{ "--node-color": getNodeDefinition(type).color } as CSSProperties}>
                <NodeIcon type={type} />
                <span><strong>{child.name}</strong><small>{getNodeDisplayLabel(type, t)}</small></span>
              </button>
            </li>;
          })}
        </ul>
      )}
    </section>
  );
}
