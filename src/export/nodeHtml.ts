import type { NodeItem } from "../types/nodes";
import { getPageMeta } from "../utils/pageMeta";
import { stripTransientEditorState } from "../editor/serialization";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export interface HtmlExportOptions {
  includeTitle?: boolean;
  includeDescription?: boolean;
  theme?: "dark" | "light";
}

export function nodeToHtml(
  node: Pick<NodeItem, "name" | "content">,
  options: HtmlExportOptions = {},
): string {
  const { includeTitle = true, includeDescription = true, theme = "dark" } = options;
  const pageMeta = getPageMeta(node.content);
  const title = node.name.trim() || "Sin título";
  const isLight = theme === "light";

  const bg = isLight ? "#ffffff" : "#121417";
  const fg = isLight ? "#1a1d21" : "#e8e9ea";
  const muted = isLight ? "#5c6269" : "#9ba4aa";
  const border = isLight ? "#e1e4e8" : "#2d3238";
  const surface = isLight ? "#f6f8fa" : "#191d21";
  const accent = isLight ? "#0066cc" : "#60a5fa";

  const cleanContent = stripTransientEditorState(node.content)
    .replace(/<!--hisfuture-[^>]*-->/g, "")
    .trim();

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)} - H.I.S.</title>
  <style>
    :root {
      color-scheme: ${theme};
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      background-color: ${bg};
      color: ${fg};
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 16px;
      line-height: 1.65;
      padding: 48px 24px;
    }
    .his-document-container {
      max-width: 860px;
      margin: 0 auto;
    }
    header.his-header {
      margin-bottom: 36px;
      padding-bottom: 24px;
      border-bottom: 1px solid ${border};
    }
    h1.his-title {
      font-size: 2.25rem;
      font-weight: 700;
      line-height: 1.25;
      margin-bottom: 12px;
      color: ${fg};
    }
    .his-description {
      font-size: 1.05rem;
      color: ${muted};
      white-space: pre-wrap;
      line-height: 1.5;
    }
    .his-body {
      display: flex;
      flex-direction: column;
      gap: 12px;
      counter-reset: his-numbered-list;
    }
    .his-body h1, .his-body h2, .his-body h3,
    .his-body h4, .his-body h5, .his-body h6 {
      color: ${fg};
      margin-top: 20px;
      margin-bottom: 8px;
      line-height: 1.3;
    }
    .his-body h1 { font-size: 1.85rem; }
    .his-body h2 { font-size: 1.5rem; }
    .his-body h3 { font-size: 1.25rem; }
    .his-body p {
      margin-bottom: 4px;
    }
    .his-body blockquote {
      border-left: 3px solid ${accent};
      padding-left: 16px;
      color: ${muted};
      font-style: italic;
      margin: 8px 0;
    }
    .his-body ul, .his-body ol {
      padding-left: 24px;
      margin: 6px 0;
    }
    .his-body li {
      margin-bottom: 4px;
    }
    .his-body [data-his-list] {
      position: relative;
      padding-left: 26px;
      min-height: 1.6em;
    }
    .his-body [data-his-list]::before {
      position: absolute;
      left: 3px;
      top: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 1.6em;
      line-height: 1;
      user-select: none;
      box-sizing: border-box;
    }
    .his-body [data-his-list="bullets"]::before {
      content: "•";
      font-size: 1.3em;
      color: inherit;
      transform: translateY(-0.18em);
    }
    .his-body > :not([data-his-list="numbered"]) {
      counter-reset: his-numbered-list;
    }
    .his-body [data-his-list="numbered"] {
      counter-increment: his-numbered-list;
    }
    .his-body [data-his-list="numbered"]::before {
      content: counter(his-numbered-list) ".";
      left: 0;
      width: 22px;
      justify-content: flex-end;
      padding-right: 4px;
      font-size: 0.95em;
      font-variant-numeric: tabular-nums;
      color: inherit;
    }
    .his-body [data-his-list="todo"]::before {
      content: "☐";
      font-size: 1.15em;
      color: inherit;
    }
    .his-body [data-his-list="todo"][data-his-todo-checked]::before {
      content: "☑";
      color: ${accent};
    }
    .his-body [data-his-list="todo"][data-his-todo-checked] {
      text-decoration: line-through;
      color: ${muted};
    }
    .his-body [data-his-list="tree"]::before {
      content: "├";
      font-size: 1.1em;
      color: inherit;
    }
    .his-body [data-his-list="collapsible"]::before {
      content: "▸";
      font-size: 1em;
      color: inherit;
    }
    .his-body :is(p, h1, h2, h3, h4, h5, h6, blockquote, pre):is([style*="background-color"], [style*="background"], [style*="border"]) {
      border-radius: 6px;
      padding: 4px 10px;
      box-sizing: border-box;
    }
    .his-body [data-his-list]:is([style*="background-color"], [style*="background"], [style*="border"]) {
      border-radius: 6px;
      padding: 4px 10px 4px 28px;
      box-sizing: border-box;
    }
    .his-body [data-his-list]:is([style*="background-color"], [style*="background"], [style*="border"])::before {
      left: 6px;
      top: 4px;
    }
    .his-body span:is([style*="background-color"], [style*="background"]) {
      border-radius: 4px;
      padding: 1px 4px;
    }
    .his-body pre, .his-body code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.9em;
    }
    .his-body pre {
      background: ${surface};
      border: 1px solid ${border};
      border-radius: 6px;
      padding: 14px 18px;
      overflow-x: auto;
      margin: 12px 0;
    }
    .his-body :not(pre) > code {
      background: ${surface};
      border: 1px solid ${border};
      padding: 2px 6px;
      border-radius: 4px;
    }
    .his-body [data-his-code="true"] {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      background: ${surface};
      padding: 12px 16px;
      border-radius: 6px;
      border: 1px solid ${border};
    }
    .his-body [data-his-equation="true"] {
      font-family: Cambria, "Times New Roman", serif;
      font-style: italic;
      letter-spacing: .03em;
    }
    .his-body img {
      max-width: 100%;
      height: auto;
      border-radius: 6px;
      display: block;
      margin: 12px 0;
    }
    .his-body table {
      width: 100%;
      border-collapse: collapse;
      margin: 14px 0;
    }
    .his-body th, .his-body td {
      border: 1px solid ${border};
      padding: 8px 12px;
      text-align: left;
    }
    .his-body th {
      background: ${surface};
      font-weight: 600;
    }
    .his-body [data-globe] {
      background: ${surface};
      border: 1px solid ${border};
      border-radius: 8px;
      padding: 14px 18px;
      margin: 12px 0;
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }
    .his-body [data-his-column-layout] {
      display: flex;
      align-items: flex-start;
      gap: 20px;
      width: 100%;
    }
    .his-body [data-his-column] {
      flex: 1 1 0;
      min-width: 0;
    }
    .his-body .editor-mention {
      color: ${accent};
      font-weight: 500;
      text-decoration: none;
    }
    .his-body hr, .his-body [data-divider] hr {
      border: 0;
      border-top: 1px solid ${border};
      margin: 28px 0;
    }
    @media print {
      body {
        padding: 0;
        background: transparent;
      }
      .his-document-container {
        max-width: none;
      }
    }
  </style>
</head>
<body>
  <div class="his-document-container">
    ${includeTitle || (includeDescription && pageMeta.description) ? `
    <header class="his-header">
      ${includeTitle ? `<h1 class="his-title">${escapeHtml(title)}</h1>` : ""}
      ${includeDescription && pageMeta.description ? `<p class="his-description">${escapeHtml(pageMeta.description)}</p>` : ""}
    </header>
    ` : ""}
    <main class="his-body">
      ${cleanContent}
    </main>
  </div>
</body>
</html>`;
}
