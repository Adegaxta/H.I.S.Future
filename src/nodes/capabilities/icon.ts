import type { ImagePresentation } from "../../utils/imagePresentation";
import type { NodeItem } from "../../types/nodes";
import { getImageResourceInfo } from "../../utils/imageResource";
import { getPageMeta, setPageMeta, type PageMeta } from "../../utils/pageMeta";
import type { EmojiVisualStyle, IconVisualProvider, ResolvedNodeVisual } from "../visuals/types";
import { useResolvedImageSource } from "../../utils/imageRuntimeResolver";

export type NodeIconState = Pick<PageMeta, "iconNodeId" | "iconVisual">;

export interface NodeIconPersistence {
  read(content: string): NodeIconState;
  write(content: string, state: NodeIconState): string;
}

export const pageNodeIconPersistence: NodeIconPersistence = {
  read(content) {
    const meta = getPageMeta(content);
    return { iconNodeId: meta.iconNodeId, iconVisual: meta.iconVisual };
  },
  write(content, state) {
    const meta = getPageMeta(content);
    return setPageMeta(content, { ...meta, ...state });
  },
};

export function getNodeIconState(content: string, persistence: NodeIconPersistence = pageNodeIconPersistence): NodeIconState {
  return persistence.read(content);
}

export function setNodeIconState(content: string, state: NodeIconState, persistence: NodeIconPersistence = pageNodeIconPersistence): string {
  return persistence.write(content, state);
}

export function resolveNodeIcon(state: NodeIconState, nodes: NodeItem[]): ResolvedNodeVisual | null {
  if (state.iconVisual?.kind !== "image") return state.iconVisual;
  const icon = state.iconNodeId ? nodes.find((item) => item.id === state.iconNodeId) : null;
  const resource = icon ? getImageResourceInfo(icon.content, icon.name) : null;
  return resource ? { kind: "image", src: resource.src, ...(state.iconVisual.presentation ? { presentation: state.iconVisual.presentation } : {}) } : null;
}

export function selectNodeIconImage(state: NodeIconState, nodes: NodeItem[], id: string, source?: "local" | "unsplash", presentation?: ImagePresentation): NodeIconState {
  const selectedNode = nodes.find((item) => item.id === id);
  const selectedResource = selectedNode ? getImageResourceInfo(selectedNode.content, selectedNode.name) : null;
  const imageSource = source ?? (selectedResource?.provenance?.provider === "unsplash" ? "unsplash" : "local");
  return { ...state, iconNodeId: id, iconVisual: { kind: "image", nodeId: id, source: imageSource, ...(presentation ? { presentation } : {}) } };
}

export function selectNodeIconEmoji(state: NodeIconState, value: string, style: EmojiVisualStyle): NodeIconState {
  return { ...state, iconNodeId: null, iconVisual: { kind: "emoji", value, style } };
}

export function selectNodeIconGlyph(state: NodeIconState, provider: IconVisualProvider, name: string): NodeIconState {
  return { ...state, iconNodeId: null, iconVisual: { kind: "icon", provider, name } };
}

export function clearNodeIcon(state: NodeIconState): NodeIconState {
  return { ...state, iconNodeId: null, iconVisual: null };
}

export function useResolvedNodeIcon(state: NodeIconState, nodes: NodeItem[]): ResolvedNodeVisual | null {
  const icon = state.iconNodeId ? nodes.find((item) => item.id === state.iconNodeId && item.type === "imagen") : null;
  const resolved = useResolvedImageSource(icon);
  if (state.iconVisual?.kind !== "image") return state.iconVisual;
  return resolved.src ? { kind: "image", src: resolved.src, ...(state.iconVisual.presentation ? { presentation: state.iconVisual.presentation } : {}) } : null;
}
