import type { NodeItem } from "../types/nodes";

function text(value: string | null | undefined) {
  return (value ?? "").replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").trim();
}

function inline(element: Node, linkFormat: "wikilink" | "markdown" = "wikilink"): string {
  if (element.nodeType === Node.TEXT_NODE) return element.textContent ?? "";
  if (element.nodeType !== Node.ELEMENT_NODE) return "";
  const current = element as HTMLElement;

  if (current.matches("[data-mention-id], .editor-mention")) {
    const image = current.querySelector("img");
    if (image) return `[Imagen: ${image.getAttribute("alt") || current.getAttribute("title") || "recurso HIS"}]`;
    const label = current.querySelector(".editor-mention__label")?.textContent?.trim()
      || current.getAttribute("title")?.trim()
      || current.textContent?.trim()
      || "";
    const cleanLabel = label.replace(/^@/, "").trim();
    const mentionId = current.getAttribute("data-mention-id") || current.getAttribute("data-node-id") || "";
    if (linkFormat === "markdown" && mentionId) {
      return `[${cleanLabel || "Enlace"}](node://${mentionId})`;
    }
    return `[[${cleanLabel || "Enlace"}]]`;
  }

  if (current.matches("[data-his-equation]")) {
    return `$${text(current.textContent)}$`;
  }

  const content = Array.from(current.childNodes).map((child) => inline(child, linkFormat)).join("");

  if (current.tagName === "STRONG" || current.tagName === "B") return `**${content}**`;
  if (current.tagName === "EM" || current.tagName === "I") return `*${content}*`;
  if (current.tagName === "S" || current.tagName === "STRIKE" || current.tagName === "DEL") return `~~${content}~~`;
  if (current.tagName === "CODE" && current.parentElement?.tagName !== "PRE") return `\`${content}\``;
  if (current.tagName === "A") return `[${content || text(current.getAttribute("href"))}](${current.getAttribute("href") || ""})`;
  if (current.tagName === "IMG") {
    const alt = current.getAttribute("alt") || "Imagen";
    const source = current.getAttribute("src") || "";
    return source.startsWith("blob:") ? `[Imagen: ${alt}]` : `![${alt}](${source})`;
  }
  return content;
}

