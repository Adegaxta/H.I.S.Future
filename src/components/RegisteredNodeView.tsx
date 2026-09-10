import type { ReactNode } from "react";
import { getNodeRenderer, type NodeRendererId } from "../defs/nodeTypes";
import type { NodeRendererProps } from "../nodes/rendering";
import { CalendarNodeRenderer } from "../nodes/calendar/renderer";
import { CategoryNodeRenderer } from "../nodes/category/renderer";
import { CourseNodeRenderer } from "../nodes/course/renderer";
import { ImageNodeRenderer } from "../nodes/image/renderer";
import { PageNodeRenderer } from "../nodes/page/renderer";
import { PdfNodeRenderer } from "../nodes/pdf/renderer";
import { ProjectNodeRenderer } from "../nodes/project/renderer";
import { TaskNodeRenderer } from "../nodes/task/renderer";
import { TempoNodeRenderer } from "../nodes/tempo/renderer";
import { VideoNodeRenderer } from "../nodes/video/renderer";

const NODE_RENDERERS: Record<NodeRendererId, (props: NodeRendererProps) => ReactNode> = {
  page: PageNodeRenderer,
  project: ProjectNodeRenderer,
  folder: CategoryNodeRenderer,
  calendar: CalendarNodeRenderer,
  tempo: TempoNodeRenderer,
  pdf: PdfNodeRenderer,
  image: ImageNodeRenderer,
  course: CourseNodeRenderer,
  task: TaskNodeRenderer,
  video: VideoNodeRenderer,
};

export default function RegisteredNodeView(props: NodeRendererProps) {
  return NODE_RENDERERS[getNodeRenderer(props.node.type)](props);
}
