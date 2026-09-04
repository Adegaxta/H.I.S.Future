import draftAsset from "../assets/icons/draft.svg";
import {
  EDITOR_BACKGROUND_COLORS,
  EDITOR_TEXT_COLORS,
} from "../defs/palette";

const SAFE_URL = /^(https?:|data:image\/|blob:)/i;

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character,
  );
}

export function isSafeUrl(value: string): boolean {
  return SAFE_URL.test(value);
}

const CALLOUT_COLORS: Record<string, string> = {
  "🟣": "#b86cff",
  "❤️": "#ff3f91",
  "⚪": "#e8e9ea",
  "🔵": "#4d94d8",
  "🟢": "#4dd8a0",
  "🟡": "#d8b34d",
  "🟠": "#ff8a4d",
  "🔴": "#e84d68",
};

const HIS_COLOR_NAMES: Record<string, string> = {
  white: "#E8E9EA",
  default: "#E8E9EA",
  primary: "#E8E9EA",
  secondary: "#A7A9AC",
  tertiary: "#A7A9AC",
  muted: "#A7A9AC",
  ...EDITOR_TEXT_COLORS,
  rojo: EDITOR_TEXT_COLORS.red,
  naranja: EDITOR_TEXT_COLORS.orange,
  amarillo: EDITOR_TEXT_COLORS.yellow,
  verde: EDITOR_TEXT_COLORS.green,
  azul: EDITOR_TEXT_COLORS.blue,
  morado: EDITOR_TEXT_COLORS.purple,
  violet: EDITOR_TEXT_COLORS.purple,
  violeta: EDITOR_TEXT_COLORS.purple,
  rosa: EDITOR_TEXT_COLORS.pink,
  cyan: EDITOR_TEXT_COLORS.teal,
  turquesa: EDITOR_TEXT_COLORS.teal,
  lime: EDITOR_TEXT_COLORS.green,
  magenta: EDITOR_TEXT_COLORS.pink,
  fuchsia: EDITOR_TEXT_COLORS.pink,
  marron: EDITOR_TEXT_COLORS.brown,
  black: "#E8E9EA",
  negro: "#E8E9EA",
  gris: EDITOR_TEXT_COLORS.grey,
};

const HIS_BACKGROUND_COLORS: Record<string, string> = {
  ...EDITOR_BACKGROUND_COLORS,
  gris: EDITOR_BACKGROUND_COLORS.gray,
  marron: EDITOR_BACKGROUND_COLORS.brown,
  naranja: EDITOR_BACKGROUND_COLORS.orange,
  amarillo: EDITOR_BACKGROUND_COLORS.yellow,
  verde: EDITOR_BACKGROUND_COLORS.green,
  azul: EDITOR_BACKGROUND_COLORS.blue,
  morado: EDITOR_BACKGROUND_COLORS.purple,
  violet: EDITOR_BACKGROUND_COLORS.purple,
  violeta: EDITOR_BACKGROUND_COLORS.purple,
  rosa: EDITOR_BACKGROUND_COLORS.pink,
  magenta: EDITOR_BACKGROUND_COLORS.pink,
  fuchsia: EDITOR_BACKGROUND_COLORS.pink,
  cyan: EDITOR_BACKGROUND_COLORS.green,
  turquesa: EDITOR_BACKGROUND_COLORS.green,
  teal: EDITOR_BACKGROUND_COLORS.green,
  lime: EDITOR_BACKGROUND_COLORS.green,
  rojo: EDITOR_BACKGROUND_COLORS.red,
  black: "#2A2E33",
  negro: "#2A2E33",
};

