import type { NodeRendererProps } from "../rendering";
import FolderNodeView from "./view";
export const CategoryNodeRenderer = ({ node, host }: NodeRendererProps) => <FolderNodeView onContextMenu={host.contextMenus.openNodeMenu} node={node} nodes={host.data.nodes} onSelect={host.navigation.selectNode} />;
