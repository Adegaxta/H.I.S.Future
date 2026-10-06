import { useCallback, useEffect, useRef, useState } from "react";
import { safeLocalStorageSet } from "./safeStorage";
import {
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  parseSidebarWidth,
  sidebarWidthStorageKey,
} from "./navigationPreferences";

export function useSidebarResize(projectKey: string, initialWidth = DEFAULT_SIDEBAR_WIDTH) {
  const storageKey = sidebarWidthStorageKey(projectKey);
  const [width, setWidth] = useState(() => parseSidebarWidth(localStorage.getItem(storageKey), initialWidth));
  const widthRef = useRef(width);
  const resizing = useRef(false);
  widthRef.current = width;

  const startResize = useCallback(() => {
    resizing.current = true;
    document.body.style.cursor = "col-resize";
  }, []);

  useEffect(() => {
    const finishResize = () => {
      if (resizing.current) safeLocalStorageSet(storageKey, String(widthRef.current));
      resizing.current = false;
      document.body.style.cursor = "default";
    };
    const resize = (event: MouseEvent) => {
      if (!resizing.current) return;
      const nextWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, event.clientX));
      widthRef.current = nextWidth;
      setWidth(nextWidth);
    };
    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", finishResize);
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", finishResize);
      if (resizing.current) document.body.style.cursor = "default";
    };
  }, [storageKey]);

  useEffect(() => {
    setWidth(parseSidebarWidth(localStorage.getItem(storageKey), initialWidth));
  }, [initialWidth, storageKey]);

  return { width, startResize };
}
