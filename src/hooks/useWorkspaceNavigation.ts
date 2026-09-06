import { useEffect, useRef } from "react";

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
  const history = useRef<WorkspaceNavigationHistory>({ entries: [], index: -1 });
  useEffect(() => {
    if (selectedId) history.current = recordWorkspaceVisit(history.current, { kind: "node", id: selectedId });
  }, [selectedId]);
  useEffect(() => {
    if (selectedTrashId) history.current = recordWorkspaceVisit(history.current, { kind: "trash", id: selectedTrashId });
  }, [selectedTrashId]);
  useEffect(() => {
    const handleMouseButton = (event: MouseEvent) => {
      if (event.button !== 3 && event.button !== 4) return;
      const direction = event.button === 3 ? -1 : 1;
      if (navigateWithinView(direction)) { event.preventDefault(); return; }
      const entry = stepWorkspaceNavigation(history.current, direction);
      if (!entry) return;
      event.preventDefault();
      onNavigate(entry);
    };
    window.addEventListener("mousedown", handleMouseButton);
    return () => window.removeEventListener("mousedown", handleMouseButton);
  }, [navigateWithinView, onNavigate]);
}
