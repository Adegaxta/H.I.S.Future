import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getProjectSetting, setProjectSetting } from "../project/settingsRepository";
import { createTranslator, isLocale, type Locale, type Translate } from "./core";
import { cacheLocale, getInitialLocale } from "./persistence";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => Promise<void>;
  t: Translate;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ projectKey, children }: { projectKey?: string; children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => getInitialLocale(localStorage, projectKey));

  useEffect(() => {
    if (!projectKey) return;
    let active = true;
    void getProjectSetting("locale").then((stored) => {
      if (active && isLocale(stored)) {
        try {
          cacheLocale(localStorage, stored, projectKey);
        } catch (error) {
          console.warn("Could not cache locale preference", error);
        }
        setLocaleState(stored);
      }
    }).catch((error) => console.warn("Could not load project locale", error));
    return () => { active = false; };
  }, [projectKey]);

  const setLocale = useCallback(async (nextLocale: Locale) => {
    if (!isLocale(nextLocale)) return;
    if (projectKey) await setProjectSetting("locale", nextLocale);
    try {
      cacheLocale(localStorage, nextLocale, projectKey);
    } catch (error) {
      console.warn("Could not cache locale preference", error);
    }
    setLocaleState(nextLocale);
  }, [projectKey]);

  const value = useMemo<LocaleContextValue>(() => {
    return {
      locale,
      setLocale,
      t: createTranslator(locale),
    };
  }, [locale, setLocale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export const ProjectLocaleProvider = LocaleProvider;

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useLocale must be used inside ProjectLocaleProvider");
  return context;
}

export type { Locale, Translate } from "./core";
