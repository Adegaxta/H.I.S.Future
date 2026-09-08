import { EN_CHANGELOG_TRANSLATIONS } from "./catalogs/en/changelog";
import { EN_NODES_TRANSLATIONS } from "./catalogs/en/nodes";
import { EN_SETTINGS_TRANSLATIONS } from "./catalogs/en/settings";
import { EN_WORKSPACE_TRANSLATIONS } from "./catalogs/en/workspace";
import { EN_EDITOR_TRANSLATIONS } from "./catalogs/en/editor";
import { EN_HOME_TRANSLATIONS } from "./catalogs/en/home";
import { EN_NODES_UI_TRANSLATIONS } from "./catalogs/en/nodes-ui";
import { EN_SHELL_TRANSLATIONS } from "./catalogs/en/shell";
import { ES_CHANGELOG_TRANSLATIONS } from "./catalogs/es/changelog";
import { ES_NODES_TRANSLATIONS } from "./catalogs/es/nodes";
import { ES_SETTINGS_TRANSLATIONS } from "./catalogs/es/settings";
import { ES_WORKSPACE_TRANSLATIONS } from "./catalogs/es/workspace";
import { ES_EDITOR_TRANSLATIONS } from "./catalogs/es/editor";
import { ES_HOME_TRANSLATIONS } from "./catalogs/es/home";
import { ES_NODES_UI_TRANSLATIONS } from "./catalogs/es/nodes-ui";
import { ES_SHELL_TRANSLATIONS } from "./catalogs/es/shell";

export const ES_TRANSLATIONS = {
  ...ES_WORKSPACE_TRANSLATIONS,
  ...ES_HOME_TRANSLATIONS,
  ...ES_SHELL_TRANSLATIONS,
  ...ES_EDITOR_TRANSLATIONS,
  ...ES_NODES_UI_TRANSLATIONS,
  ...ES_SETTINGS_TRANSLATIONS,
  ...ES_NODES_TRANSLATIONS,
  ...ES_CHANGELOG_TRANSLATIONS,
} as const;

export type TranslationKey = keyof typeof ES_TRANSLATIONS;
export type TranslationCatalog = Record<TranslationKey, string>;

export const EN_TRANSLATIONS = {
  ...EN_WORKSPACE_TRANSLATIONS,
  ...EN_HOME_TRANSLATIONS,
  ...EN_SHELL_TRANSLATIONS,
  ...EN_EDITOR_TRANSLATIONS,
  ...EN_NODES_UI_TRANSLATIONS,
  ...EN_SETTINGS_TRANSLATIONS,
  ...EN_NODES_TRANSLATIONS,
  ...EN_CHANGELOG_TRANSLATIONS,
} as const satisfies TranslationCatalog;
