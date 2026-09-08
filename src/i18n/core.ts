import { EN_TRANSLATIONS, ES_TRANSLATIONS, type TranslationCatalog, type TranslationKey } from "./translations";

export const SUPPORTED_LOCALES = ["es", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const BASE_LOCALE: Locale = "es";
export const DEFAULT_LOCALE: Locale = BASE_LOCALE;

export type TranslationParams = Readonly<Record<string, string | number>>;
export type Translate = (key: TranslationKey, params?: TranslationParams) => string;

export const isLocale = (value: unknown): value is Locale =>
  typeof value === "string" && SUPPORTED_LOCALES.includes(value as Locale);

export const normalizeLocale = (value: unknown): Locale => isLocale(value) ? value : DEFAULT_LOCALE;

export const CATALOGS: Readonly<Record<Locale, TranslationCatalog>> = {
  es: ES_TRANSLATIONS,
  en: EN_TRANSLATIONS,
};

export function translate(locale: Locale, key: TranslationKey, params?: TranslationParams): string {
  const template = CATALOGS[locale][key] ?? CATALOGS[BASE_LOCALE][key] ?? key;
  return Object.entries(params ?? {}).reduce(
    (result, [name, replacement]) => result.split(`{${name}}`).join(String(replacement)),
    template,
  );
}

export const createTranslator = (locale: Locale): Translate =>
  (key, params) => translate(locale, key, params);
