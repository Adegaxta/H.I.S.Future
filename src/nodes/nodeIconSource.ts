import type { NodeItem } from "../types/nodes";
import { getImageResourceInfo } from "../utils/imageResource";
import { getPageMeta } from "../utils/pageMeta";
import type { NodeVisual, ResolvedNodeVisual } from "./visuals/types";

const pageVisualCache = new WeakMap<NodeItem, NodeVisual | null>();
const imageSourceCache = new WeakMap<NodeItem, string | null>();

function pageVisual(node: NodeItem): NodeVisual | null {
  if (!pageVisualCache.has(node)) pageVisualCache.set(node, getPageMeta(node.content).iconVisual);
  return pageVisualCache.get(node) ?? null;
}

function imageSource(node: NodeItem): string | null {
  if (!imageSourceCache.has(node)) {
    imageSourceCache.set(node, getImageResourceInfo(node.content, node.name)?.src ?? null);
  }
  return imageSourceCache.get(node) ?? null;
}

export function resolveNodeCustomVisual(node: NodeItem, nodes: readonly NodeItem[]): ResolvedNodeVisual | undefined {
  if (node.type !== "pagina") return undefined;
  const visual = pageVisual(node);
  if (!visual) return undefined;
  if (visual.kind !== "image") return visual;
  const imageNode = nodes.find((candidate) => candidate.id === visual.nodeId);
  const src = imageNode?.type === "imagen" ? imageSource(imageNode) : null;
  return src ? { kind: "image", src } : undefined;
}

export function buildNodeCustomVisuals(nodes: readonly NodeItem[]): ReadonlyMap<string, ResolvedNodeVisual> {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const imageSources = new Map<string, string | null>();
  const result = new Map<string, ResolvedNodeVisual>();

  nodes.forEach((node) => {
    if (node.type !== "pagina") return;
    const visual = pageVisual(node);
    if (!visual) return;
    if (visual.kind !== "image") {
      result.set(node.id, visual);
      return;
    }
    if (!imageSources.has(visual.nodeId)) {
      const imageNode = nodesById.get(visual.nodeId);
      imageSources.set(visual.nodeId, imageNode?.type === "imagen"
        ? imageSource(imageNode)
        : null);
    }
    const source = imageSources.get(visual.nodeId);
    if (source) result.set(node.id, { kind: "image", src: source });
  });
  return result;
}

export function resolveNodeCustomIconSource(node: NodeItem, nodes: readonly NodeItem[]): string | undefined {
  const visual = resolveNodeCustomVisual(node, nodes);
  return visual?.kind === "image" ? visual.src : undefined;
}

export function buildNodeCustomIconSources(nodes: readonly NodeItem[]): ReadonlyMap<string, string> {
  const sources = new Map<string, string>();
  for (const [id, visual] of buildNodeCustomVisuals(nodes)) if (visual.kind === "image") sources.set(id, visual.src);
  return sources;
}
