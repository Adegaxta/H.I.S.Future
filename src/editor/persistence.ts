import type { NodeItem } from "../types/nodes";
import { EDITOR_STRUCTURAL_BLOCK_SELECTOR } from "./blockModel";
import { getPageMeta, setPageMeta } from "../utils/pageMeta";
import { getTempoMeta, setTempoMeta } from "../utils/temporalMeta";
import { serializeEditorContent } from "./serialization";

export interface EditorContentSerializationMetrics {
  totalMs: number;
  serializationMs: number;
  transientCleanupMs: number;
  blockCount: number;
  htmlLength: number;
  approximateHtmlBytes: number;
}

export function readEditorContent(
  editor: HTMLElement,
  node: NodeItem,
  reportMetrics?: (metrics: EditorContentSerializationMetrics) => void,
): string {
  const totalStarted = reportMetrics ? performance.now() : 0;
  let serializationMs = 0;
  let transientCleanupMs = 0;
  const html = serializeEditorContent(editor, reportMetrics ? (metrics) => {
    serializationMs = metrics.serializationMs;
    transientCleanupMs = metrics.transientCleanupMs;
  } : undefined);
  const content = node.content.includes("<!--hisfuture-page-meta:")
    ? setPageMeta(html, getPageMeta(node.content))
    : node.content.includes("<!--hisfuture-tempo-meta:")
      ? setTempoMeta(html, getTempoMeta(node.content))
      : html;

  if (reportMetrics) {
    reportMetrics({
      totalMs: performance.now() - totalStarted,
      serializationMs,
      transientCleanupMs,
      blockCount: editor.querySelectorAll(EDITOR_STRUCTURAL_BLOCK_SELECTOR).length,
      htmlLength: content.length,
      approximateHtmlBytes: new TextEncoder().encode(content).byteLength,
    });
  }
  return content;
}