export function formatPastedText(text: string): string {
  const cssEnd = text.indexOf("ul { margin: 0px; }");
  const source = cssEnd >= 0 ? text.slice(cssEnd + "ul { margin: 0px; }".length) : text;
  const decoded = new DOMParser().parseFromString(source, "text/html").body.textContent || source;
  const separated = decoded
    .replace(/\r/g, "")
    .replace(/(?<!^)\s*(?=(?:🟣|❤️|⚪|🔵|🟢|🟡|🟠|🔴)(?:Eventos|Texto descriptivo|Necesario|Catalizador|Muy Importante|Importante|Poco relevante|Relleno))/gu, "\n")
    .replace(/(?<!^)\s*(?=(?:Resumen|Índice|Leyenda de Utilidad en el Lore):?\s)/giu, "\n")
    .replace(/(?<!^)\s*(?=\d+(?:\.\d+)*\.\s+[A-ZÁÉÍÓÚ])/gu, "\n")
    .replace(/(?<!^)\s*(?=(?:Ubicación|Año):\s)/gu, "\n");
  const lines = separated.split("\n");
  const blocks: string[] = [];
  let listItems: string[] = [];
  const flushList = () => {
    if (listItems.length) blocks.push(`<ul>${listItems.join("")}</ul>`);
    listItems = [];
  };
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      continue;
    }
    const escaped = escapeHtml(line);
    const callout = Object.entries(CALLOUT_COLORS).find(([emoji]) =>
      line.startsWith(emoji),
    );
    if (callout) {
      flushList();
      const [emoji, color] = callout;
      const body = escaped.slice(emoji.length).trim();
      const separator = body.search(/\s(?:—|-|:)\s/);
      const label = separator >= 0 ? body.slice(0, separator) : body;
      const detail = separator >= 0 ? body.slice(separator) : "";
      blocks.push(
        `<div data-globe="true" style="color: ${color}"><span data-globe-icon="true" contenteditable="false">${emoji}</span><div data-globe-content="true"><p><strong>${label}</strong>${detail}</p></div></div>`,
      );
      continue;
    }
    const heading = line.match(/^(\d+(?:\.\d+)*)\.\s+(.+)$/);
    if (heading) {
      flushList();
      blocks.push(`<h2>${heading[2]}</h2>`);
      continue;
    }
    if (/^(Resumen|Índice|Tabla de Contenido|Tabla de contenidos|Table of Contents|Leyenda de Utilidad en el Lore):?$/i.test(line)) {
      flushList();
      if (/^(Índice|Tabla de Contenido|Tabla de contenidos|Table of Contents)$/i.test(line)) {
        blocks.push('<div data-page-index="true" class="editor-page-index"></div>');
      } else {
        blocks.push(`<h2>${escaped}</h2>`);
      }
      continue;
    }
    if (/^(?:[-*•])\s+/.test(line)) {
      listItems.push(`<li>${escaped.replace(/^(?:[-*•])\s+/, "")}</li>`);
      continue;
    }
    flushList();
    blocks.push(`<p>${escaped}</p>`);
  }
  flushList();
  return blocks.join("");
}

function safeColor(value: string): string | null {
  const probe = document.createElement("span");
  probe.style.color = "";
  probe.style.color = value.trim();
  return probe.style.color && !/[{};]|url\s*\(/i.test(value)
    ? probe.style.color
    : null;
}

function resolveAnytypeColor(value: string, property = "color"): string | null {
  const normalized = value.trim().toLowerCase().replace(/[_-]+/g, " ");
  const semanticName = normalized.match(/\b(white|default|primary|secondary|tertiary|muted|red|rojo|orange|naranja|yellow|amarillo|green|verde|blue|azul|purple|morado|violet|violeta|pink|rosa|cyan|turquesa|teal|lime|magenta|fuchsia|brown|marron|black|negro|gray|grey|gris)\b/)?.[1];
  if (semanticName) {
    if (property === "background" || property === "background-color") {
      return HIS_BACKGROUND_COLORS[semanticName] || null;
    }
    return HIS_COLOR_NAMES[semanticName] || null;
  }
  if (/\b(?:transparent|none|currentcolor|inherit)\b/i.test(normalized)) {
    return safeColor(value);
  }
  return safeColor(value);
}

function isLightBackground(value: string): boolean {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "");
  return normalized === "white" ||
    normalized === "#fff" ||
    normalized === "#ffffff" ||
    normalized === "rgb(255,255,255)" ||
    normalized === "rgba(255,255,255,1)" ||
    normalized === "rgb(250,250,250)" ||
    normalized === "rgb(248,248,248)";
}

