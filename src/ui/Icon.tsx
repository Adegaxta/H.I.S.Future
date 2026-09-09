export type UiIconName =
  | "sidebar" | "settings" | "search" | "lore" | "recent" | "types" | "graph"
  | "add" | "folder" | "image-add" | "general" | "history" | "trash" | "exit"
  | "arrow-open" | "arrow-close";

interface UiIconProps {
  name: UiIconName;
  active?: boolean;
  className?: string;
  title?: string;
}

export function UiIcon({ name, active = false, className = "", title }: UiIconProps) {
  return <span aria-hidden="true" title={title} className={`sidebar-icon sidebar-icon--${name} ${active ? "is-active" : ""} ${className}`} />;
}
