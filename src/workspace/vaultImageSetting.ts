import { parseNodeVisual, type NodeVisual } from "../nodes/visuals/types";
import { parseImagePresentation, type ImagePresentation } from "../utils/imagePresentation";
export interface VaultImageSetting {
  version: 1;
  nodeId: string | null;
  visual: Extract<NodeVisual, { kind: "emoji" | "icon" }> | null;
  presentation?: ImagePresentation;
}
export function parseVaultImageSetting(raw: string | null): VaultImageSetting | null {
  try {
    const value = JSON.parse(raw || "null");
    if (!value || value.version !== 1 || (value.nodeId !== null && typeof value.nodeId !== "string")) return null;
    const visual = parseNodeVisual(value.visual);
    return { version: 1, nodeId: value.nodeId, visual: visual && visual.kind !== "image" ? visual : null, presentation: parseImagePresentation(value.presentation) };
  } catch { return null; }
}
