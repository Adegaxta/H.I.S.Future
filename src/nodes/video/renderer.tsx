import type { NodeRendererProps } from "../rendering";
import { VideoNodeView } from "./view";
export const VideoNodeRenderer = ({ node, host }: NodeRendererProps) => <VideoNodeView node={node} nodes={host.data.nodes} onMutate={host.mutations.mutateNodes} onOpen={host.navigation.selectNode} onRename={host.mutations.renameNode} onImport={(file) => Promise.resolve(host.files.importFile(file, null))} onDelete={host.mutations.deleteNode} />;
