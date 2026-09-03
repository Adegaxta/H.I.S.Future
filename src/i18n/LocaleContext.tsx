import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { EN_TRANSLATIONS, ES_TRANSLATIONS, type TranslationKey } from "./translations";
import { getProjectSetting, setProjectSetting } from "../project/settingsRepository";

export type Locale = "es" | "en";
type TranslationParams = Record<string, string | number>;
type Translate = (key: TranslationKey, params?: TranslationParams) => string;

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => Promise<void>;
  t: Translate;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

const isLocale = (value: string | null): value is Locale => value === "es" || value === "en";

export function ProjectLocaleProvider({ projectKey, children }: { projectKey: string; children: ReactNode }) {
  const storageKey = `hisfuture.project.locale.${projectKey}`;
  const [locale, setLocaleState] = useState<Locale>(() => {
    const stored = localStorage.getItem(storageKey);
    return isLocale(stored) ? stored : "es";
  });

  useEffect(() => {
    let active = true;
    void getProjectSetting("locale").then((stored) => {
      if (active && isLocale(stored)) {
        localStorage.setItem(storageKey, stored);
        setLocaleState(stored);
      }
    }).catch((error) => console.warn("Could not load project locale", error));
    return () => { active = false; };
  }, [storageKey]);

  const value = useMemo<LocaleContextValue>(() => {
    const dictionary = locale === "en" ? EN_TRANSLATIONS : ES_TRANSLATIONS;
    return {
      locale,
      setLocale: async (nextLocale) => {
        await setProjectSetting("locale", nextLocale);
        localStorage.setItem(storageKey, nextLocale);
        setLocaleState(nextLocale);
      },
      t: (key, params) => {
        const template = dictionary[key] ?? ES_TRANSLATIONS[key] ?? key;
        return Object.entries(params ?? {}).reduce(
          (result, [name, replacement]) => result.split(`{${name}}`).join(String(replacement)),
          template,
        );
      },
    };
  }, [locale, storageKey]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useLocale must be used inside ProjectLocaleProvider");
  return context;
}

export type { Translate };
