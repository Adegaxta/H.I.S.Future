import { EDITOR_STRUCTURAL_BLOCK_SELECTOR, EDITOR_TRANSIENT_BLOCK_ATTRIBUTES } from "../../editor/blockModel";
import type { HeadingInspection, ImageInspection, LinkInspection, MentionInspection, StructureAnalysis, TableInspection } from "./types";

export interface DomAnalysisResult {
  text: string;
  structure: StructureAnalysis;
  mentions: MentionInspection[];
  headings: HeadingInspection[];
  links: LinkInspection[];
  images: ImageInspection[];
  tables: TableInspection[];
}

const emptyStructure = (): StructureAnalysis => ({
  editorBlocks: 0, rootElements: 0, domElements: 0, textNodes: 0, maxDomDepth: 0, averageDomDepth: 0,
  contentEditableElements: 0, headings: 0, paragraphs: 0, listItems: 0, lists: 0, tables: 0,
  tableRows: 0, tableCells: 0, images: 0, links: 0, globes: 0, pageIndexes: 0, syncedBlocks: 0,
  columns: 0, columnLayouts: 0, embeds: 0, editorUiElements: 0, transientEditorAttributes: 0,
});

function compactFragment(value: string | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
}

function tableInspection(element: Element, order: number, block: number | null): TableInspection {
  const nativeRows = element.tagName.toLowerCase() === "table"
    ? Array.from(element.querySelectorAll(":scope > thead > tr, :scope > tbody > tr, :scope > tr"))
    : Array.from(element.querySelectorAll(":scope > [data-his-table-grid] > [data-his-table-row]"));
  const rows = nativeRows.map((row) => Array.from(row.querySelectorAll(":scope > th, :scope > td, :scope > [data-his-table-cell]")));
  const headers = (rows[0] ?? [])
    .filter((cell) => cell.tagName.toLowerCase() === "th" || cell.getAttribute("data-his-table-header") === "true")
    .map((cell) => compactFragment(cell.textContent))
    .filter(Boolean);
  return {
    rows: rows.length,
    columns: rows.reduce((maximum, row) => Math.max(maximum, row.length), 0),
    headers,
    textSample: compactFragment(rows.slice(0, 3).flat().map((cell) => compactFragment(cell.textContent)).filter(Boolean).join(" | ")),
    order,
    block,
  };
}

export function analyzeDom(document: Document, nodeIds: ReadonlySet<string>): DomAnalysisResult {
  const structure = emptyStructure();
  structure.rootElements = document.body.children.length;
  const textChunks: string[] = [];
  const mentions: MentionInspection[] = [];
  const headings: HeadingInspection[] = [];
  const links: LinkInspection[] = [];
  const images: ImageInspection[] = [];
  const tables: TableInspection[] = [];
  let depthSum = 0;
  let blockSequence = 0;
  const stack: { node: Node; depth: number; block: number | null; hiddenText: boolean }[] = [];
  for (let index = document.body.childNodes.length - 1; index >= 0; index -= 1) stack.push({ node: document.body.childNodes[index], depth: 1, block: null, hiddenText: false });
  while (stack.length) {
    const current = stack.pop()!;
    if (current.node.nodeType === Node.TEXT_NODE) {
      structure.textNodes += 1;
      if (!current.hiddenText && current.node.nodeValue) textChunks.push(current.node.nodeValue);
      continue;
    }
    if (!(current.node instanceof Element)) continue;
    const element = current.node;
    const tag = element.tagName.toLowerCase();
    const hiddenText = current.hiddenText || tag === "script" || tag === "style";
    structure.domElements += 1;
    depthSum += current.depth;
    structure.maxDomDepth = Math.max(structure.maxDomDepth, current.depth);
    let block = current.block;
    if (element.matches(EDITOR_STRUCTURAL_BLOCK_SELECTOR)) {
      structure.editorBlocks += 1;
      blockSequence += 1;
      block = blockSequence;
    }
    if (/^h[1-6]$/.test(tag) && !element.closest("[data-page-index], [data-globe]")) {
      structure.headings += 1;
      headings.push({ level: Number(tag.slice(1)), text: compactFragment(element.textContent), order: headings.length + 1, block });
    }
    if (tag === "p") structure.paragraphs += 1;
    if (tag === "li") structure.listItems += 1;
    if (tag === "ul" || tag === "ol") structure.lists += 1;
    if (tag === "table" || element.hasAttribute("data-his-table")) {
      structure.tables += 1;
      tables.push(tableInspection(element, tables.length + 1, block));
    }
    if (tag === "tr" || element.hasAttribute("data-his-table-row")) structure.tableRows += 1;
    if (tag === "td" || tag === "th" || element.hasAttribute("data-his-table-cell")) structure.tableCells += 1;
    if (tag === "img") {
      structure.images += 1;
      images.push({
        alt: element.getAttribute("alt"),
        title: element.getAttribute("title") ?? element.closest("[title]")?.getAttribute("title") ?? null,
        fileName: element.getAttribute("data-image-file-name"),
        resourceId: element.getAttribute("data-resource-id"),
        source: element.getAttribute("src"),
        role: element.closest("[data-globe-icon]") ? "block-icon" : element.closest("[data-mention-id]") ? "mention-visual" : "content",
        order: images.length + 1,
        block,
      });
    }
    if (tag === "a" && element.hasAttribute("href")) {
      structure.links += 1;
      links.push({ href: element.getAttribute("href") ?? "", text: compactFragment(element.textContent), order: links.length + 1, block });
    }
    if (element.hasAttribute("data-globe")) structure.globes += 1;
    if (element.hasAttribute("data-page-index")) structure.pageIndexes += 1;
    if (element.hasAttribute("data-his-synced")) structure.syncedBlocks += 1;
    if (element.hasAttribute("data-his-column")) structure.columns += 1;
    if (element.hasAttribute("data-his-column-layout")) structure.columnLayouts += 1;
    if (["iframe", "video", "audio", "embed", "object"].includes(tag)) structure.embeds += 1;
    if (element.hasAttribute("data-editor-ui")) structure.editorUiElements += 1;
    if (element.hasAttribute("contenteditable")) structure.contentEditableElements += 1;
    for (const attribute of EDITOR_TRANSIENT_BLOCK_ATTRIBUTES) if (element.hasAttribute(attribute)) structure.transientEditorAttributes += 1;
    const mentionId = element.getAttribute("data-mention-id");
    if (mentionId) mentions.push({ targetId: mentionId, broken: !nodeIds.has(mentionId), block, fragment: compactFragment(element.textContent) });
    for (let index = element.childNodes.length - 1; index >= 0; index -= 1) stack.push({ node: element.childNodes[index], depth: current.depth + 1, block, hiddenText });
  }
  structure.averageDomDepth = structure.domElements ? depthSum / structure.domElements : 0;
  return { text: textChunks.join(" ").replace(/\s+/g, " ").trim(), structure, mentions, headings, links, images, tables };
}