function table(table: HTMLTableElement, linkFormat: "wikilink" | "markdown" = "wikilink"): string {
  const rows = Array.from(table.rows).map((row) =>
    Array.from(row.cells).map((cell) => text(inline(cell, linkFormat)).replace(/\|/g, "\\|")),
  );
  if (!rows.length) return "";
  const width = Math.max(...rows.map((row) => row.length));
  const normalized = rows.map((row) => [...row, ...Array.from({ length: width - row.length }, () => "")]);
  return [
    `| ${normalized[0].join(" | ")} |`,
    `| ${normalized[0].map(() => "---").join(" | ")} |`,
    ...normalized.slice(1).map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function hisTable(table: Element, linkFormat: "wikilink" | "markdown" = "wikilink"): string {
  const rows = Array.from(table.querySelectorAll(":scope > [data-his-table-grid] > [data-his-table-row]")).map((row) =>
    Array.from(row.querySelectorAll(":scope > [data-his-table-cell]")).map((cell) => text(inline(cell, linkFormat)).replace(/\|/g, "\\|")),
  );
  if (!rows.length) return "";
  const width = Math.max(...rows.map((row) => row.length));
  const normalized = rows.map((row) => [...row, ...Array.from({ length: width - row.length }, () => "")]);
  return [
    `| ${normalized[0].join(" | ")} |`,
    `| ${normalized[0].map(() => "---").join(" | ")} |`,
    ...normalized.slice(1).map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

interface BlockResult {
  markdown: string;
  isList: boolean;
  listType?: string;
}

function getIndentPrefix(element: Element): string {
  const margin = Number.parseFloat((element as HTMLElement).style?.marginLeft || "0");
  const indentLevel = Math.max(0, Math.round(margin / 24));
  return "  ".repeat(indentLevel);
}

function convertBlock(
  element: Element,
  indexInList = 1,
  linkFormat: "wikilink" | "markdown" = "wikilink",
): BlockResult {
  if (element.tagName === "TABLE") {
    return { markdown: table(element as HTMLTableElement, linkFormat), isList: false };
  }
  if (element.matches("[data-his-table]")) {
    return { markdown: hisTable(element, linkFormat), isList: false };
  }
  const embeddedTable = element.querySelector(":scope > [data-his-table]");
  if (embeddedTable) {
    const inlinePart = text(inline(element, linkFormat).replace(embeddedTable.textContent || "", ""));
    const tablePart = hisTable(embeddedTable, linkFormat);
    return { markdown: `${inlinePart}${tablePart}`.trim(), isList: false };
  }

  // Dividers
  if (element.tagName === "HR" || element.hasAttribute("data-divider")) {
    return { markdown: "---", isList: false };
  }

  // Equations (block)
  if (element.matches("[data-his-equation]")) {
    return { markdown: `$$\n${text(element.textContent)}\n$$`, isList: false };
  }

  // Pre / Code blocks
  if (element.tagName === "PRE" || element.matches("[data-his-code]")) {
    const code = element.querySelector("code")?.textContent ?? element.textContent ?? "";
    const lang = element.getAttribute("data-language") || "";
    return { markdown: `\`\`\`${lang}\n${code.replace(/\r/g, "").trimEnd()}\n\`\`\``, isList: false };
  }

  // Callouts / globes
  if (element.matches("[data-globe]")) {
    const contentEl = element.querySelector("[data-globe-content]") || element;
    const lines = text(inline(contentEl, linkFormat)).split("\n").map((line) => `> ${line}`).join("\n");
    return { markdown: `> [!NOTE]\n${lines}`, isList: false };
  }

  // Dropdown / collapsible section
  if (element.matches("[data-his-dropdown]")) {
    const summary = element.getAttribute("data-his-dropdown-title") || "Detalles";
    const contentEl = element.querySelector("[data-his-dropdown-content]") || element;
    const inner = text(inline(contentEl, linkFormat));
    return { markdown: `<details>\n<summary>${summary}</summary>\n\n${inner}\n</details>`, isList: false };
  }

  // Column layouts
  if (element.matches("[data-his-column-layout]")) {
    const columns = Array.from(element.querySelectorAll(":scope > [data-his-column]"));
    const colResults = columns.flatMap((col) =>
      Array.from(col.children).map((child) => convertBlock(child, 1, linkFormat).markdown).filter(Boolean),
    );
    return { markdown: colResults.join("\n\n"), isList: false };
  }

  // Native H.I.S. Lists
  if (element.hasAttribute("data-his-list")) {
    const listType = element.getAttribute("data-his-list") || "bullets";
    const indent = getIndentPrefix(element);
    const content = text(inline(element, linkFormat));

    if (listType === "bullets" || listType === "tree") {
      return { markdown: `${indent}- ${content}`, isList: true, listType: "bullets" };
    }
    if (listType === "numbered") {
      return { markdown: `${indent}${indexInList}. ${content}`, isList: true, listType: "numbered" };
    }
    if (listType === "todo") {
      const checked = element.getAttribute("data-his-todo-checked") === "true";
      return { markdown: `${indent}- [${checked ? "x" : " "}] ${content}`, isList: true, listType: "todo" };
    }
    if (listType === "collapsible") {
      return { markdown: `${indent}> [!NOTE] ${content}`, isList: true, listType: "collapsible" };
    }
  }

  // Headings
  if (/^H[1-6]$/.test(element.tagName)) {
    return { markdown: `${"#".repeat(Number(element.tagName.slice(1)))} ${text(inline(element, linkFormat))}`, isList: false };
  }

  // Blockquote
  if (element.tagName === "BLOCKQUOTE") {
    const lines = text(inline(element, linkFormat)).split("\n").map((line) => `> ${line}`).join("\n");
    return { markdown: lines, isList: false };
  }

  // Standard HTML lists (UL / OL)
  if (element.tagName === "UL" || element.tagName === "OL") {
    const ordered = element.tagName === "OL";
    const items = Array.from(element.children)
      .filter((child) => child.tagName === "LI")
      .map((child, index) => `${ordered ? `${index + 1}.` : "-"} ${text(inline(child, linkFormat))}`)
      .join("\n");
    return { markdown: items, isList: true, listType: ordered ? "numbered" : "bullets" };
  }

  if (element.tagName === "LI") {
    return { markdown: `- ${text(inline(element, linkFormat))}`, isList: true, listType: "bullets" };
  }

  return { markdown: text(inline(element, linkFormat)), isList: false };
}

export interface MarkdownExportOptions {
  includeTitle?: boolean;
  includeFrontmatter?: boolean;
  linkFormat?: "wikilink" | "markdown";
}

export function documentToMarkdown(
  document: Document,
  name: string,
  options: MarkdownExportOptions | boolean = true,
  nodeMeta?: Partial<NodeItem>,
): string {
  const opts: MarkdownExportOptions = typeof options === "boolean" ? { includeTitle: options } : options;
  const { includeTitle = true, includeFrontmatter = false, linkFormat = "wikilink" } = opts;

  const children = Array.from(document.body.children);
  const formattedBlocks: { text: string; isList: boolean; listType?: string }[] = [];

  let numberedCounter = 0;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const isNumbered = child.getAttribute?.("data-his-list") === "numbered";
    if (isNumbered) {
      numberedCounter += 1;
    } else {
      numberedCounter = 0;
    }

    const res = convertBlock(child, numberedCounter || 1, linkFormat);
    if (res.markdown) {
      formattedBlocks.push({ text: res.markdown, isList: res.isList, listType: res.listType });
    }
  }

  // Join blocks cleanly: consecutive list items separated by \n, other blocks by \n\n
  const assembled: string[] = [];
  for (let i = 0; i < formattedBlocks.length; i++) {
    const current = formattedBlocks[i];
    if (i === 0) {
      assembled.push(current.text);
      continue;
    }
    const prev = formattedBlocks[i - 1];
    if (current.isList && prev.isList && current.listType === prev.listType) {
      assembled[assembled.length - 1] += `\n${current.text}`;
    } else {
      assembled.push(current.text);
    }
  }

  const parts: string[] = [];
  if (includeFrontmatter) {
    const frontmatterLines = [
      "---",
      `title: "${name.replace(/"/g, '\\"')}"`,
      nodeMeta?.id ? `id: "${nodeMeta.id}"` : null,
      nodeMeta?.type ? `type: "${nodeMeta.type}"` : null,
      `date: "${new Date().toISOString()}"`,
      "---",
    ].filter(Boolean);
    parts.push(frontmatterLines.join("\n"));
  }

  if (includeTitle) {
    parts.push(`# ${name.trim() || "Sin título"}`);
  }

  parts.push(...assembled);
  return `${parts.join("\n\n").trim()}\n`;
}

export function nodeToMarkdown(
  node: Pick<NodeItem, "name" | "content"> & Partial<NodeItem>,
  options: MarkdownExportOptions | boolean = true,
): string {
  const document = new DOMParser().parseFromString(node.content, "text/html");
  return documentToMarkdown(document, node.name, options, node);
}
