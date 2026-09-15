import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from "react";
import { getNodeRenderer, type NodeRendererId } from "../defs/nodeTypes";
import type { NodeRendererProps } from "../nodes/rendering";

type LazyNodeRenderer = LazyExoticComponent<ComponentType<NodeRendererProps>>;

const PageNodeRenderer = lazy(() => import("../nodes/page/renderer").then((module) => ({ default: module.PageNodeRenderer })));
const ProjectNodeRenderer = lazy(() => import("../nodes/project/renderer").then((module) => ({ default: module.ProjectNodeRenderer })));
const CategoryNodeRenderer = lazy(() => import("../nodes/category/renderer").then((module) => ({ default: module.CategoryNodeRenderer })));
const CalendarNodeRenderer = lazy(() => import("../nodes/calendar/renderer").then((module) => ({ default: module.CalendarNodeRenderer })));
const TempoNodeRenderer = lazy(() => import("../nodes/tempo/renderer").then((module) => ({ default: module.TempoNodeRenderer })));
const PdfNodeRenderer = lazy(() => import("../nodes/pdf/renderer").then((module) => ({ default: module.PdfNodeRenderer })));
const ImageNodeRenderer = lazy(() => import("../nodes/image/renderer").then((module) => ({ default: module.ImageNodeRenderer })));
const CourseNodeRenderer = lazy(() => import("../nodes/course/renderer").then((module) => ({ default: module.CourseNodeRenderer })));
const TaskNodeRenderer = lazy(() => import("../nodes/task/renderer").then((module) => ({ default: module.TaskNodeRenderer })));
const VideoNodeRenderer = lazy(() => import("../nodes/video/renderer").then((module) => ({ default: module.VideoNodeRenderer })));

const NODE_RENDERERS: Record<NodeRendererId, LazyNodeRenderer> = {
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
  const Renderer = NODE_RENDERERS[getNodeRenderer(props.node.type)];
  return (
    <Suspense fallback={<div role="status" aria-live="polite">Cargando vista…</div>}>
      <Renderer {...props} />
    </Suspense>
  );
}
