import type { NodeRendererProps } from "../rendering";
import PageNodeHeader from "./header";
import RichTextEditor from "../../components/RichTextEditor";
import { getPageBlockWidthPercent, getPageMeta } from "../../utils/pageMeta";

export function PageNodeRenderer({ node, host }: NodeRendererProps) {
  const pageMeta = getPageMeta(node.content);
  const margin = pageMeta.textPosition === "right" ? { marginLeft: "auto", marginRight: 0 } : pageMeta.textPosition === "left" ? { marginLeft: 0, marginRight: "auto" } : { marginLeft: "auto", marginRight: "auto" };
  return <><PageNodeHeader node={node} nodes={host.data.nodes} onContentChange={host.mutations.updateContent} onRename={host.mutations.renameNode} onImageFileUpload={async (file) => (await host.files.importFile(file, node.parentId))?.id ?? null} /><RichTextEditor node={node} nodes={host.data.nodes} deletedNodes={host.data.deletedNodes} editorRef={host.editor.ref} onContentChange={host.mutations.updateContent} setSelectedId={host.navigation.selectNode} setExpanded={host.tree.setExpanded} pendingNodeDrop={host.editor.pendingNodeDrop} onNodeDropHandled={host.editor.clearPendingNodeDrop} onOpenDeletedNode={host.navigation.openDeletedNode} onOpenNodeView={host.navigation.openNodeView} onFileImport={host.files.importFile} onCreatePastedNode={host.editor.createPastedNode} onSlashCommand={host.editor.runSlashCommand} className="page-node-editor" style={{ width: `${getPageBlockWidthPercent(pageMeta)}%`, ...margin }} /></>;
}
