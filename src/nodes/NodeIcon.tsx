import type { RenderNodeType } from "../types/nodes";

export function NodeIcon({ type, className = "" }: { type: RenderNodeType; className?: string }) {
  return <span aria-hidden="true" className={`sidebar-icon node-type-icon node-type-icon--${type} ${className}`} />;
}
