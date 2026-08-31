import { useCallback, useEffect, useRef } from "react";

export interface EditorHistoryController<T> {
  push: (value: T) => void;
  undo: (current: T) => T | undefined;
  redo: (current: T) => T | undefined;
  reset: () => void;
  clear: () => void;
}

export function useEditorHistory<T>(maxItems = 50): EditorHistoryController<T> {
  const undoRef = useRef<T[]>([]);
  const redoRef = useRef<T[]>([]);

  const push = useCallback(
    (value: T) => {
      const previous = undoRef.current[undoRef.current.length - 1];
      if (Object.is(previous, value)) return;
      undoRef.current = [...undoRef.current.slice(-(maxItems - 1)), value];
      redoRef.current = [];
    },
    [maxItems],
  );

  const undo = useCallback(
    (current: T) => {
      const previous = undoRef.current.pop();
      if (previous === undefined) return undefined;
      redoRef.current = [...redoRef.current.slice(-(maxItems - 1)), current];
      return previous;
    },
    [maxItems],
  );

  const redo = useCallback(
    (current: T) => {
      const next = redoRef.current.pop();
      if (next === undefined) return undefined;
      undoRef.current = [...undoRef.current.slice(-(maxItems - 1)), current];
      return next;
    },
    [maxItems],
  );

  const reset = useCallback(() => {
    undoRef.current = [];
    redoRef.current = [];
  }, []);

  return {
    push,
    undo,
    redo,
    reset,
    clear: reset,
  };
}

export function useNodeScopedEditorHistory<T>(nodeId: string | undefined, maxItems = 50) {
  const history = useEditorHistory<T>(maxItems);

  useEffect(() => {
    history.reset();
  }, [nodeId, history]);

  return history;
}
