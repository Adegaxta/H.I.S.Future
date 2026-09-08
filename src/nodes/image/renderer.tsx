import type { NodeRendererProps } from "../rendering";
import ImageNodeView from "./view";
export const ImageNodeRenderer = ({ node, host }: NodeRendererProps) => <ImageNodeView node={node} onContentChange={host.projectImage.updateContent} onRename={host.mutations.renameNode} onDelete={host.mutations.deleteNode} onUseAsProjectCover={host.projectImage.useAsCover} />;
