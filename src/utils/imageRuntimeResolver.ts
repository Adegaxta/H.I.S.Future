import { applyDomImagePresentation } from "./domImagePresentation";
import { readSerializedImagePresentation } from "./imagePresentation";
import { useEffect, useMemo, useState } from "react";
import type { NodeItem } from "../types/nodes";
import { readProjectResource } from "../project/resourceRepository";
import { getImageResourceDescriptor, type ImageResourceDescriptor } from "./imageResource";
import { getPageMeta } from "./pageMeta";
import { hasNodeCapability } from "../nodes/registry";

export const IMAGE_PLACEHOLDER_ATTRIBUTE = "data-his-image-placeholder";
export const IMAGE_RUNTIME_ATTRIBUTE = "data-his-runtime-image";

interface CachedObjectUrl {
  promise: Promise<string>;
  url: string | null;
  references: number;
  revokeTimer: number | null;
  generation: number;
}

export interface ResolvedImageLease {
  key: string;
  src: string;
  descriptor: ImageResourceDescriptor;
  release: () => void;
}

const objectUrls = new Map<string, CachedObjectUrl>();
const editorLeases = new WeakMap<HTMLElement, Map<HTMLElement, ResolvedImageLease>>();
const editorHydration = new WeakMap<HTMLElement, Promise<void>>();
const REVOKE_DELAY_MS = 30_000;
let cacheGeneration = 0;

function descriptorKey(descriptor: ImageResourceDescriptor): string {
  return descriptor.storage === "project-resource"
    ? `project:${descriptor.resourceId}:${descriptor.extension}:${descriptor.hash}:${descriptor.mimeType}`
    : `${descriptor.storage}:${descriptor.src}`;
}

function releaseObjectUrl(key: string): void {
  const cached = objectUrls.get(key);
  if (!cached) return;
  cached.references = Math.max(0, cached.references - 1);
  if (cached.references || cached.revokeTimer !== null) return;
  cached.revokeTimer = window.setTimeout(() => {
    const current = objectUrls.get(key);
    if (!current || current.references) return;
    if (current.url) URL.revokeObjectURL(current.url);
    objectUrls.delete(key);
  }, REVOKE_DELAY_MS);
}

export async function acquireImageSource(imageNode: Pick<NodeItem, "id" | "name" | "content">): Promise<ResolvedImageLease> {
  const descriptor = getImageResourceDescriptor(imageNode.content, imageNode.name);
  if (!descriptor) throw new Error(`El Nodo Imagen ${imageNode.id} no contiene un recurso válido.`);
  const key = descriptorKey(descriptor);
  if (descriptor.storage !== "project-resource") {
    return { key, src: descriptor.src, descriptor, release: () => undefined };
  }

  let cached = objectUrls.get(key);
  if (!cached) {
    const next: CachedObjectUrl = { promise: Promise.resolve(""), url: null, references: 0, revokeTimer: null, generation: cacheGeneration };
    next.promise = readProjectResource("image", descriptor.resourceId, descriptor.extension).then((bytes) => {
      const url = URL.createObjectURL(new Blob([bytes], { type: descriptor.mimeType }));
      if (next.generation !== cacheGeneration || objectUrls.get(key) !== next) {
        URL.revokeObjectURL(url);
        throw new Error("El proyecto cambió mientras se resolvía la imagen.");
      }
      next.url = url;
      return url;
    }).catch((error) => {
      objectUrls.delete(key);
      throw error;
    });
    cached = next;
    objectUrls.set(key, cached);
  }
  if (cached.revokeTimer !== null) {
    window.clearTimeout(cached.revokeTimer);
    cached.revokeTimer = null;
  }
  cached.references += 1;
  try {
    const src = await cached.promise;
    let released = false;
    return {
      key,
      src,
      descriptor,
      release: () => {
        if (released) return;
        released = true;
        releaseObjectUrl(key);
      },
    };
  } catch (error) {
    cached.references = Math.max(0, cached.references - 1);
    throw error;
  }
}