function safeInlineStyle(style: string, element?: HTMLElement): string {
  const declarations = style.split(";").flatMap((declaration) => {
    const [property, ...parts] = declaration.split(":");
    const value = parts.join(":").trim();
    if (!property || !value) return [];
    const normalized = property.trim().toLowerCase();
    if (normalized === "color" || normalized === "background-color" || normalized === "background") {
      if ((normalized === "background" || normalized === "background-color") && isLightBackground(value)) return [];
      const color = resolveAnytypeColor(value, normalized);
      if ((normalized === "background" || normalized === "background-color") && (!color || isLightBackground(color))) return [];
      return color ? [`${normalized}: ${color}`] : [];
    }
    if (normalized.startsWith("--") && /(?:^|-)color(?:-|$)|background/i.test(normalized)) {
      const targetProperty = /background/i.test(normalized) ? "background-color" : "color";
      if (targetProperty === "background-color" && isLightBackground(value)) return [];
      const color = resolveAnytypeColor(value, targetProperty);
      if (targetProperty === "background-color" && isLightBackground(color || "")) return [];
      return color ? [`${targetProperty}: ${color}`] : [];
    }
      if (normalized === "text-align" && ["left", "center", "right"].includes(value.toLowerCase()))
        return [`text-align: ${value.toLowerCase()}`];
      return [];
  });
  let result = declarations;
  if (element) {
    const className = typeof element.className === "string" ? element.className : "";
    // Anytype marca los colores con clases tipo "textColor-red" / "bgColor-yellow" (sin separador),
    // así que se extraen explícitamente en vez de depender solo de la regex de "clase de fondo".
    const anytypeTextClass = className.match(/(?:^|[\s_-])text-?color-([a-z]+)(?:[\s_-]|$)/i)?.[1]?.toLowerCase();
    const anytypeBgClass = className.match(/(?:^|[\s_-])(?:bg|background)-?color-([a-z]+)(?:[\s_-]|$)/i)?.[1]?.toLowerCase() ||
      className.match(/(?:^|[\s_-])highlight-([a-z]+)(?:[\s_-]|$)/i)?.[1]?.toLowerCase();
    const hasBackgroundClass = Boolean(anytypeBgClass) ||
      /(?:^|[\s_-])(?:bg|background|highlight)(?:[\s_-]|$)/i.test(className);

    result = result.filter((declaration) => {
      if (anytypeTextClass && declaration.startsWith("color:")) return false;
      if (anytypeBgClass && declaration.startsWith("background")) return false;
      return true;
    });

    if (anytypeTextClass) {
      const resolved = HIS_COLOR_NAMES[anytypeTextClass];
      if (resolved) result.push(`color: ${resolved}`);
    } else if (!result.some((declaration) => declaration.startsWith("color:"))) {
      const textColor = element.getAttribute("data-color") ||
        element.getAttribute("data-text-color") ||
        element.getAttribute("data-foreground-color") ||
        (!hasBackgroundClass ? className : "");
      const resolved = textColor ? resolveAnytypeColor(textColor, "color") : null;
      if (resolved) result.push(`color: ${resolved}`);
    }

    if (anytypeBgClass) {
      const resolved = HIS_BACKGROUND_COLORS[anytypeBgClass];
      if (resolved) result.push(`background-color: ${resolved}`);
    } else if (!result.some((declaration) => declaration.startsWith("background"))) {
      const backgroundColor = element.getAttribute("data-background-color") ||
        element.getAttribute("data-bg-color") ||
        element.getAttribute("data-highlight-color") ||
        (hasBackgroundClass ? className : "");
      const resolved = backgroundColor ? resolveAnytypeColor(backgroundColor, "background-color") : null;
      if (resolved) result.push(`background-color: ${resolved}`);
    }
  }
  return result.join("; ");
}

function safeGlobeStyle(style: string, element: HTMLElement): string {
  return safeInlineStyle(style, element)
    .split(";")
    .map((declaration) => declaration.trim())
    .filter((declaration) => declaration && !declaration.startsWith("background"))
    .join("; ");
}

function hasCalloutStyle(element: HTMLElement): boolean {
  const style = element.getAttribute("style") || "";
  const hasBackground = /background(?:-color)?\s*:\s*(?!transparent\b|none\b)[^;]+/i.test(style);
  const hasRounding = /border-radius\s*:\s*[^;]+/i.test(style);
  const hasPadding = /padding\s*:\s*[^;]+/i.test(style);
  return hasBackground && (hasRounding || hasPadding);
}

