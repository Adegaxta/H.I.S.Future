import type { NodeRendererProps } from "../rendering";
import CalendarNodeView from "./view";
import { createTempoNode, moveTempoNode } from "./operations";

export function CalendarNodeRenderer({ node, host, embedded = false }: NodeRendererProps & { embedded?: boolean }) {
  const operationsHost = { nodes: host.data.nodes, createNode: host.mutations.createNode, selectNode: host.navigation.selectNode, setExpanded: host.tree.setExpanded, updateContent: host.mutations.updateContent };
  return <CalendarNodeView key={node.id} node={node} nodes={host.data.nodes} deletedNodes={host.data.deletedNodes} timeFormat={host.data.timeFormat}
    onContentChange={host.mutations.updateContent}
    onCreateTempo={(date, startTime, subtype, endDate, weeklyVisualOrder) => createTempoNode(operationsHost, node.id, date, startTime, subtype, endDate, weeklyVisualOrder)}
    onMoveTempo={(id, meta) => moveTempoNode(operationsHost, id, meta)} onRenameTempo={host.mutations.renameNode} onDeleteTempo={host.mutations.deleteNode}
    setExpanded={host.tree.setExpanded} onOpenDeletedNode={host.navigation.openDeletedNode} onOpenNodeView={host.navigation.openNodeView}
    onFileImport={(file, parentId) => host.files.importFile(file, parentId ?? node.id)} onSlashCommand={host.editor.runSlashCommand}
    onRegisterNavigation={host.navigation.registerWithinView} showTypeLabel={!embedded} />;
}