export function clearImageRuntimeCache(): void {
  cacheGeneration += 1;
  for (const cached of objectUrls.values()) {
    if (cached.revokeTimer !== null) window.clearTimeout(cached.revokeTimer);
    if (cached.url) URL.revokeObjectURL(cached.url);
  }
  objectUrls.clear();
}

export function useResolvedImageSource(imageNode: Pick<NodeItem, "id" | "name" | "content"> | null | undefined) {
  const content = imageNode?.content, name = imageNode?.name;
  const descriptor = useMemo(() => content === undefined ? null : getImageResourceDescriptor(content, name || ""), [content, name]);
  const resourceKey = descriptor ? descriptorKey(descriptor) : null;
  const [state, setState] = useState<{ src: string | null; error: Error | null }>({ src: null, error: null });
  useEffect(() => {
    let active = true;
    let lease: ResolvedImageLease | null = null;
    setState({ src: null, error: null });
    if (!imageNode) return;
    void acquireImageSource(imageNode).then((resolved) => {
      lease = resolved;
      if (active) setState({ src: resolved.src, error: null });
      else resolved.release();
    }).catch((reason) => {
      if (active) setState({ src: null, error: reason instanceof Error ? reason : new Error(String(reason)) });
    });
    return () => {
      active = false;
      lease?.release();
    };
  }, [imageNode?.id, resourceKey]);
  return state;
}

function runtimeImageForMention(mention: HTMLElement): HTMLImageElement {
  const current = mention.querySelector<HTMLImageElement>(`:scope > img[${IMAGE_PLACEHOLDER_ATTRIBUTE}]`);
  if (current) return current;
  const image = document.createElement("img");
  image.setAttribute(IMAGE_PLACEHOLDER_ATTRIBUTE, "true");
  image.dataset.noResize = "true";
  mention.insertBefore(image, mention.firstChild);
  return image;
}

function customIconImageNode(target: NodeItem, nodesById: ReadonlyMap<string, NodeItem>): NodeItem | null {
  if (!hasNodeCapability(target.type, "icon")) return null;
  const visual = getPageMeta(target.content).iconVisual;
  if (visual?.kind !== "image") return null;
  const imageNode = nodesById.get(visual.nodeId);
  return imageNode?.type === "imagen" ? imageNode : null;
}