function applyCopiedStyles(source: Document): void {
  const inlineProperties = new WeakMap<HTMLElement, Set<string>>();
  source.querySelectorAll<HTMLElement>("[style]").forEach((element) => {
    inlineProperties.set(
      element,
      new Set(Array.from(element.style).map((property) => property.toLowerCase())),
    );
  });

  source.querySelectorAll("style").forEach((styleElement) => {
    const css = (styleElement.textContent || "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\s+/g, " ");
    const rules = /([^{}]+)\{([^{}]*)\}/g;
    let match: RegExpExecArray | null;
    while ((match = rules.exec(css))) {
      const selectorText = match[1].trim();
      if (!selectorText || selectorText.startsWith("@")) continue;
      const declarations = match[2].split(";").flatMap((declaration) => {
        const [property, ...parts] = declaration.split(":");
        const value = parts.join(":").trim();
        return property?.trim() && value
          ? [{ property: property.trim().toLowerCase(), value }]
          : [];
      });
      if (!declarations.length) continue;

      selectorText.split(",").forEach((selector) => {
        let elements: NodeListOf<HTMLElement>;
        try {
          elements = source.querySelectorAll<HTMLElement>(selector.trim());
        } catch {
          return;
        }
        elements.forEach((element) => {
          const protectedProperties = inlineProperties.get(element) || new Set<string>();
          declarations.forEach(({ property, value }) => {
            if (protectedProperties.has(property)) return;
            element.style.setProperty(property, value);
          });
          inlineProperties.set(element, protectedProperties);
        });
      });
    }
  });
}

function isCallout(element: HTMLElement): boolean {
  const marker = `${element.className} ${element.getAttribute("data-block-type") || ""}`;
  return /callout|globe|toggle|highlight-block|card|note|quote/i.test(marker) || hasCalloutStyle(element);
}

function getAnytypeMarker(element: HTMLElement): string {
  const direct = [
    element.getAttribute("data-block-type"),
    element.getAttribute("data-type"),
    element.getAttribute("data-toc"),
    element.getAttribute("data-index"),
    element.getAttribute("id"),
    element.getAttribute("role"),
    element.getAttribute("aria-label"),
    element.className,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return `${direct} ${element.tagName}`.toLowerCase();
}

function anytypeIndexToHtml(element: HTMLElement): string | null {
  const marker = getAnytypeMarker(element);
  const text = (element.textContent || "").replace(/\s+/g, " ").trim();
  const directChildren = Array.from(element.children) as HTMLElement[];
  const isIndexHeading = (child: HTMLElement) =>
    /^(?:índice|index|table of contents|tabla de contenido|contenido|sumario)$/i.test(child.textContent?.replace(/\s+/g, " ").trim() || "");
  const indexHeading = directChildren.some((child) =>
    (["H1", "H2", "H3", "H4", "H5", "H6", "STRONG", "B"].includes(child.tagName) || child.getAttribute("role") === "heading") &&
    isIndexHeading(child),
  );
  const nestedIndexHeading = directChildren.some((child) =>
    Array.from(child.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6, strong, b, [role='heading']"))
      .some(isIndexHeading),
  );
  const isDirectIndexHeading = indexHeading;
  const hasDirectIndexItems = directChildren.some((child) =>
    ["OL", "UL"].includes(child.tagName) ||
    child.matches("a, [data-index-item], [data-toc-item]") ||
    Boolean(child.querySelector("a, [data-index-item], [data-toc-item]")),
  );
  const isIndexContainer = element.matches("[data-page-index], [data-index], [data-toc], .toc, .table-of-contents, .page-index");
  const hasIndexItems = Boolean(element.querySelector("ol, ul, [data-index-item], [data-toc-item]"));
  const isIndexLike = /table[-_ ]of[-_ ]contents|toc|index|outline|summary|page[-_ ]index|contents/.test(marker) ||
    /^(?:índice|index|table of contents|tabla de contenido|contenido|sumario)$/i.test(text) ||
    isIndexContainer ||
    ((isDirectIndexHeading || nestedIndexHeading) && (hasDirectIndexItems || hasIndexItems));
  if (!isIndexLike) return null;
  const semanticItems = Array.from(
    element.querySelectorAll<HTMLElement>("li, a, [data-index-item], [data-toc-item]"),
  );
  const items = (semanticItems.length ? semanticItems : Array.from(
    element.querySelectorAll<HTMLElement>("p, div"),
  ))
    .map((item) => item.textContent?.replace(/\s+/g, " ").trim() ?? "")
    .filter((label) => label.length > 1 && !/^\d+\.?\s*$/.test(label))
    .filter((label, index, list) => list.indexOf(label) === index)
    .slice(0, 24);

  if (!items.length) return null;

  const rows = items
    .map((label) => 
      `<div data-page-index-item="true" class="editor-page-index__item"><span class="editor-page-index__marker">•</span><span class="editor-page-index__label">${escapeHtml(label)}</span></div>`,
    )
    .join("");

  return `<div data-page-index="true" class="editor-page-index">${rows}</div>`;
}

// Numeric values fixed by Anytype's own protobuf schema (Block.Content.Text.Mark.Type / Style),
// not arbitrary — see anytype-heart's models.proto.
const ANYTYPE_MARK_TYPE = {
  Strikethrough: 0,
  Keyboard: 1,
  Italic: 2,
  Bold: 3,
  Underscored: 4,
  Link: 5,
  TextColor: 6,
  BackgroundColor: 7,
  Mention: 8,
  Emoji: 9,
  Object: 10,
} as const;

const ANYTYPE_BLOCK_STYLE = {
  Paragraph: 0,
  Header1: 1,
  Header2: 2,
  Header3: 3,
  Header4: 4,
  Quote: 5,
  Code: 6,
  Title: 7,
  Checkbox: 8,
  Marked: 9,
  Numbered: 10,
  Callout: 13,
  ToggleHeader1: 14,
  ToggleHeader2: 15,
  ToggleHeader3: 16,
} as const;

interface AnytypeMark {
  type: number;
  param?: string;
  range: { from: number; to: number };
}

interface AnytypeTextContent {
  text: string;
  style?: number;
  marks?: AnytypeMark[];
  color?: string;
  iconEmoji?: string;
}

interface AnytypeBlock {
  id: string;
  type: string;
  childrenIds?: string[];
  content?: unknown;
  bgColor?: string;
  backgroundColor?: string;
}

interface AnytypeTextBlock extends AnytypeBlock {
  content: AnytypeTextContent;
}

interface AnytypeClipboard {
  blocks: AnytypeBlock[];
}

function isAnytypeRange(value: unknown): value is { from: number; to: number } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).from === "number" &&
    typeof (value as Record<string, unknown>).to === "number"
  );
}

function isAnytypeMark(value: unknown): value is AnytypeMark {
  if (typeof value !== "object" || value === null) return false;
  const mark = value as Record<string, unknown>;
  return (
    typeof mark.type === "number" &&
    isAnytypeRange(mark.range) &&
    (mark.param === undefined || typeof mark.param === "string")
  );
}

