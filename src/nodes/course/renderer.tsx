import type { NodeRendererProps } from "../rendering";
import { CourseNodeView } from "./view";
import { CalendarNodeRenderer } from "../calendar/renderer";

export const CourseNodeRenderer = ({ node, host }: NodeRendererProps) => <CourseNodeView node={node} nodes={host.data.nodes} onMutate={host.mutations.mutateNodes} onOpen={host.navigation.selectNode} onRename={host.mutations.renameNode} onImport={(file) => Promise.resolve(host.files.importFile(file, null))} renderCalendar={(calendar, embedded) => <CalendarNodeRenderer node={calendar} host={host} embedded={embedded} />} />;
