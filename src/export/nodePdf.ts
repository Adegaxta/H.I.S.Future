import { jsPDF } from "jspdf";
import type { NodeItem } from "../types/nodes";
import { getPageMeta } from "../utils/pageMeta";

export interface PdfOptions {
  pageSize: "a4" | "letter";
  orientation: "portrait" | "landscape";
  scale: number;
  includeTitle: boolean;
  includeIcon?: boolean;
  includeCover?: boolean;
  includeImages: boolean;
  iconSrc?: string | null;
  coverSrc?: string | null;
}

const PAGE_MARGIN = 42;
const BODY_COLOR: [number, number, number] = [35, 38, 42];
const MUTED_COLOR: [number, number, number] = [92, 98, 105];
const BORDER_COLOR: [number, number, number] = [150, 156, 163];

type PdfContext = {
  pdf: jsPDF;
  x: number;
  y: number;
  width: number;
  bottom: number;
  lineHeight: number;
};

function ensureSpace(context: PdfContext, height: number): void {
  if (context.y + height <= context.bottom) return;
  context.pdf.addPage();
  context.y = PAGE_MARGIN;
}

function writeLines(context: PdfContext, value: string, size = 11, color = BODY_COLOR, indent = 0): void {
  context.pdf.setFont("helvetica", "normal");
  context.pdf.setFontSize(size);
  context.pdf.setTextColor(...color);
  const lines = context.pdf.splitTextToSize(value.replace(/\s+/g, " ").trim(), context.width - indent) as string[];
  ensureSpace(context, Math.max(context.lineHeight, lines.length * context.lineHeight));
  context.pdf.text(lines, context.x + indent, context.y);
  context.y += Math.max(context.lineHeight, lines.length * context.lineHeight);
}

function imageFormat(source: string): "PNG" | "JPEG" | "WEBP" | null {
  const match = source.match(/^data:image\/(png|jpe?g|webp);/i);
  if (!match) return null;
  return match[1].toLowerCase() === "jpg" || match[1].toLowerCase() === "jpeg"
    ? "JPEG"
    : match[1].toUpperCase() as "PNG" | "WEBP";
}

function imageSize(source: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || 1, height: image.naturalHeight || 1 });
    image.onerror = () => reject(new Error("No se pudo cargar una imagen del Nodo."));
    image.src = source;
  });
}

async function renderImage(context: PdfContext, source: string): Promise<void> {
  const format = imageFormat(source);
  if (!format) {
    writeLines(context, "[Imagen no compatible]", 9, MUTED_COLOR);
    return;
  }
  try {
    const dimensions = await imageSize(source);
    const maxWidth = context.width;
    const maxHeight = context.bottom - PAGE_MARGIN;
    const ratio = Math.min(maxWidth / dimensions.width, maxHeight / dimensions.height, 1);
    const width = dimensions.width * ratio;
    const height = dimensions.height * ratio;
    ensureSpace(context, height + context.lineHeight);
    context.pdf.addImage(source, format, context.x, context.y - 10, width, height, undefined, "FAST");
    context.y += height + context.lineHeight;
  } catch {
    writeLines(context, "[Imagen no disponible]", 9, MUTED_COLOR);
  }
}

function renderTable(context: PdfContext, table: Element): void {
  const grid = table.matches("[data-his-table-grid]") ? table : table.querySelector("[data-his-table-grid]");
  const rows = Array.from(grid?.querySelectorAll(":scope > [data-his-table-row]") ?? []);
  if (!rows.length) return;
  const cellRows = rows.map((row) => Array.from(row.querySelectorAll(":scope > [data-his-table-cell]")));
  const columns = Math.max(...cellRows.map((row) => row.length));
  const rawTemplate = (grid as HTMLElement | null)?.style.getPropertyValue("--his-table-columns-template") || "";
  const rawWidths = rawTemplate.match(/[\d.]+/g)?.map(Number) ?? [];
  const widths = Array.from({ length: columns }, (_, index) => rawWidths[index] || 1);
  const total = widths.reduce((sum, width) => sum + width, 0) || columns;
  const columnWidths = widths.map((width) => context.width * width / total);
  const cellPadding = 4;
  cellRows.forEach((row) => {
    const cellLines = row.map((cell, index) => context.pdf.splitTextToSize(
      (cell.textContent || "").replace(/\s+/g, " ").trim(),
      Math.max(12, columnWidths[index] - cellPadding * 2),
    ) as string[]);
    const rowHeight = Math.max(18, ...cellLines.map((lines) => lines.length * 11 + cellPadding * 2));
    ensureSpace(context, rowHeight);
    let offset = 0;
    columnWidths.forEach((width, index) => {
      context.pdf.setDrawColor(...BORDER_COLOR);
      context.pdf.setLineWidth(0.5);
      context.pdf.rect(context.x + offset, context.y - 11, width, rowHeight);
      context.pdf.setFont("helvetica", "normal");
      context.pdf.setFontSize(9);
      context.pdf.setTextColor(...BODY_COLOR);
      context.pdf.text(cellLines[index] ?? [], context.x + offset + cellPadding, context.y + 1);
      offset += width;
    });
    context.y += rowHeight;
  });
  context.y += context.lineHeight;
}

