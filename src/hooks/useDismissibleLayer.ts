import { useEffect, useRef, type RefObject } from "react";

export function useDismissibleLayer(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  enabled = true,
) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!enabled) return;
    const closeOutside = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Node) || !ref.current?.contains(target)) onCloseRef.current();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    // Window capture runs before editor/WebView handlers that may stop the
    // event. This keeps contextual layers dismissible even after focus moves.
    window.addEventListener("pointerdown", closeOutside, true);
    window.addEventListener("contextmenu", closeOutside, true);
    window.addEventListener("keydown", closeOnEscape, true);
    return () => {
      window.removeEventListener("pointerdown", closeOutside, true);
      window.removeEventListener("contextmenu", closeOutside, true);
      window.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [enabled, ref]);
}
