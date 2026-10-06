import type { NodeRendererProps } from "../rendering";
import PdfNodeView from "./view";
export const PdfNodeRenderer = ({ node, host, mode }: NodeRendererProps) => <PdfNodeView node={node} onContentChange={mode === "print" ? undefined : host.mutations.updateContent} onRename={host.mutations.renameNode} onAttachFile={(id, name, content) => host.mutations.mutateNodes(nodes => nodes.map(item => item.id === id ? { ...item, name, content } : item))} />;