function isAnytypeBlock(value: unknown): value is AnytypeBlock {
  if (typeof value !== "object" || value === null) return false;
  const block = value as Record<string, unknown>;
  return (
    typeof block.id === "string" &&
    typeof block.type === "string" &&
    (block.childrenIds === undefined ||
      (Array.isArray(block.childrenIds) && block.childrenIds.every((id) => typeof id === "string"))) &&
    (block.content === undefined || (typeof block.content === "object" && block.content !== null)) &&
    (block.bgColor === undefined || typeof block.bgColor === "string") &&
    (block.backgroundColor === undefined || typeof block.backgroundColor === "string")
  );
}

function isAnytypeTextBlock(block: AnytypeBlock): block is AnytypeTextBlock {
  if (block.type !== "text" || typeof block.content !== "object" || block.content === null) return false;
  const content = block.content as Record<string, unknown>;
  if (typeof content.text !== "string") return false;
  if (content.style !== undefined && typeof content.style !== "number") return false;
  if (content.color !== undefined && typeof content.color !== "string") return false;
  if (content.iconEmoji !== undefined && typeof content.iconEmoji !== "string") return false;
  if (content.marks !== undefined && (!Array.isArray(content.marks) || !content.marks.every(isAnytypeMark)))
    return false;
  return true;
}

function isAnytypeImageBlock(block: AnytypeBlock): boolean {
  if (block.type !== "file" || typeof block.content !== "object" || block.content === null)
    return false;
  const content = block.content as Record<string, unknown>;
  // Anytype's FileTypeImage enum value in the captured clipboard payload.
  return content.type === 2;
}

function isAnytypeClipboard(value: unknown): value is AnytypeClipboard {
  if (typeof value !== "object" || value === null) return false;
  const payload = value as Record<string, unknown>;
  return (
    Array.isArray(payload.blocks) &&
    payload.blocks.length > 0 &&
    payload.blocks.every(isAnytypeBlock) &&
    payload.blocks.some(isAnytypeTextBlock)
  );
}

function anytypeMarksToHtml(text: string, marks: AnytypeMark[]): string {
  const relevantTypes: number[] = [
    ANYTYPE_MARK_TYPE.Strikethrough,
    ANYTYPE_MARK_TYPE.Keyboard,
    ANYTYPE_MARK_TYPE.Italic,
    ANYTYPE_MARK_TYPE.Bold,
    ANYTYPE_MARK_TYPE.Underscored,
    ANYTYPE_MARK_TYPE.TextColor,
    ANYTYPE_MARK_TYPE.BackgroundColor,
    ANYTYPE_MARK_TYPE.Mention,
  ];
  const relevant = marks.filter(
    (mark) =>
      relevantTypes.includes(mark.type) &&
      mark.range.from >= 0 &&
      mark.range.to <= text.length &&
      mark.range.from < mark.range.to,
  );
  if (!relevant.length) return escapeHtml(text);
  const borders = Array.from(
    new Set(relevant.flatMap((mark) => [mark.range.from, mark.range.to]).concat([0, text.length])),
  ).sort((a, b) => a - b);
  let html = "";
  let openMention: AnytypeMark | null = null;
  for (let i = 0; i < borders.length - 1; i++) {
    const from = borders[i];
    const to = borders[i + 1];
    if (from >= to) continue;
    const active = relevant.filter((mark) => mark.range.from <= from && mark.range.to >= to);
    const mention = active.find((mark) => mark.type === ANYTYPE_MARK_TYPE.Mention) || null;
    if (mention !== openMention) {
      if (openMention) html += "</span>";
      if (mention) html += '<span data-anytype-mention="true">';
      openMention = mention;
    }
    let piece = escapeHtml(text.slice(from, to));
    if (active.some((mark) => mark.type === ANYTYPE_MARK_TYPE.Keyboard)) piece = `<code>${piece}</code>`;
    if (active.some((mark) => mark.type === ANYTYPE_MARK_TYPE.Italic)) piece = `<em>${piece}</em>`;
    if (active.some((mark) => mark.type === ANYTYPE_MARK_TYPE.Underscored)) piece = `<u>${piece}</u>`;
    if (active.some((mark) => mark.type === ANYTYPE_MARK_TYPE.Strikethrough)) piece = `<s>${piece}</s>`;
    if (active.some((mark) => mark.type === ANYTYPE_MARK_TYPE.Bold)) piece = `<strong>${piece}</strong>`;
    const styleParts: string[] = [];
    const textColorParam = active.find((mark) => mark.type === ANYTYPE_MARK_TYPE.TextColor)?.param;
    const bgColorParam = active.find((mark) => mark.type === ANYTYPE_MARK_TYPE.BackgroundColor)?.param;
    const resolvedColor = textColorParam ? HIS_COLOR_NAMES[textColorParam.toLowerCase()] : null;
    const resolvedBackground = bgColorParam ? HIS_BACKGROUND_COLORS[bgColorParam.toLowerCase()] : null;
    if (resolvedColor) styleParts.push(`color: ${resolvedColor}`);
    if (resolvedBackground) styleParts.push(`background-color: ${resolvedBackground}`);
    if (styleParts.length) piece = `<span style="${escapeHtml(styleParts.join("; "))}">${piece}</span>`;
    html += piece;
  }
  if (openMention) html += "</span>";
  return html;
}

