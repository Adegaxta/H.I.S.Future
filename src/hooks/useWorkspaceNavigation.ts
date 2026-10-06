import { useCallback, useEffect, useRef, useState } from "react";

export type NavigationEntry = { kind: "node" | "trash"; id: string; scrollTop?: number; scrollLeft?: number };
export interface WorkspaceNavigationHistory { entries: NavigationEntry[]; index: number }
export type NavigationHandler = (direction: -1 | 1) => boolean;

export function recordWorkspaceVisit(history: WorkspaceNavigationHistory, entry: NavigationEntry): WorkspaceNavigationHistory {
  const current = history.entries[history.index];
  if (current?.kind === entry.kind && current.id === entry.id) return history;
  const entries = history.entries.slice(0, history.index + 1);
  return { entries: [...entries, entry], index: entries.length };
}

export function stepWorkspaceNavigation(history: WorkspaceNavigationHistory, direction: -1 | 1): NavigationEntry | undefined {
  const next = history.index + direction;
  if (next < 0 || next >= history.entries.length) return undefined;
  history.index = next;
  return history.entries[next];
}

// Navigation owns destinations and entry-local view positions, never document history.
export function useWorkspaceNavigation({ selectedId, selectedTrashId, navigateWithinView, onNavigate, getScrollElement }: {
  selectedId: string | null;
  selectedTrashId: string | null;
  navigateWithinView: NavigationHandler;
  onNavigate: (entry: NavigationEntry) => void;
  getScrollElement?: () => HTMLElement | null;
}) {
  const [history, setHistory] = useState<WorkspaceNavigationHistory>({ entries: [], index: -1 });
  const historyRef = useRef(history);
  const navigateWithinViewRef = useRef(navigateWithinView);
  const onNavigateRef = useRef(onNavigate);
  const getScrollElementRef = useRef(getScrollElement);
  getScrollElementRef.current = getScrollElement;
  historyRef.current = history;
  navigateWithinViewRef.current = navigateWithinView;
  onNavigateRef.current = onNavigate;
  useEffect(() => {
    const entry: NavigationEntry | null = selectedTrashId
      ? { kind: "trash", id: selectedTrashId }
      : selectedId ? { kind: "node", id: selectedId } : null;
    if (!entry) return;
    const next = recordWorkspaceVisit(historyRef.current, entry);
    historyRef.current = next;
    setHistory(next);
  }, [selectedId, selectedTrashId]);
  useEffect(() => {
    const entry = historyRef.current.entries[historyRef.current.index];
    const element = getScrollElementRef.current?.();
    if (!entry || !element) return;
    const top = entry.scrollTop ?? 0;
    const left = entry.scrollLeft ?? 0;
    let restoring = true;
    const restore = () => {
      if (!restoring) return;
      // Content hydration can happen after navigation; observe actual layout.
      element.scrollTop = top;
      element.scrollLeft = left;
      if (element.scrollHeight - element.clientHeight >= top) {
        restoring = false;
        mutations.disconnect();
        resize.disconnect();
      }
    };
    const mutations = new MutationObserver(restore);
    const resize = new ResizeObserver(restore);
    mutations.observe(element, { childList: true, subtree: true });
    resize.observe(element);
    if (element.firstElementChild) resize.observe(element.firstElementChild);
    const remember = () => {
      if (restoring || historyRef.current.entries[historyRef.current.index] !== entry) return;
      entry.scrollTop = element.scrollTop;
      entry.scrollLeft = element.scrollLeft;
    };
    const cancelRestoration = () => {
      restoring = false;
      mutations.disconnect();
      resize.disconnect();
      remember();
    };
    restore();
    element.addEventListener("scroll", remember, { passive: true });
    document.addEventListener("pointerdown", remember, true);
    element.addEventListener("wheel", cancelRestoration, { passive: true });
    element.addEventListener("pointerdown", cancelRestoration);
    return () => {
      mutations.disconnect();
      resize.disconnect();
      element.removeEventListener("scroll", remember);
      document.removeEventListener("pointerdown", remember, true);
      element.removeEventListener("wheel", cancelRestoration);
      element.removeEventListener("pointerdown", cancelRestoration);
    };
  }, [selectedId, selectedTrashId]);

  const navigate = useCallback((direction: -1 | 1) => {
    if (navigateWithinViewRef.current(direction)) return true;
    const current = historyRef.current.entries[historyRef.current.index];
    const element = getScrollElementRef.current?.();
    if (current && element) {
      current.scrollTop = element.scrollTop;
      current.scrollLeft = element.scrollLeft;
    }
    const nextHistory = { ...historyRef.current, entries: [...historyRef.current.entries] };
    const entry = stepWorkspaceNavigation(nextHistory, direction);
    if (!entry) return false;
    historyRef.current = nextHistory;
    setHistory(nextHistory);
    onNavigateRef.current(entry);
    return true;
  }, []);
  useEffect(() => {
    const handleMouseButton = (event: MouseEvent) => {
      if (event.button !== 3 && event.button !== 4) return;
      const direction = event.button === 3 ? -1 : 1;
      if (navigate(direction)) event.preventDefault();
    };
    window.addEventListener("mousedown", handleMouseButton);
    return () => window.removeEventListener("mousedown", handleMouseButton);
  }, [navigate]);

  const back = useCallback(() => navigate(-1), [navigate]);
  const forward = useCallback(() => navigate(1), [navigate]);

  return {
    back,
    forward,
    canBack: history.index > 0,
    canForward: history.index >= 0 && history.index < history.entries.length - 1,
  };
}
