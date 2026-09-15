import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { isDesktopRuntime } from "../project/runtime";
import { DEFAULT_LOCALE } from "../i18n/core";
import { clearPresence, updatePresence } from "../utils/discordPresence";
import { presenceActivityFingerprint, projectPresence } from "./projectPresence";
import type { PresenceContextState } from "./types";

interface PresenceContextValue {
  setPresence: (context: PresenceContextState) => void;
}

const PresenceContext = createContext<PresenceContextValue | null>(null);

export function PresenceProvider({ children }: { children: ReactNode }) {
  const [context, setContext] = useState<PresenceContextState>({
    surface: "home",
    locale: DEFAULT_LOCALE,
  });
  const lastActivityRef = useRef<string | null>(null);

  const setPresence = useCallback((next: PresenceContextState) => {
    setContext((current) =>
      current.surface === next.surface
        && current.nodeType === next.nodeType
        && current.locale === next.locale
        ? current
        : next,
    );
  }, []);

  const activity = useMemo(() => projectPresence(context), [context]);
  useEffect(() => {
    if (!isDesktopRuntime()) return;
    const serialized = presenceActivityFingerprint(activity);
    if (lastActivityRef.current === serialized) return;
    const timer = window.setTimeout(() => {
      lastActivityRef.current = serialized;
      void updatePresence(activity);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [activity]);

  useEffect(() => () => {
    if (isDesktopRuntime()) void clearPresence();
  }, []);

  const value = useMemo<PresenceContextValue>(() => ({ setPresence }), [setPresence]);
  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}

export function usePresence() {
  const value = useContext(PresenceContext);
  if (!value) throw new Error("usePresence requiere PresenceProvider.");
  return value;
}
