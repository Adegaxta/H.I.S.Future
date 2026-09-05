import { useEffect, useRef } from "react";

/** Reveal the first match without moving keyboard focus out of the search field. */
export function useSearchReveal(query: string, matchKey: string) {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!query) return;
    const timeout = window.setTimeout(() => {
      const container = containerRef.current;
      const match = container?.querySelector<HTMLElement>('[data-search-match="true"]');
      if (!container || !match) return;
      const bounds = container.getBoundingClientRect();
      const target = match.getBoundingClientRect();
      container.scrollTop += target.top - bounds.top - (bounds.height - target.height) / 2;
    }, 150);
    return () => window.clearTimeout(timeout);
  }, [query, matchKey]);
  return containerRef;
}
