import RichTextEditor from "../../editor/RichTextEditor";
import { useLocale } from "../../i18n/LocaleContext";
import type { NodeViewHost } from "../../nodes/rendering";
import type { NodeItem } from "../../types/nodes";
import NodeTypeLabel from "../../components/NodeTypeLabel";

export function TrashNodeView({ node, host, onBack }: { node: NodeItem; host: NodeViewHost; onBack: () => void }) {
  const { t } = useLocale();
  return <div className="editor-page editor-page--trash">
    <button type="button" className="trash-node-back" onClick={onBack}>{t("trash.back")}</button>
    <div className="trash-node-warning">{t("trash.readOnly")}</div>
    <NodeTypeLabel type={node.type} node={node} />
    <h1 className="editor-page__title">{node.name}</h1>
    <RichTextEditor
      node={node}
      nodes={host.data.nodes}
      deletedNodes={host.data.deletedNodes}
      editorRef={host.editor.ref}
      onContentChange={host.mutations.updateContent}
      setSelectedId={host.navigation.selectNode}
      setExpanded={host.tree.setExpanded}
      pendingNodeDrop={null}
      onNodeDropHandled={() => undefined}
      onOpenDeletedNode={host.navigation.openDeletedNode}
      onOpenNodeView={host.navigation.openNodeView}
      readOnly
      style={{
        display: "block", width: "100%", minHeight: 0, minWidth: 0, padding: 0, border: "none",
        background: "transparent", color: "#E8E9EA", fontSize: "14px", fontFamily: "inherit",
        lineHeight: "1.6", outline: "none",
      }}
    />
  </div>;
}
