import type { NodeItem } from "../../types/nodes";
import type { ReactNode } from "react";
import RichTextEditor from "../../editor/RichTextEditor";
import type { NodeRendererProps } from "../rendering";
import { getNodalMeta } from "../metadata";
import { createImageContent } from "../../utils/imageResource";
import type { UnsplashImageSelection } from "../../integrations/unsplash/types";

export function RichTextNodeContent({ node, host, mode = "interactive", className, style, beforeContent }: NodeRendererProps & { className?: string; style?: React.CSSProperties; beforeContent?: ReactNode }) {
  const onCreateImageFromUnsplash = async (selection: UnsplashImageSelection) => host.mutations.createNode(selection.fileName, "imagen", node.parentId, createImageContent(selection.src, selection.fileName, null, null, selection.description, selection.provenance), false);
  const createMentionNode = (name: string, parentId: string | null): NodeItem => {
    const id = host.mutations.createNode(name, "pagina", parentId, undefined, false);
    return { id, name, type: "pagina", parentId, order: host.data.nodes.filter(n => n.parentId === parentId).length, content: "" };
  };
  return <RichTextEditor node={node} nodes={host.data.nodes} recentNodes={host.data.recentNodes} onCreateMentionNode={host.editor.createMentionNode ?? createMentionNode} deletedNodes={host.data.deletedNodes} editorRef={host.editor.ref} onContentChange={host.mutations.updateContent} setSelectedId={host.navigation.selectNode} setExpanded={host.tree.setExpanded} pendingNodeDrop={host.editor.pendingNodeDrop} onNodeDropHandled={host.editor.clearPendingNodeDrop} onOpenDeletedNode={host.navigation.openDeletedNode} onOpenNodeView={host.navigation.openNodeView} onFileImport={host.files.importFile} onCreateImageFromUnsplash={onCreateImageFromUnsplash} onCreatePastedNode={host.editor.createPastedNode} onSlashCommand={host.editor.runSlashCommand} readOnly={mode === "print" || getNodalMeta(node.content).protected} mode={mode} className={className} style={style ?? {}} beforeContent={beforeContent} />;
}
