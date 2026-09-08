import { DEFAULT_LOCALE, isLocale, type Locale } from "./core";

export const GLOBAL_LOCALE_STORAGE_KEY = "hisfuture.locale";
export const projectLocaleStorageKey = (projectKey: string) => `hisfuture.project.locale.${projectKey}`;

export interface LocaleStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const readStoredLocale = (storage: LocaleStorage, key: string): Locale | null => {
  try {
    const stored = storage.getItem(key);
    return isLocale(stored) ? stored : null;
  } catch {
    return null;
  }
};

export const getInitialLocale = (storage: LocaleStorage, projectKey?: string): Locale => {
  const projectLocale = projectKey
    ? readStoredLocale(storage, projectLocaleStorageKey(projectKey))
    : null;
  return projectLocale ?? readStoredLocale(storage, GLOBAL_LOCALE_STORAGE_KEY) ?? DEFAULT_LOCALE;
};

export const cacheLocale = (storage: LocaleStorage, locale: Locale, projectKey?: string) => {
  const keys = projectKey
    ? [projectLocaleStorageKey(projectKey), GLOBAL_LOCALE_STORAGE_KEY]
    : [GLOBAL_LOCALE_STORAGE_KEY];
  for (const key of keys) storage.setItem(key, locale);
};