export function hydrateEditorImageMentions(
  editor: HTMLElement,
  nodes: readonly NodeItem[],
  options: { strict?: boolean } = {},
): Promise<void> {
  const run = (async () => {
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    const leases = editorLeases.get(editor) ?? new Map<HTMLElement, ResolvedImageLease>();
    editorLeases.set(editor, leases);
    const activeMentions = new Set<HTMLElement>();
    const failures: Error[] = [];

    await Promise.all(Array.from(editor.querySelectorAll<HTMLElement>("[data-mention-id]")).map(async (mention) => {
      const target = nodesById.get(mention.dataset.mentionId || "");
      if (!target) return;
      const isImageMention = target.type === "imagen";
      const imageNode = isImageMention ? target : customIconImageNode(target, nodesById);
      if (!imageNode) return;
      activeMentions.add(mention);
      const persistedImage = mention.querySelector<HTMLImageElement>(`:scope > img:not([${IMAGE_PLACEHOLDER_ATTRIBUTE}])`);
      // Existing legacy pages retain their documentary data/external URL unchanged.
      if (isImageMention && persistedImage && !persistedImage.src.startsWith("blob:")) return;
      const descriptor = getImageResourceDescriptor(imageNode.content, imageNode.name);
      if (!descriptor) {
        mention.dataset.imageResourceMissing = "true";
        failures.push(new Error(`El recurso de imagen de “${imageNode.name}” no es válido.`));
        return;
      }
      const key = descriptorKey(descriptor);
      const current = leases.get(mention);
      if (current?.key === key) {
        if (!isImageMention) {
          const image = mention.querySelector<HTMLImageElement>("img[data-his-runtime-image]");
          const visual = getPageMeta(target.content).iconVisual;
          if (image && visual?.kind === "image") applyDomImagePresentation(image, visual.presentation);
        }
        return;
      }
      current?.release();
      try {
        const lease = await acquireImageSource(imageNode);
        leases.set(mention, lease);
        if (!isImageMention) {
          Array.from(mention.children).forEach((child) => {
            if (child.matches("[data-mention-node-visual], .editor-mention__icon, .editor-mention__node-icon, .node-visual")) child.remove();
          });
        }
        const image = runtimeImageForMention(mention);
        image.setAttribute(IMAGE_RUNTIME_ATTRIBUTE, "true");
        image.src = lease.src;
        image.alt = isImageMention ? target.name : "";
        if (isImageMention) {
          if (mention.dataset.mentionMode === "inserted") image.classList.add("editor-mention__icon");
          else image.classList.remove("editor-mention__icon");
        } else {
          image.classList.add("editor-mention__visual", "editor-mention__node-icon");
          image.dataset.mentionNodeVisual = "true";
          image.setAttribute("aria-hidden", "true");
        }
        if (!isImageMention) {
          const visual = getPageMeta(target.content).iconVisual;
          if (visual?.kind === "image") applyDomImagePresentation(image, visual.presentation);
        }
        delete mention.dataset.imageResourceMissing;
      } catch (reason) {
        mention.dataset.imageResourceMissing = "true";
        failures.push(reason instanceof Error ? reason : new Error(String(reason)));
      }
    }));

    await Promise.all(Array.from(editor.querySelectorAll<HTMLImageElement>("[data-globe-icon] img[data-node-id]")).map(async (image) => {
      const target = nodesById.get(image.dataset.nodeId || "");
      if (target?.type !== "imagen") return;
      activeMentions.add(image);
      try { applyDomImagePresentation(image, readSerializedImagePresentation(image.closest<HTMLElement>("[data-globe-icon]")?.dataset.imagePresentation), "editor-globe-icon-visual"); } catch { /* Invalid legacy metadata keeps its previous rendering. */ }
      // A legacy/external src already stored in the document remains documentary.
      if (image.hasAttribute("src") && !image.hasAttribute(IMAGE_RUNTIME_ATTRIBUTE)) return;
      const descriptor = getImageResourceDescriptor(target.content, target.name);
      if (!descriptor) {
        failures.push(new Error(`El recurso de imagen de “${target.name}” no es válido.`));
        return;
      }
      const key = descriptorKey(descriptor);
      const current = leases.get(image);
      if (current?.key === key) return;
      current?.release();
      try {
        const lease = await acquireImageSource(target);
        leases.set(image, lease);
        image.setAttribute(IMAGE_PLACEHOLDER_ATTRIBUTE, "true");
        image.setAttribute(IMAGE_RUNTIME_ATTRIBUTE, "true");
        image.src = lease.src;
      } catch (reason) {
        failures.push(reason instanceof Error ? reason : new Error(String(reason)));
      }
    }));

    for (const [mention, lease] of leases) {
      if (activeMentions.has(mention) && mention.isConnected && editor.contains(mention)) continue;
      lease.release();
      leases.delete(mention);
    }
    if (options.strict && failures.length) throw failures[0];
  })();
  editorHydration.set(editor, run);
  return run;
}

export function waitForEditorImageHydration(editor: HTMLElement): Promise<void> {
  return editorHydration.get(editor) ?? Promise.resolve();
}

export function releaseEditorImageMentions(editor: HTMLElement): void {
  const leases = editorLeases.get(editor);
  if (!leases) return;
  for (const lease of leases.values()) lease.release();
  leases.clear();
  editorLeases.delete(editor);
  editorHydration.delete(editor);
}
