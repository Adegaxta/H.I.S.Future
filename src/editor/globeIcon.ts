import { readSerializedImagePresentation, type ImagePresentation } from "../utils/imagePresentation";
import { applyDomImagePresentation } from "../utils/domImagePresentation";
import type { NodeItem } from "../types/nodes";
import { clearNodeIcon, resolveNodeIcon, selectNodeIconEmoji, selectNodeIconGlyph, selectNodeIconImage, type NodeIconPersistence, type NodeIconState } from "../nodes/capabilities/icon";
import type { EmojiVisualStyle, IconVisualProvider } from "../nodes/visuals/types";
import { IMAGE_PLACEHOLDER_ATTRIBUTE } from "../utils/imageRuntimeResolver";

export const globeNodeIconPersistence: NodeIconPersistence = {
  read(content) {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = content;
    const icon = wrapper.querySelector<HTMLElement>("[data-globe-icon]");
    const image = icon?.querySelector<HTMLImageElement>("img");
    const nodeId = image?.dataset.nodeId;
    if (nodeId) return { iconNodeId: nodeId, iconVisual: { kind: "image", nodeId, source: "local", ...(readSerializedImagePresentation(icon?.dataset.imagePresentation) ? { presentation: readSerializedImagePresentation(icon?.dataset.imagePresentation) } : {}) } };
    if (icon?.dataset.iconKind === "emoji" && icon.dataset.iconValue) return { iconNodeId: null, iconVisual: { kind: "emoji", value: icon.dataset.iconValue, style: icon.dataset.iconStyle === "twemoji" ? "twemoji" : "noto" } };
    if (icon?.dataset.iconKind === "icon" && icon.dataset.iconName && (icon.dataset.iconProvider === "lucide" || icon.dataset.iconProvider === "material-symbols")) return { iconNodeId: null, iconVisual: { kind: "icon", provider: icon.dataset.iconProvider, name: icon.dataset.iconName } };
    return { iconNodeId: null, iconVisual: null };
  },
  write(content, state) {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = content;
    const icon = wrapper.querySelector<HTMLElement>("[data-globe-icon]");
    if (!icon) return content;
    icon.dataset.iconKind = state.iconVisual?.kind || "";
    if (state.iconVisual?.kind === "image" && state.iconVisual.presentation) icon.dataset.imagePresentation = JSON.stringify(state.iconVisual.presentation);
    else delete icon.dataset.imagePresentation;
    delete icon.dataset.iconValue;
    delete icon.dataset.iconStyle;
    delete icon.dataset.iconProvider;
    delete icon.dataset.iconName;
    const image = icon.querySelector<HTMLImageElement>("img");
    if (state.iconVisual?.kind === "image" && state.iconNodeId) {
      if (image) image.dataset.nodeId = state.iconNodeId;
    } else if (image) {
      delete image.dataset.nodeId;
    }
    if (state.iconVisual?.kind === "emoji") {
      icon.dataset.iconValue = state.iconVisual.value;
      icon.dataset.iconStyle = state.iconVisual.style;
    } else if (state.iconVisual?.kind === "icon") {
      icon.dataset.iconProvider = state.iconVisual.provider;
      icon.dataset.iconName = state.iconVisual.name;
    }
    return wrapper.innerHTML;
  },
};

export function readGlobeIconState(globe: HTMLElement): NodeIconState {
  return globeNodeIconPersistence.read(globe.outerHTML);
}

export function applyGlobeIconState(globe: HTMLElement, state: NodeIconState, nodes: NodeItem[]): void {
  let icon = globe.querySelector<HTMLElement>(":scope > [data-globe-icon]");
  if (!icon) {
    icon = document.createElement("span");
    globe.insertBefore(icon, globe.firstChild);
  }
  globe.innerHTML = globeNodeIconPersistence.write(globe.innerHTML, state);
  icon = globe.querySelector<HTMLElement>(":scope > [data-globe-icon]") || icon;
  icon.dataset.globeIcon = "true";
  icon.contentEditable = "false";
  const visual = resolveNodeIcon(state, nodes);
  delete icon.dataset.iconValue;
  delete icon.dataset.iconStyle;
  delete icon.dataset.iconProvider;
  delete icon.dataset.iconName;
  icon.dataset.iconKind = visual?.kind || "";
  if (!visual) {
    if (state.iconVisual?.kind === "image" && state.iconNodeId) {
      const image = document.createElement("img");
      image.dataset.nodeId = state.iconNodeId;
      image.setAttribute(IMAGE_PLACEHOLDER_ATTRIBUTE, "true");
      image.alt = "Icono del globo";
      icon.dataset.iconKind = "image";
      icon.replaceChildren(image);
      if (state.iconVisual?.kind === "image") applyDomImagePresentation(image, state.iconVisual.presentation, "editor-globe-icon-visual");
    } else icon.replaceChildren();
    return;
  }
  if (visual.kind === "image") {
    const image = document.createElement("img");
    image.src = visual.src;
    image.alt = "Icono del globo";
    if (state.iconNodeId) image.dataset.nodeId = state.iconNodeId;
    icon.replaceChildren(image);
    if (state.iconVisual?.kind === "image") applyDomImagePresentation(image, state.iconVisual.presentation, "editor-globe-icon-visual");
  } else {
    icon.replaceChildren();
    if (visual.kind === "emoji") {
      const emoji = document.createElement("span");
      emoji.textContent = visual.value;
      icon.dataset.iconValue = visual.value;
      icon.dataset.iconStyle = visual.style;
      icon.appendChild(emoji);
    } else {
      icon.dataset.iconProvider = visual.provider;
      icon.dataset.iconName = visual.name;
    }
  }
}

export function selectGlobeImage(state: NodeIconState, nodes: NodeItem[], id: string, source?: "local" | "unsplash", presentation?: ImagePresentation): NodeIconState { return selectNodeIconImage(state, nodes, id, source, presentation); }
export function selectGlobeEmoji(state: NodeIconState, value: string, style: EmojiVisualStyle): NodeIconState { return selectNodeIconEmoji(state, value, style); }
export function selectGlobeGlyph(state: NodeIconState, provider: IconVisualProvider, name: string): NodeIconState { return selectNodeIconGlyph(state, provider, name); }
export { clearNodeIcon };
