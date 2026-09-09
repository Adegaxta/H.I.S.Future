import type { TranslationKey } from "../i18n/translations";

export const SLASH_COMMANDS = [
  { id: "p", labelKey: "editor.commands.paragraph", tag: "P", icon: "¶", categoryKey: "editor.commands.text" },
  { id: "h1", labelKey: "editor.commands.heading1", tag: "H1", icon: "H1", categoryKey: "editor.commands.text" },
  { id: "h2", labelKey: "editor.commands.heading2", tag: "H2", icon: "H2", categoryKey: "editor.commands.text" },
  { id: "h3", labelKey: "editor.commands.heading3", tag: "H3", icon: "H3", categoryKey: "editor.commands.text" },
  { id: "h4", labelKey: "editor.commands.heading4", tag: "H4", icon: "H4", categoryKey: "editor.commands.text" },
  { id: "ul", labelKey: "editor.commands.bullets", tag: "UL", icon: "•", categoryKey: "editor.commands.text" },
  { id: "color", labelKey: "editor.commands.color", tag: "COLOR", icon: "◉", categoryKey: "editor.commands.text" },
  { id: "divider", labelKey: "editor.commands.divider", tag: "DIVISOR", icon: "—", categoryKey: "editor.commands.other" },
  { id: "index", labelKey: "editor.commands.index", tag: "INDICE", icon: "≡", categoryKey: "editor.commands.other", aliases: ["indice"] },
  { id: "globe", labelKey: "editor.commands.globe", tag: "GLOBO", icon: "◉", categoryKey: "editor.commands.other" },
  { id: "globe-individual", labelKey: "editor.commands.individualGlobe", tag: "GLOBO_INDIVIDUAL", icon: "◎", categoryKey: "editor.commands.other" },
  { id: "calendar", labelKey: "editor.commands.calendar", tag: "CALENDARIO", icon: "▦", categoryKey: "editor.commands.nodes", aliases: ["calendario"] },
] as const satisfies readonly { id: string; labelKey: TranslationKey; tag: string; icon: string; categoryKey: TranslationKey; aliases?: readonly string[] }[];
export const SLASH_REGISTRY = {
  all: () => [...SLASH_COMMANDS],
  get: (tag: string) => SLASH_COMMANDS.find((command) => command.tag === tag),
};
