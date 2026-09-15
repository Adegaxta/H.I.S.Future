import type { RenderNodeType } from "../types/nodes";
import { NodeVisualRenderer } from "./visuals/NodeVisualRenderer";
import type { ResolvedNodeVisual } from "./visuals/types";

export function NodeIcon({ type, className = "", source, visual }: { type: RenderNodeType; className?: string; source?: string; visual?: ResolvedNodeVisual }) {
  const customVisual = visual ?? (source ? { kind: "image" as const, src: source } : undefined);
  if (customVisual) return <NodeVisualRenderer visual={customVisual} className={`sidebar-icon node-type-icon node-custom-icon ${className}`} />;
  return <span aria-hidden="true" className={`sidebar-icon node-type-icon node-type-icon--${type} ${className}`} />;
}
