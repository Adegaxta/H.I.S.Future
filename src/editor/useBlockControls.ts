import { useRef, useState } from "react";
import type { LineControlState } from "./types";

export function useBlockControls() {
  const [lineControl, setLineControl] = useState<LineControlState | null>(null);
  const [isDraggingLine, setIsDraggingLine] = useState(false);
  const draggedLineRef = useRef<HTMLElement | null>(null);
  const draggedLinesRef = useRef<HTMLElement[]>([]);
  const didDragLineRef = useRef(false);
  const lineDropRef = useRef<{
    block: HTMLElement;
    before: boolean;
    inside: boolean;
  } | null>(null);

  const clearBlockControls = () => {
    setLineControl(null);
    setIsDraggingLine(false);
    draggedLineRef.current?.removeAttribute("data-line-dragging");
    draggedLinesRef.current.forEach((line) =>
      line.removeAttribute("data-line-dragging"),
    );
    lineDropRef.current?.block.removeAttribute("data-line-drop-target");
    draggedLineRef.current = null;
    draggedLinesRef.current = [];
    lineDropRef.current = null;
    document.body.style.cursor = "default";
  };

  return {
    lineControl,
    setLineControl,
    isDraggingLine,
    setIsDraggingLine,
    draggedLineRef,
    draggedLinesRef,
    didDragLineRef,
    lineDropRef,
    clearBlockControls,
  };
}
