import draftAsset from "../assets/icons/draft.svg";

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
    if (/^(Resumen|Índice|Leyenda de Utilidad en el Lore):?$/i.test(line)) {
      flushList();
      blocks.push(`<h2>${escaped}</h2>`);
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

function safeInlineStyle(style: string): string {
  const declarations = style.split(";").flatMap((declaration) => {
    const [property, ...parts] = declaration.split(":");
    const value = parts.join(":").trim();
    if (!property || !value) return [];
    const normalized = property.trim().toLowerCase();
    if (normalized === "color" || normalized === "background-color") {
      const color = safeColor(value);
      return color ? [`${normalized}: ${color}`] : [];
    }
      if (normalized === "text-align" && ["left", "center", "right"].includes(value.toLowerCase()))
        return [`text-align: ${value.toLowerCase()}`];
      return [];
  });
  return declarations.join("; ");
}

function hasCalloutStyle(element: HTMLElement): boolean {
  const style = element.getAttribute("style") || "";
  const hasBackground = /background(?:-color)?\s*:\s*(?!transparent\b|none\b)[^;]+/i.test(style);
  const hasRounding = /border-radius\s*:\s*[^;]+/i.test(style);
  const hasPadding = /padding\s*:\s*[^;]+/i.test(style);
  return hasBackground && (hasRounding || hasPadding);
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
  const isIndexLike = /table[-_ ]of[-_ ]contents|toc|index|outline|summary|page[-_ ]index|contents/.test(marker) ||
    /^(?:índice|index|table of contents|tabla de contenido|contenido|sumario)$/i.test(text) ||
    element.matches("[data-page-index], [data-index], [data-toc], .toc, .table-of-contents, .page-index");
  if (!isIndexLike) return null;
  const items = Array.from(
    element.querySelectorAll<HTMLElement>("li, a, [data-index-item], [data-toc-item], p, div"),
  )
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

function anytypeGlobeToHtml(element: HTMLElement): string | null {
  const marker = getAnytypeMarker(element);
  const looksLikeGlobe =
    /callout|globe|toggle|card|note|quote|highlight-block|highlight|bubble|pill/i.test(marker) ||
    element.matches("[data-globe], [data-callout], [data-toggle], .globe, .callout, .toggle, .note, .quote, .highlight-block, .card") ||
    !!element.querySelector("[data-emoji], .emoji, .icon, svg, img, [data-callout-icon]") ||
    hasCalloutStyle(element);
  if (!looksLikeGlobe) return null;
  const icon =
    element.querySelector<HTMLElement>("[data-emoji], [data-callout-icon], .emoji, .icon, svg, img, span") ||
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
  return `<div data-globe="true"><span data-globe-icon="true" contenteditable="false">${iconHtml}</span><div data-globe-content="true">${body}</div></div>`;
}

export function sanitizeEditorHtml(html: string): string {
  const source = new DOMParser().parseFromString(html, "text/html");
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
      const anytypeIndex = anytypeIndexToHtml(element);
      if (anytypeIndex) return anytypeIndex;
      const anytypeGlobe = anytypeGlobeToHtml(element);
      if (anytypeGlobe) return anytypeGlobe;
      if (isCallout(element)) {
        const icon = element.querySelector<HTMLElement>(
          ".callout-image, [data-callout-icon], [data-globe-icon], img",
        );
        const content = Array.from(element.childNodes)
          .filter((child) => child !== icon && !icon?.contains(child))
          .map(visit)
          .join("");
        const iconContent = icon ? visit(icon) : "";
        const style = safeInlineStyle(element.getAttribute("style") || "");
        const safeStyle = style ? ` style="${escapeHtml(style)}"` : "";
        return `<div data-globe="true"${safeStyle}><span data-globe-icon="true" contenteditable="false">${iconContent || `<img src="${draftAsset}" alt="Draft" />`}</span><div data-globe-content="true">${content}</div></div>`;
      }
    }
    const children = Array.from(element.childNodes).map(visit).join("");
    if (!tags.has(element.tagName)) return children;
    if (element.tagName === "SPAN" && element.hasAttribute("data-globe-icon")) {
      return `<span data-globe-icon="true" contenteditable="false">${children}</span>`;
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
        return `<span data-mention-id="${escapeHtml(mentionId)}" data-mention-mode="${mode}"${alignmentAttribute}${titleAttribute}>${children}</span>`;
      }
      const style = element.getAttribute("style") || "";
      const safeStyle = safeInlineStyle(style);
      let result = children;
      if (/background(?:-color)?\s*:\s*(?!transparent|none)[^;]+/i.test(style))
        result = `<mark>${result}</mark>`;
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
      return hasBlockChild ? children : `<p>${children}</p>`;
    }
    if (element.tagName === "IMG") return `<img${safeAttributes} />`;
    const name = element.tagName.toLowerCase();
    const style = safeInlineStyle(element.getAttribute("style") || "");
    const safeStyle = style ? ` style="${escapeHtml(style)}"` : "";
    return `<${name}${safeAttributes}${safeStyle}>${children}</${name}>`;
  };
  return Array.from(source.body.childNodes).map(visit).join("");
}
