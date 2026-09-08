import type { NodeRendererProps } from "../rendering";
import { TaskNodeView } from "./view";
export const TaskNodeRenderer = ({ node, host }: NodeRendererProps) => <TaskNodeView node={node} nodes={host.data.nodes} deletedNodes={host.data.deletedNodes} timeFormat={host.data.timeFormat} setExpanded={host.tree.setExpanded} onMutate={host.mutations.mutateNodes} onOpen={host.navigation.selectNode} onRename={host.mutations.renameNode} onImport={(file) => Promise.resolve(host.files.importFile(file, null))} onDelete={host.mutations.deleteNode} />;
