import type { ReactNode } from "react";
import RichTextEditor from "../../editor/RichTextEditor";
import type { NodeRendererProps } from "../rendering";
import { getNodalMeta } from "../metadata";

export function RichTextNodeContent({ node, host, mode = "interactive", className, style, beforeContent }: NodeRendererProps & { className?: string; style?: React.CSSProperties; beforeContent?: ReactNode }) {
  return <RichTextEditor node={node} nodes={host.data.nodes} deletedNodes={host.data.deletedNodes} editorRef={host.editor.ref} onContentChange={host.mutations.updateContent} setSelectedId={host.navigation.selectNode} setExpanded={host.tree.setExpanded} pendingNodeDrop={host.editor.pendingNodeDrop} onNodeDropHandled={host.editor.clearPendingNodeDrop} onOpenDeletedNode={host.navigation.openDeletedNode} onOpenNodeView={host.navigation.openNodeView} onFileImport={host.files.importFile} onCreatePastedNode={host.editor.createPastedNode} onSlashCommand={host.editor.runSlashCommand} readOnly={mode === "print" || getNodalMeta(node.content).protected} mode={mode} className={className} style={style ?? {}} beforeContent={beforeContent} />;
}
