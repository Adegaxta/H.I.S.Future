import type { NodeItem } from "../types/nodes";
import { useEffect, useMemo, useState } from "react";
import { getImageResourceDescriptor } from "../utils/imageResource";
import { getPageMeta } from "../utils/pageMeta";
import type { NodeVisual, ResolvedNodeVisual } from "./visuals/types";
import { acquireImageSource, useResolvedImageSource, type ResolvedImageLease } from "../utils/imageRuntimeResolver";
import { hasNodeCapability } from "./registry";

const nodeVisualCache = new WeakMap<NodeItem, { content: string; visual: NodeVisual | null }>();
const imageSourceCache = new WeakMap<NodeItem, { content: string; name: string; source: string | null; resourceKey: string | null }>();

function nodeVisual(node: NodeItem): NodeVisual | null {
  if (!hasNodeCapability(node.type, "icon")) return null;
  const cached = nodeVisualCache.get(node);
  if (cached?.content === node.content) return cached.visual;
  const visual = getPageMeta(node.content).iconVisual;
  nodeVisualCache.set(node, { content: node.content, visual });
  return visual;
}

function imageSource(node: NodeItem): string | null {
  const cached = imageSourceCache.get(node);
  if (cached?.content === node.content && cached.name === node.name) return cached.source;
  const resource = getImageResourceDescriptor(node.content, node.name);
  const source = resource && resource.storage !== "project-resource" ? resource.src : null;
  const resourceKey = resource?.storage === "project-resource" ? `${resource.resourceId}:${resource.extension}:${resource.hash}` : source;
  imageSourceCache.set(node, { content: node.content, name: node.name, source, resourceKey });
  return source;
}

export function resolveNodeCustomVisual(node: NodeItem, nodes: readonly NodeItem[]): ResolvedNodeVisual | undefined {
  const visual = nodeVisual(node);
  if (!visual) return undefined;
  if (visual.kind !== "image") return visual;
  const imageNode = nodes.find((candidate) => candidate.id === visual.nodeId);
  const src = imageNode?.type === "imagen" ? imageSource(imageNode) : null;
  return src ? { kind: "image", src, ...(visual.presentation ? { presentation: visual.presentation } : {}) } : undefined;
}

export function buildNodeCustomVisuals(nodes: readonly NodeItem[]): ReadonlyMap<string, ResolvedNodeVisual> {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const imageSources = new Map<string, string | null>();
  const result = new Map<string, ResolvedNodeVisual>();

  nodes.forEach((node) => {
    const visual = nodeVisual(node);
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
    if (source) result.set(node.id, { kind: "image", src: source, ...(visual.presentation ? { presentation: visual.presentation } : {}) });
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

export function useNodeCustomVisuals(nodes: readonly NodeItem[]): ReadonlyMap<string, ResolvedNodeVisual> {
  const [resolvedImages, setResolvedImages] = useState<ReadonlyMap<string, string>>(new Map());
  const imageVisualIds = useMemo(() => nodes
    .filter((node) => nodeVisual(node)?.kind === "image")
    .map((node) => [node.id, (nodeVisual(node) as Extract<NodeVisual, { kind: "image" }>).nodeId] as const), [nodes]);
  const signature = JSON.stringify(imageVisualIds.map(([pageId, imageId]) => {
    const image = nodes.find((n) => n.id === imageId);
    if (image) imageSource(image);
    return [pageId, imageId, image ? imageSourceCache.get(image)?.resourceKey : null];
  }));
  useEffect(() => {
    let active = true;
    const leases: ResolvedImageLease[] = [];
    void Promise.all(imageVisualIds.map(async ([pageId, imageId]) => {
      const imageNode = nodes.find((node) => node.id === imageId && node.type === "imagen");
      if (!imageNode) return null;
      const lease = await acquireImageSource(imageNode);
      leases.push(lease);
      return [pageId, lease.src] as const;
    })).then((entries) => {
      if (active) setResolvedImages(new Map(entries.filter((entry): entry is readonly [string, string] => Boolean(entry))));
    }).catch(() => { if (active) setResolvedImages(new Map()); });
    return () => { active = false; leases.forEach((lease) => lease.release()); };
    // The stable signature intentionally avoids reacquiring icon resources for textual edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return useMemo(() => {
    const result = new Map<string, ResolvedNodeVisual>();
    nodes.forEach((node) => {
      const visual = nodeVisual(node);
      if (!visual) return;
      if (visual.kind !== "image") result.set(node.id, visual);
      else {
        const src = resolvedImages.get(node.id);
        if (src) result.set(node.id, { kind: "image", src, ...(visual.presentation ? { presentation: visual.presentation } : {}) });
      }
    });
    return result;
  }, [nodes, resolvedImages]);
}

export function useResolvedNodeCustomVisual(node: NodeItem | null | undefined, nodes: readonly NodeItem[]): ResolvedNodeVisual | undefined {
  const visual = node ? nodeVisual(node) : null;
  const imageNode = visual?.kind === "image" ? nodes.find((candidate) => candidate.id === visual.nodeId && candidate.type === "imagen") : null;
  const { src: source } = useResolvedImageSource(imageNode);
  if (!visual) return undefined;
  return visual.kind === "image" ? (source ? { kind: "image", src: source, ...(visual.presentation ? { presentation: visual.presentation } : {}) } : undefined) : visual;
}