function anytypeBlockToHtml(
  block: AnytypeTextBlock,
  blocksById: ReadonlyMap<string, AnytypeBlock>,
  ancestors: ReadonlySet<string> = new Set(),
): string {
  const content = block.content;
  const text = content.text;
  const marks = Array.isArray(content.marks) ? content.marks : [];
  let inner = anytypeMarksToHtml(text, marks) || "<br>";
  const blockStyleParts: string[] = [];
  const resolvedBlockColor = content.color ? HIS_COLOR_NAMES[content.color.toLowerCase()] : null;
  const bgToken = block.bgColor || block.backgroundColor;
  const resolvedBlockBackground = bgToken ? HIS_BACKGROUND_COLORS[bgToken.toLowerCase()] : null;
  if (resolvedBlockColor) blockStyleParts.push(`color: ${resolvedBlockColor}`);
  if (resolvedBlockBackground) blockStyleParts.push(`background-color: ${resolvedBlockBackground}`);
  const blockStyle = blockStyleParts.length
    ? ` style="${escapeHtml(blockStyleParts.join("; "))}"`
    : "";
  switch (content.style) {
    case ANYTYPE_BLOCK_STYLE.Header1:
    case ANYTYPE_BLOCK_STYLE.Title:
    case ANYTYPE_BLOCK_STYLE.ToggleHeader1:
      return `<h1${blockStyle}>${inner}</h1>`;
    case ANYTYPE_BLOCK_STYLE.Header2:
    case ANYTYPE_BLOCK_STYLE.ToggleHeader2:
      return `<h2${blockStyle}>${inner}</h2>`;
    case ANYTYPE_BLOCK_STYLE.Header3:
    case ANYTYPE_BLOCK_STYLE.ToggleHeader3:
      return `<h3${blockStyle}>${inner}</h3>`;
    case ANYTYPE_BLOCK_STYLE.Quote:
      return `<blockquote${blockStyle}>${inner}</blockquote>`;
    case ANYTYPE_BLOCK_STYLE.Code:
      return `<pre${blockStyle}><code>${inner}</code></pre>`;
    case ANYTYPE_BLOCK_STYLE.Marked:
      return `<ul><li${blockStyle}>${inner}</li></ul>`;
    case ANYTYPE_BLOCK_STYLE.Numbered:
      return `<ol><li${blockStyle}>${inner}</li></ol>`;
    case ANYTYPE_BLOCK_STYLE.Callout: {
      const icon = content.iconEmoji
        ? `<span data-globe-icon="true" contenteditable="false">${escapeHtml(content.iconEmoji)}</span>`
        : "";
      const nextAncestors = new Set(ancestors).add(block.id);
      const children = (block.childrenIds || [])
        .map((id) => blocksById.get(id))
        .filter((child): child is AnytypeBlock => child !== undefined)
        .filter((child) => !nextAncestors.has(child.id))
        .map((child) => anytypeStructuralBlockToHtml(child, blocksById, nextAncestors))
        .join("");
      return `<div data-globe="true"${blockStyle}>${icon}<div data-globe-content="true"><p>${inner}</p>${children}</div></div>`;
    }
    default:
      return `<p${blockStyle}>${inner}</p>`;
  }
}

function anytypeStructuralBlockToHtml(
  block: AnytypeBlock,
  blocksById: ReadonlyMap<string, AnytypeBlock>,
  ancestors: ReadonlySet<string> = new Set(),
): string {
  if (isAnytypeTextBlock(block)) return anytypeBlockToHtml(block, blocksById, ancestors);
  if (block.type === "div")
    return '<div data-divider="true" contenteditable="false"><hr /></div>';
  if (block.type === "tableOfContents")
    return '<div data-page-index="true" data-page-index-source="anytype"></div>';
  if (isAnytypeImageBlock(block))
    return `<span data-anytype-file-id="${escapeHtml(block.id)}"></span>`;
  return "";
}

/**
 * Parses Anytype's proprietary clipboard payload (the "application/json" flavor it writes
 * alongside text/html — the only flavor that actually carries text/background color).
 * Returns null on any structural mismatch so callers can fall back to the standard text/html path.
 */
export function anytypeClipboardToHtml(json: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isAnytypeClipboard(parsed)) return null;
  const blocksById = new Map(parsed.blocks.map((block) => [block.id, block]));
  const calloutDescendants = new Set<string>();
  const collectDescendants = (block: AnytypeBlock, ancestors: ReadonlySet<string> = new Set()) => {
    if (ancestors.has(block.id)) return;
    const nextAncestors = new Set(ancestors).add(block.id);
    (block.childrenIds || []).forEach((id) => {
      calloutDescendants.add(id);
      const child = blocksById.get(id);
      if (child) collectDescendants(child, nextAncestors);
    });
  };
  parsed.blocks
    .filter(isAnytypeTextBlock)
    .filter((block) => block.content.style === ANYTYPE_BLOCK_STYLE.Callout)
    .forEach((block) => collectDescendants(block));
  const html = parsed.blocks
    .filter((block) => !calloutDescendants.has(block.id))
    .map((block) => anytypeStructuralBlockToHtml(block, blocksById))
    .join("");
  return html || null;
}

