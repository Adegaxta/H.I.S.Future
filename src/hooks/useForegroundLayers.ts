import { useLayoutEffect, type RefObject } from "react";

// Top-layer painting preserves React ownership while escaping pane clipping.
const SELECTOR = ".node-options-layer,.his-context-menu,.page-context-menu-layer,.his-table-menu-layer,.spelling-context-menu,.page-image-picker,.tag-picker,.page-node-settings,.page-node-visibility-menu,.editor-selection-toolbar,.editor-selection-color-menu,.editor-block-color-menu";
export function useForegroundLayers(rootRef: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !("showPopover" in HTMLElement.prototype)) return;
    const promoted = new Map<HTMLElement, string | null>();
    const promote = (element: HTMLElement) => {
      if (promoted.has(element) || element.parentElement?.closest("[data-his-foreground]")) return;
      const css = getComputedStyle(element);
      if (css.display === "none") return;
      const rect = element.getBoundingClientRect();
      const position = css.position;
      const edges = [css.top, css.right, css.bottom, css.left];
      const padding = css.padding;
      const border = css.border;
      const overflow = css.overflow;
      const background = css.backgroundColor;
      const boxSizing = css.boxSizing;
      promoted.set(element, element.getAttribute("style"));
      element.setAttribute("popover", "manual");
      element.dataset.hisForeground = "true";
      element.style.margin = "0";
      element.style.padding = padding;
      element.style.border = border;
      element.style.overflow = overflow;
      element.style.backgroundColor = background;
      element.style.boxSizing = boxSizing;
      if (position === "absolute") {
        element.style.setProperty("position", "fixed", "important");
        element.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8))}px`;
        element.style.top = `${Math.max(8, Math.min(rect.top, window.innerHeight - rect.height - 8))}px`;
        element.style.right = "auto";
        element.style.bottom = "auto";
        element.style.width = `${rect.width}px`;
      } else {
        ["top", "right", "bottom", "left"].forEach((edge, i) => element.style.setProperty(edge, edges[i]));
        if (edges[1] !== "auto" && edges[3] !== "auto") element.style.width = "auto";
        if (edges[0] !== "auto" && edges[2] !== "auto") element.style.height = "auto";
      }
      if (!root.closest(".workspace-pane__view.is-hidden")) element.showPopover();
    };
    const scan = (element: Element) => {
      if (element.matches(SELECTOR)) promote(element as HTMLElement);
      element.querySelectorAll<HTMLElement>(SELECTOR).forEach(promote);
    };
    scan(root);
    const observer = new MutationObserver(records => {
      records.forEach(record => record.addedNodes.forEach(node => { if (node instanceof Element) scan(node); }));
      for (const element of promoted.keys()) if (!element.isConnected) promoted.delete(element);
    });
    observer.observe(root, { childList: true, subtree: true });
    const view = root.closest(".workspace-pane__view");
    const visibilityObserver = new MutationObserver(() => {
      promoted.forEach((_style, element) => {
        if (view?.classList.contains("is-hidden")) {
          if (element.matches(":popover-open")) element.hidePopover();
        } else if (element.isConnected && !element.matches(":popover-open")) element.showPopover();
      });
    });
    if (view) visibilityObserver.observe(view, { attributes: true, attributeFilter: ["class"] });
    return () => {
      observer.disconnect();
      visibilityObserver.disconnect();
      promoted.forEach((style, element) => {
        if (element.matches(":popover-open")) element.hidePopover();
        element.removeAttribute("popover");
        delete element.dataset.hisForeground;
        if (style === null) element.removeAttribute("style"); else element.setAttribute("style", style);
      });
    };
  }, [rootRef]);
}