export function analyzeDomFallback(content: string, nodeIds: ReadonlySet<string>): DomAnalysisResult {
  const structure = emptyStructure();
  const count = (pattern: RegExp) => content.match(pattern)?.length ?? 0;
  structure.editorBlocks = count(/<(?:p|h[1-6]|blockquote|li|pre)\b|data-divider=|data-globe=|data-page-index=|data-his-table=|data-mention-mode=["']full["']/gi);
  structure.domElements = count(/<[a-z][^>]*>/gi);
  structure.headings = count(/<h[1-6]\b/gi); structure.paragraphs = count(/<p\b/gi); structure.listItems = count(/<li\b/gi);
  structure.tables = count(/<(?:table\b|div\b[^>]*data-his-table=)/gi); structure.tableRows = count(/<(?:tr\b|div\b[^>]*data-his-table-row=)/gi);
  structure.tableCells = count(/<(?:td\b|th\b|div\b[^>]*data-his-table-cell=)/gi); structure.images = count(/<img\b/gi); structure.links = count(/<a\b/gi);
  structure.globes = count(/data-globe=/gi); structure.pageIndexes = count(/data-page-index=/gi); structure.syncedBlocks = count(/data-his-synced=/gi);
  structure.columns = count(/data-his-column=/gi); structure.columnLayouts = count(/data-his-column-layout=/gi); structure.editorUiElements = count(/data-editor-ui=/gi);
  const mentions = [...content.matchAll(/data-mention-id=["']([^"']+)["']/gi)].map((match) => ({ targetId: match[1], broken: !nodeIds.has(match[1]), block: null, fragment: "" }));
  const plain = (value: string) => value.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, "\"").replace(/&#39;/gi, "'").replace(/\s+/g, " ").trim();
  const attribute = (source: string, name: string) => new RegExp(`${name}=["']([^"']*)["']`, "i").exec(source)?.[1] ?? null;
  const insideAttribute = (position: number, name: string) => {
    const attributeAt = content.lastIndexOf(name, position);
    if (attributeAt < 0) return false;
    const openAt = content.lastIndexOf("<", attributeAt);
    const tag = /^<([a-z0-9-]+)/i.exec(content.slice(openAt, attributeAt))?.[1];
    if (!tag) return false;
    return content.lastIndexOf(`</${tag}`, position) < openAt;
  };
  const headings = [...content.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map((match, index) => ({ level: Number(match[1]), text: plain(match[2]), order: index + 1, block: null }));
  const links = [...content.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map((match, index) => ({ href: attribute(match[1], "href") ?? "", text: plain(match[2]), order: index + 1, block: null }));
  const images = [...content.matchAll(/<img\b([^>]*)>/gi)].map((match, index) => ({
    alt: attribute(match[1], "alt"), title: attribute(match[1], "title"), fileName: attribute(match[1], "data-image-file-name"),
    resourceId: attribute(match[1], "data-resource-id"), source: attribute(match[1], "src"),
    role: insideAttribute(match.index ?? 0, "data-globe-icon") ? "block-icon" as const : insideAttribute(match.index ?? 0, "data-mention-id") ? "mention-visual" as const : "content" as const,
    order: index + 1, block: null,
  }));
  const nativeTables = [...content.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map((match, index) => {
    const rows = [...match[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) => [...row[1].matchAll(/<t[hd]\b([^>]*)>([\s\S]*?)<\/t[hd]>/gi)]);
    return { rows: rows.length, columns: rows.reduce((maximum, row) => Math.max(maximum, row.length), 0), headers: (rows[0] ?? []).filter((cell) => /^<th/i.test(cell[0])).map((cell) => plain(cell[2])), textSample: plain(match[1]).slice(0, 120), order: index + 1, block: null };
  });
  const hisTables = [...content.matchAll(/<[^>]+data-his-table=["'][^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/gi)].map((match, index) => {
    const rows = [...match[1].matchAll(/data-his-table-row=["']/gi)].length;
    const cells = [...match[1].matchAll(/data-his-table-cell=["']/gi)].length;
    return { rows, columns: rows ? Math.ceil(cells / rows) : cells, headers: [] as string[], textSample: plain(match[1]).slice(0, 120), order: nativeTables.length + index + 1, block: null };
  });
  const text = content.replace(/<!--hisfuture-[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return { text, structure, mentions, headings, links, images, tables: [...nativeTables, ...hisTables] };
}
