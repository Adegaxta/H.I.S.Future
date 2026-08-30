import { useEffect, useRef } from "react";

interface DebouncedPersistenceOptions {
  debounceMs?: number;
  maxWaitMs?: number;
}

export function useDebouncedPersistence<T>(
  value: T,
  isDirty: boolean,
  save: (value: T) => void,
  { debounceMs = 500, maxWaitMs = 4000 }: DebouncedPersistenceOptions = {},
) {
  const valueRef = useRef(value);
  valueRef.current = value;
  const saveRef = useRef(save);
  saveRef.current = save;
  const firstDirtyAtRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  const cancelPending = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    firstDirtyAtRef.current = null;
  };

  useEffect(() => {
    if (!isDirty) {
      cancelPending();
      return;
    }
    if (firstDirtyAtRef.current === null) firstDirtyAtRef.current = Date.now();
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);

    const elapsed = Date.now() - firstDirtyAtRef.current;
    const wait = Math.max(0, Math.min(debounceMs, maxWaitMs - elapsed));

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      firstDirtyAtRef.current = null;
      saveRef.current(valueRef.current);
    }, wait);

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, isDirty, debounceMs, maxWaitMs]);

  return { cancelPending };
}