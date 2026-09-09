import { useCallback, useEffect, useRef, useState } from "react";

const MIN_SIDEBAR_WIDTH = 280;
const MAX_SIDEBAR_WIDTH = 440;

export function useSidebarResize(initialWidth = 305) {
  const [width, setWidth] = useState(initialWidth);
  const resizing = useRef(false);

  const startResize = useCallback(() => {
    resizing.current = true;
    document.body.style.cursor = "col-resize";
  }, []);

  useEffect(() => {
    const finishResize = () => {
      resizing.current = false;
      document.body.style.cursor = "default";
    };
    const resize = (event: MouseEvent) => {
      if (!resizing.current) return;
      setWidth(Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, event.clientX)));
    };
    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", finishResize);
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", finishResize);
      if (resizing.current) document.body.style.cursor = "default";
    };
  }, []);

  return { width, startResize };
}
