import RichTextEditor from "../../editor/RichTextEditor";
import type { NodeRendererProps } from "../rendering";

export function RichTextNodeContent({ node, host, className, style }: NodeRendererProps & { className?: string; style?: React.CSSProperties }) {
  return <RichTextEditor node={node} nodes={host.data.nodes} deletedNodes={host.data.deletedNodes} editorRef={host.editor.ref} onContentChange={host.mutations.updateContent} setSelectedId={host.navigation.selectNode} setExpanded={host.tree.setExpanded} pendingNodeDrop={host.editor.pendingNodeDrop} onNodeDropHandled={host.editor.clearPendingNodeDrop} onOpenDeletedNode={host.navigation.openDeletedNode} onOpenNodeView={host.navigation.openNodeView} onFileImport={host.files.importFile} onCreatePastedNode={host.editor.createPastedNode} onSlashCommand={host.editor.runSlashCommand} className={className} style={style ?? {}} />;
}
