import type { RenderNodeType } from "../types/nodes";

export type SidebarIconName =
  | "sidebar" | "settings" | "search" | "lore" | "recent" | "types"
  | "add" | "folder" | "image-add" | "general" | "history" | "trash" | "exit"
  | "arrow-open" | "arrow-close";

interface IconProps {
  name: SidebarIconName;
  active?: boolean;
  className?: string;
  title?: string;
}

export function SidebarIcon({ name, active = false, className = "", title }: IconProps) {
  return <span aria-hidden="true" title={title} className={`sidebar-icon sidebar-icon--${name} ${active ? "is-active" : ""} ${className}`} />;
}

export function NodeIcon({ type, className = "" }: { type: RenderNodeType; className?: string }) {
  return <span aria-hidden="true" className={`sidebar-icon node-type-icon node-type-icon--${type} ${className}`} />;
}