function anytypeGlobeToHtml(element: HTMLElement): string | null {
  const marker = getAnytypeMarker(element);
  const hasExplicitIcon = Array.from(element.children).some((child) =>
    child.matches("[data-emoji], [data-callout-icon], .emoji, .icon"),
  );
  const looksLikeGlobe =
    /callout|globe|toggle|card|note|quote|highlight-block|highlight|bubble|pill/i.test(marker) ||
    element.matches("[data-globe], [data-callout], [data-toggle], .globe, .callout, .toggle, .note, .quote, .highlight-block, .card") ||
    hasExplicitIcon ||
    hasCalloutStyle(element);
  if (!looksLikeGlobe) return null;
  const icon =
    element.querySelector<HTMLElement>("[data-emoji], [data-callout-icon], .emoji, .icon, svg, img") ||
    element.querySelector<HTMLElement>("p strong, p b");
  const content = sanitizeEditorHtml(
    Array.from(element.childNodes)
      .filter((child) => child !== icon && !(icon && child instanceof Node && icon.contains(child)))
      .map((child) =>
        child.nodeType === Node.ELEMENT_NODE
          ? (child as HTMLElement).outerHTML
          : escapeHtml(child.textContent || ""),
      )
      .join(""),
  );
  const fallback = element.innerHTML.trim() ? element.innerHTML : "<p>Contenido</p>";
  const iconHtml = icon
    ? sanitizeEditorHtml(icon.outerHTML)
    : `<img src="${draftAsset}" alt="Draft" />`;
  const body = content || fallback;
  const safeStyle = safeGlobeStyle(element.getAttribute("style") || "", element);
  const styleAttribute = safeStyle ? ` style="${escapeHtml(safeStyle)}"` : "";
  return `<div data-globe="true"${styleAttribute}><span data-globe-icon="true" contenteditable="false">${iconHtml}</span><div data-globe-content="true">${body}</div></div>`;
}

