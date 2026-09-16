import type { NodeItem } from "../types/nodes";

function text(value: string | null | undefined) {
  return (value ?? "").replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").trim();
}

function inline(element: Node): string {
  if (element.nodeType === Node.TEXT_NODE) return element.textContent ?? "";
  if (element.nodeType !== Node.ELEMENT_NODE) return "";
  const current = element as HTMLElement;
  const content = Array.from(current.childNodes).map(inline).join("");
  if (current.matches("[data-mention-id], .editor-mention")) return text(current.textContent);
  if (current.tagName === "STRONG" || current.tagName === "B") return `**${content}**`;
  if (current.tagName === "EM" || current.tagName === "I") return `*${content}*`;
  if (current.tagName === "S" || current.tagName === "STRIKE" || current.tagName === "DEL") return `~~${content}~~`;
  if (current.tagName === "CODE" && current.parentElement?.tagName !== "PRE") return `\`${content}\``;
  if (current.tagName === "A") return `[${content || text(current.getAttribute("href"))}](${current.getAttribute("href") || ""})`;
  if (current.tagName === "IMG") return `![${current.getAttribute("alt") || "Imagen"}](${current.getAttribute("src") || ""})`;
  return content;
}

function table(table: HTMLTableElement): string {
  const rows = Array.from(table.rows).map((row) => Array.from(row.cells).map((cell) => text(inline(cell)).replace(/\|/g, "\\|")));
  if (!rows.length) return "";
  const width = Math.max(...rows.map((row) => row.length));
  const normalized = rows.map((row) => [...row, ...Array.from({ length: width - row.length }, () => "")]);
  return [`| ${normalized[0].join(" | ")} |`, `| ${normalized[0].map(() => "---").join(" | ")} |`, ...normalized.slice(1).map((row) => `| ${row.join(" | ")} |`)].join("\n");
}

function hisTable(table: Element): string {
  const rows = Array.from(table.querySelectorAll(":scope > [data-his-table-grid] > [data-his-table-row]")).map((row) =>
    Array.from(row.querySelectorAll(":scope > [data-his-table-cell]")).map((cell) => text(inline(cell)).replace(/\|/g, "\\|")),
  );
  if (!rows.length) return "";
  const width = Math.max(...rows.map((row) => row.length));
  const normalized = rows.map((row) => [...row, ...Array.from({ length: width - row.length }, () => "")]);
  return [`| ${normalized[0].join(" | ")} |`, `| ${normalized[0].map(() => "---").join(" | ")} |`, ...normalized.slice(1).map((row) => `| ${row.join(" | ")} |`)].join("\n");
}

function block(element: Element): string {
  if (element.tagName === "TABLE") return table(element as HTMLTableElement);
  if (element.matches("[data-his-table]")) return hisTable(element);
  const embeddedTable = element.querySelector(":scope > [data-his-table]");
  if (embeddedTable) return `${text(inline(element).replace(embeddedTable.textContent || "", ""))}${hisTable(embeddedTable)}`.trim();
  if (/^H[1-6]$/.test(element.tagName)) return `${"#".repeat(Number(element.tagName.slice(1)))} ${text(inline(element))}`;
  if (element.tagName === "HR") return "---";
  if (element.tagName === "PRE") return `\`\`\`\n${element.textContent ?? ""}\n\`\`\``;
  if (element.tagName === "BLOCKQUOTE") return text(inline(element)).split("\n").map((line) => `> ${line}`).join("\n");
  if (element.tagName === "UL" || element.tagName === "OL") {
    const ordered = element.tagName === "OL";
    return Array.from(element.children).filter((child) => child.tagName === "LI").map((child, index) => `${ordered ? `${index + 1}.` : "-"} ${text(inline(child))}`).join("\n");
  }
  if (element.tagName === "LI") return text(inline(element));
  return text(inline(element));
}

export function nodeToMarkdown(node: Pick<NodeItem, "name" | "content">, includeTitle = true): string {
  const document = new DOMParser().parseFromString(node.content, "text/html");
  const blocks = Array.from(document.body.children).map(block).filter(Boolean);
  const output = includeTitle ? [`# ${node.name.trim() || "Sin título"}`, ...blocks] : blocks;
  return `${output.join("\n\n").trim()}\n`;
}
