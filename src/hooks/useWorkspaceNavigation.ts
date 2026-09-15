import { useCallback, useEffect, useRef, useState } from "react";

export type NavigationEntry = { kind: "node" | "trash"; id: string };
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

// Navigation records destinations only. It cannot mutate nodes or editor history.
export function useWorkspaceNavigation({ selectedId, selectedTrashId, navigateWithinView, onNavigate }: {
  selectedId: string | null;
  selectedTrashId: string | null;
  navigateWithinView: NavigationHandler;
  onNavigate: (entry: NavigationEntry) => void;
}) {
  const [history, setHistory] = useState<WorkspaceNavigationHistory>({ entries: [], index: -1 });
  const historyRef = useRef(history);
  const navigateWithinViewRef = useRef(navigateWithinView);
  const onNavigateRef = useRef(onNavigate);
  historyRef.current = history;
  navigateWithinViewRef.current = navigateWithinView;
  onNavigateRef.current = onNavigate;
  useEffect(() => {
    if (!selectedId) return;
    setHistory((current) => {
      const next = recordWorkspaceVisit(current, { kind: "node", id: selectedId });
      historyRef.current = next;
      return next;
    });
  }, [selectedId]);
  useEffect(() => {
    if (!selectedTrashId) return;
    setHistory((current) => {
      const next = recordWorkspaceVisit(current, { kind: "trash", id: selectedTrashId });
      historyRef.current = next;
      return next;
    });
  }, [selectedTrashId]);
  const navigate = useCallback((direction: -1 | 1) => {
    if (navigateWithinViewRef.current(direction)) return true;
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
