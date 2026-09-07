export const normalizeSearchText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export const SLASH_COMMANDS = [
  { id: "p", label: "Texto predeterminado", tag: "P", icon: "¶", category: "Texto" },
  { id: "h1", label: "Título 1", tag: "H1", icon: "H1", category: "Texto" },
  { id: "h2", label: "Título 2", tag: "H2", icon: "H2", category: "Texto" },
  { id: "h3", label: "Título 3", tag: "H3", icon: "H3", category: "Texto" },
  { id: "h4", label: "Título 4", tag: "H4", icon: "H4", category: "Texto" },
  { id: "ul", label: "Lista con viñetas", tag: "UL", icon: "•", category: "Texto" },
  { id: "color", label: "Color", tag: "COLOR", icon: "◉", category: "Texto" },
  { id: "divider", label: "Divisor", tag: "DIVISOR", icon: "—", category: "Etc" },
  { id: "index", label: "Índice", tag: "INDICE", icon: "≡", category: "Etc", aliases: ["indice"] },
  { id: "globe", label: "Globo", tag: "GLOBO", icon: "◉", category: "Etc" },
  { id: "globe-individual", label: "Globo individual", tag: "GLOBO_INDIVIDUAL", icon: "◎", category: "Etc" },
  { id: "calendar", label: "Calendario", tag: "CALENDARIO", icon: "▦", category: "Nodos", aliases: ["calendario"] },
] as const;
export const SLASH_REGISTRY = {
  all: () => [...SLASH_COMMANDS],
  get: (tag: string) => SLASH_COMMANDS.find((command) => command.tag === tag),
};