export function sanitizeEditorHtml(html: string): string {
  const source = new DOMParser().parseFromString(html, "text/html");
  applyCopiedStyles(source);
  const tags = new Set([
    "A",
    "B",
    "BR",
    "BLOCKQUOTE",
    "CODE",
    "DEL",
    "DIV",
    "EM",
    "FIGURE",
    "FONT",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "HR",
    "IMG",
    "I",
    "LI",
    "MARK",
    "OL",
    "P",
    "PRE",
    "SMALL",
    "S",
    "SPAN",
    "STRONG",
    "SUB",
    "SUP",
    "TABLE",
    "TBODY",
    "TD",
    "TFOOT",
    "TH",
    "THEAD",
    "TR",
    "U",
    "UL",
  ]);
  const attributes = new Set([
    "alt",
    "colspan",
    "data-mention-mode",
    "data-mention-id",
    "data-mention-align",
    "data-no-resize",
    "href",
    "rowspan",
    "src",
    "title",
  ]);
  const visit = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const element = node as HTMLElement;
    if (["STYLE", "SCRIPT", "NOSCRIPT"].includes(element.tagName)) return "";
    if (element.tagName === "DIV") {
      if (element.hasAttribute("data-divider"))
        return '<div data-divider="true" contenteditable="false"><hr /></div>';
      if (element.hasAttribute("data-page-index")) {
        const sourceAttribute = element.getAttribute("data-page-index-source") === "anytype"
          ? ' data-page-index-source="anytype"'
          : "";
        return `<div data-page-index="true"${sourceAttribute}></div>`;
      }
      const isNativeGlobe = element.hasAttribute("data-globe") || element.hasAttribute("data-globe-content");
      const anytypeIndex = isNativeGlobe ? null : anytypeIndexToHtml(element);
      if (anytypeIndex) return anytypeIndex;
      const anytypeGlobe = isNativeGlobe ? null : anytypeGlobeToHtml(element);
      if (anytypeGlobe) return anytypeGlobe;
      if (!isNativeGlobe && isCallout(element)) {
        const icon = element.querySelector<HTMLElement>(
          ".callout-image, [data-callout-icon], [data-globe-icon], img",
        );
        const content = Array.from(element.childNodes)
          .filter((child) => child !== icon && !icon?.contains(child))
          .map(visit)
          .join("");
        const iconContent = icon ? visit(icon) : "";
        const style = safeGlobeStyle(element.getAttribute("style") || "", element);
        const safeStyle = style ? ` style="${escapeHtml(style)}"` : "";
        return `<div data-globe="true"${safeStyle}><span data-globe-icon="true" contenteditable="false">${iconContent || `<img src="${draftAsset}" alt="Draft" />`}</span><div data-globe-content="true">${content}</div></div>`;
      }
    }
    const children = Array.from(element.childNodes).map(visit).join("");
    if (!tags.has(element.tagName)) {
      // Anytype's clipboard keeps color/highlight on non-standard tags like
      // <markupcolor class="textColor-red">, which aren't in the allow-list above.
      const style = safeInlineStyle(element.getAttribute("style") || "", element);
      return style ? `<span style="${escapeHtml(style)}">${children}</span>` : children;
    }
    if (element.tagName === "SPAN" && element.hasAttribute("data-globe-icon")) {
      return `<span data-globe-icon="true" contenteditable="false">${children}</span>`;
    }
    if (element.tagName === "SPAN" && element.hasAttribute("data-anytype-mention")) {
      return `<span data-anytype-mention="true">${children}</span>`;
    }
    if (element.tagName === "SPAN") {
      const mentionId = element.getAttribute("data-mention-id");
      if (mentionId) {
        const mode = element.getAttribute("data-mention-mode") === "full" ? "full" : "inserted";
        const alignment = ["left", "center", "right"].includes(element.getAttribute("data-mention-align") || "")
          ? element.getAttribute("data-mention-align")
          : null;
        const title = element.getAttribute("title");
        const titleAttribute = title ? ` title="${escapeHtml(title)}"` : "";
        const alignmentAttribute = alignment ? ` data-mention-align="${alignment}"` : "";
        return `<span class="editor-mention" contenteditable="false" data-no-resize="true" data-mention-id="${escapeHtml(mentionId)}" data-mention-mode="${mode}"${alignmentAttribute}${titleAttribute}>${children}</span>`;
      }
      const style = element.getAttribute("style") || "";
      const safeStyle = safeInlineStyle(style, element);
      let result = children;
      if (/text-decoration(?:-line)?\s*:\s*[^;]*line-through/i.test(style))
        result = `<s>${result}</s>`;
      if (/text-decoration(?:-line)?\s*:\s*[^;]*underline/i.test(style))
        result = `<u>${result}</u>`;
      if (/font-style\s*:\s*italic/i.test(style)) result = `<em>${result}</em>`;
      if (/font-weight\s*:\s*(?:bold|[6-9]00)/i.test(style))
        result = `<strong>${result}</strong>`;
      if (safeStyle) result = `<span style="${escapeHtml(safeStyle)}">${result}</span>`;
      return result;
    }
    if (element.tagName === "FONT") {
      const fontColor = element.getAttribute("color");
      const safeStyle = fontColor
        ? safeInlineStyle(`color: ${fontColor}`, element)
        : safeInlineStyle(element.getAttribute("style") || "", element);
      return safeStyle
        ? `<span style="${escapeHtml(safeStyle)}">${children}</span>`
        : children;
    }
    const safeAttributes = Array.from(element.attributes)
      .filter((attribute) => attributes.has(attribute.name))
      .filter(
        (attribute) =>
          !["href", "src"].includes(attribute.name) ||
          isSafeUrl(attribute.value),
      )
      .map((attribute) => ` ${attribute.name}="${escapeHtml(attribute.value)}"`)
      .join("");
    if (element.tagName === "BR") return "<br>";
    if (element.tagName === "HR")
      return '<div data-divider="true" contenteditable="false"><hr /></div>';
    if (element.tagName === "DIV" && element.hasAttribute("data-divider")) {
      return `<div data-divider="true" contenteditable="false">${children}</div>`;
    }
    if (element.tagName === "DIV" && element.hasAttribute("data-globe")) {
      const style = safeInlineStyle(element.getAttribute("style") || "");
      const safeStyle = style ? ` style="${escapeHtml(style)}"` : "";
      return `<div data-globe="true"${safeStyle}>${children}</div>`;
    }
    if (element.tagName === "DIV" && element.hasAttribute("data-globe-content")) {
      return `<div data-globe-content="true">${children}</div>`;
    }
    if (element.tagName === "DIV" || element.tagName === "FIGURE") {
      if (!children.trim()) return "";
      const hasBlockChild = Array.from(element.children).some((child) =>
        ["BLOCKQUOTE", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "OL", "P", "PRE", "TABLE", "UL"].includes(child.tagName),
      );
      const safeStyle = safeInlineStyle(element.getAttribute("style") || "", element);
      if (hasBlockChild) {
        return safeStyle ? `<div style="${escapeHtml(safeStyle)}">${children}</div>` : children;
      }
      return safeStyle ? `<p style="${escapeHtml(safeStyle)}">${children}</p>` : `<p>${children}</p>`;
    }
    if (element.tagName === "IMG") return `<img${safeAttributes} />`;
    const name = element.tagName.toLowerCase();
    const style = safeInlineStyle(element.getAttribute("style") || "", element);
    const safeStyle = style ? ` style="${escapeHtml(style)}"` : "";
    return `<${name}${safeAttributes}${safeStyle}>${children}</${name}>`;
  };
  return Array.from(source.body.childNodes).map(visit).join("");
}
