import type { CSSProperties } from "react";
import type { Tag } from "./types";

export function TagChip({ tag, selected = false }: { tag: Tag; selected?: boolean }) {
  return (
    <span
      className={`tag-chip${selected ? " is-selected" : ""}`}
      style={{ "--tag-color": tag.color } as CSSProperties}
      title={`#${tag.name}`}
    >
      #{tag.name}
    </span>
  );
}
