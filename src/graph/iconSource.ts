import type { BaseNodeType } from "../types/nodes";

const sources = new Map<BaseNodeType, string>();

// The Node system's existing CSS remains the single icon catalogue. Pixi only
// resolves its computed URL once per registered type and then reuses the texture.
export function resolveNodeTypeIconSource(type: BaseNodeType): string | null {
  const cached = sources.get(type);
  if (cached) return cached;
  const probe = document.createElement("span");
  probe.className = `sidebar-icon node-type-icon node-type-icon--${type}`;
  probe.style.position = "fixed";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  document.body.appendChild(probe);
  const value = getComputedStyle(probe).webkitMaskImage || getComputedStyle(probe).maskImage;
  probe.remove();
  const match = value.match(/^url\(["']?(.*?)["']?\)$/);
  if (!match?.[1]) return null;
  sources.set(type, match[1]);
  return match[1];
}