async function renderElement(context: PdfContext, element: Element, listDepth = 0): Promise<void> {
  const tag = element.tagName.toLowerCase();
  if (tag === "img") {
    await renderImage(context, (element as HTMLImageElement).src || element.getAttribute("src") || "");
    return;
  }
  if (element.matches("[data-his-table]")) {
    renderTable(context, element);
    return;
  }
  if (tag === "hr") {
    ensureSpace(context, 12);
    context.pdf.setDrawColor(...BORDER_COLOR);
    context.pdf.line(context.x, context.y - 6, context.x + context.width, context.y - 6);
    context.y += context.lineHeight;
    return;
  }
  if (/^h[1-6]$/.test(tag)) {
    const size = Math.max(13, 23 - Number(tag.slice(1)) * 2);
    context.y += context.lineHeight * 0.5;
    writeLines(context, element.textContent || "", size, BODY_COLOR);
    context.y += context.lineHeight * 0.25;
    return;
  }
  if (tag === "pre") {
    writeLines(context, element.textContent || "", 9, BODY_COLOR, 8);
    return;
  }
  if (tag === "blockquote") {
    context.pdf.setDrawColor(77, 167, 148);
    context.pdf.setLineWidth(2);
    context.pdf.line(context.x, context.y - 10, context.x, context.y + context.lineHeight);
    writeLines(context, element.textContent || "", 10, MUTED_COLOR, 10);
    return;
  }
  if (tag === "ul" || tag === "ol") {
    Array.from(element.children).filter((child) => child.tagName.toLowerCase() === "li").forEach((child, index) => {
      const marker = tag === "ol" ? `${index + 1}. ` : "• ";
      writeLines(context, `${marker}${child.textContent || ""}`, 11, BODY_COLOR, listDepth * 12);
    });
    context.y += context.lineHeight * 0.25;
    return;
  }
  if (tag === "p" || tag === "div" || tag === "section" || tag === "article" || tag === "li") {
    if (element.querySelector(":scope > img")) {
      for (const child of Array.from(element.childNodes)) {
        if (child.nodeType === Node.ELEMENT_NODE && (child as Element).tagName.toLowerCase() === "img") await renderElement(context, child as Element, listDepth);
        else if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) writeLines(context, child.textContent, 11);
      }
    } else if (element.children.length) {
      for (const child of Array.from(element.children)) await renderElement(context, child, listDepth + 1);
    } else if (element.textContent?.trim()) {
      writeLines(context, element.textContent, 11);
    }
    if (tag !== "li") context.y += context.lineHeight * 0.35;
    return;
  }
  if (element.textContent?.trim()) writeLines(context, element.textContent, 11);
}

export async function nodeToPdf(node: Pick<NodeItem, "name" | "content">, options: PdfOptions): Promise<Blob> {
  const document = new DOMParser().parseFromString(node.content, "text/html");
  const pdf = new jsPDF({ unit: "pt", format: options.pageSize, orientation: options.orientation });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, pageWidth, pageHeight, "F");
  const context: PdfContext = {
    pdf,
    x: PAGE_MARGIN,
    y: PAGE_MARGIN,
    width: pageWidth - PAGE_MARGIN * 2,
    bottom: pageHeight - PAGE_MARGIN,
    lineHeight: 16 * Math.max(0.75, options.scale),
  };
  if (options.includeCover && options.coverSrc) await renderImage(context, options.coverSrc);
  if (options.includeIcon && options.iconSrc) await renderImage(context, options.iconSrc);
  if (options.includeTitle) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(23);
    pdf.setTextColor(...BODY_COLOR);
    const titleLines = pdf.splitTextToSize(node.name.trim() || "Sin título", context.width) as string[];
    pdf.text(titleLines, context.x, context.y);
    context.y += Math.max(context.lineHeight * 1.5, titleLines.length * 26);
  }
  const pageMeta = getPageMeta(node.content);
  if (pageMeta.description && !pageMeta.hideDescription) writeLines(context, pageMeta.description, 11, MUTED_COLOR);
  if (!options.includeImages) document.body.querySelectorAll("img").forEach((image) => image.remove());
  for (const child of Array.from(document.body.children)) await renderElement(context, child);
  return pdf.output("blob");
}
