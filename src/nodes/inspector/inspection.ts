import { getPageMeta } from "../../utils/pageMeta";
import { getPdfResourceInfo } from "../../utils/pdfResource";
import { getImageResourceDescriptor } from "../../utils/imageResource";
import { getCalendarMeta, getTempoMeta } from "../../utils/temporalMeta";
import type { NodeItem } from "../../types/nodes";
import { getNodalMeta } from "../metadata";
import { utf8ByteLengthRange } from "./bytes";
import { analyzeDom, analyzeDomFallback } from "./domAnalysis";
import { analyzeSource } from "./sourceAnalysis";
import type { DiagnosticFact, NodeInspection } from "./types";

const now = () => typeof performance !== "undefined" ? performance.now() : Date.now();

function descendantsOf(nodeId: string, nodes: readonly NodeItem[]): number {
  const childrenByParent = new Map<string, string[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    const children = childrenByParent.get(node.parentId) ?? [];
    children.push(node.id); childrenByParent.set(node.parentId, children);
  }
  const seen = new Set<string>([nodeId]);
  const pending = [...(childrenByParent.get(nodeId) ?? [])];
  let count = 0;
  while (pending.length) {
    const id = pending.pop()!;
    if (seen.has(id)) continue;
    seen.add(id); count += 1; pending.push(...(childrenByParent.get(id) ?? []));
  }
  return count;
}

function depthOf(node: NodeItem, byId: ReadonlyMap<string, NodeItem>): number {
  const seen = new Set<string>([node.id]);
  let parentId = node.parentId;
  let depth = 0;
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId); depth += 1; parentId = byId.get(parentId)?.parentId ?? null;
  }
  return depth;
}

export function inspectNode(node: NodeItem, nodes: readonly NodeItem[], performanceMetrics: Readonly<Record<string, number>> | null = null): NodeInspection {
  const started = now();
  const byId = new Map(nodes.map((item) => [item.id, item]));
  const nodeIds = new Set(byId.keys());
  const storageStarted = now();
  const source = analyzeSource(node.content);
  const storageAndResourcesMs = now() - storageStarted;
  const parseStarted = now();
  const document = typeof DOMParser !== "undefined" ? new DOMParser().parseFromString(source.parseableHtml, "text/html") : null;
  const parseHtmlMs = now() - parseStarted;
  const domStarted = now();
  const dom = document ? analyzeDom(document, nodeIds) : analyzeDomFallback(node.content, nodeIds);
  const domAnalysisMs = now() - domStarted;
  const relationsStarted = now();
  const nodalMeta = getNodalMeta(node.content);
  const incoming = nodes.flatMap((item) => getNodalMeta(item.content).relations
    .filter((relation) => relation.targetId === node.id)
    .map((relation) => ({ sourceId: item.id, role: relation.role })));
  const brokenRelationIds = [...new Set(nodalMeta.relations.map((relation) => relation.targetId).filter((id) => !byId.has(id)))];
  const relationsMs = now() - relationsStarted;
  const words = dom.text.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
  const mentionIds = dom.mentions.map((mention) => mention.targetId);
  const uniqueMentionIds = [...new Set(mentionIds)];
  const brokenMentionIds = [...new Set(dom.mentions.filter((mention) => mention.broken).map((mention) => mention.targetId))];
  const embeddedResources = source.resources.filter((resource) => resource.representation.startsWith("data-url") || resource.representation === "inline-svg").length;
  const uniqueResources = source.resources.length - source.duplicateGroups.reduce((total, group) => total + group.occurrences - 1, 0);
  const storage = { ...source.storage, visibleText: { bytes: utf8ByteLengthRange(dom.text), exact: true, exclusive: false } };
  const diagnostics: DiagnosticFact[] = [];
  if (storage.dataUrls.bytes > 0 && storage.total.bytes > 0) diagnostics.push({ code: "data-url-share", value: storage.dataUrls.bytes / storage.total.bytes * 100, secondary: storage.dataUrls.bytes });
  for (const group of source.duplicateGroups.slice().sort((a, b) => b.duplicatedBytes - a.duplicatedBytes).slice(0, 3)) diagnostics.push({ code: "duplicate-resource", value: group.occurrences, secondary: group.storedBytesEach });
  if (dom.structure.editorUiElements) diagnostics.push({ code: "persisted-editor-ui", value: dom.structure.editorUiElements });
  if (dom.structure.transientEditorAttributes) diagnostics.push({ code: "persisted-transient-state", value: dom.structure.transientEditorAttributes });
  const persistedRuntimeUrls = source.resources.filter((resource) => resource.representation === "blob-url").length;
  if (persistedRuntimeUrls) diagnostics.push({ code: "persisted-runtime-url", value: persistedRuntimeUrls });
  if (storage.total.bytes && storage.visibleText.bytes) diagnostics.push({ code: "storage-vs-text", value: storage.total.bytes, secondary: storage.visibleText.bytes });
  if (brokenMentionIds.length) diagnostics.push({ code: "broken-mentions", value: brokenMentionIds.length });
  if (brokenRelationIds.length) diagnostics.push({ code: "broken-relations", value: brokenRelationIds.length });
  const parent = node.parentId ? byId.get(node.parentId) ?? null : null;
  const children = nodes.filter((item) => item.parentId === node.id).length;
  const totalMs = now() - started;
  return {
    htmlCharacters: node.content.length,
    textCharacters: dom.text.length,
    textCharactersNoSpaces: dom.text.replace(/\s/g, "").length,
    words,
    estimatedPages: words ? Math.ceil(words / 500) : 0,
    readingMinutes: words ? Math.max(1, Math.ceil(words / 200)) : 0,
    structure: dom.structure,
    storage,
    resources: source.resources,
    topResources: source.resources.slice().sort((a, b) => b.storedBytes - a.storedBytes).slice(0, 10),
    duplicateGroups: source.duplicateGroups,
    duplicatedResourceBytes: source.duplicatedResourceBytes,
    uniqueResources,
    referencedResources: source.resources.length - embeddedResources,
    embeddedResources,
    mentions: dom.mentions,
    uniqueMentions: uniqueMentionIds.length,
    repeatedMentions: Math.max(0, mentionIds.length - uniqueMentionIds.length),
    brokenMentionIds,
    outgoingRelations: nodalMeta.relations.length,
    incomingRelations: incoming.length,
    incoming,
    brokenRelationIds,
    children,
    descendants: descendantsOf(node.id, nodes),
    depth: depthOf(node, byId),
    siblings: nodes.filter((item) => item.id !== node.id && item.parentId === node.parentId).length,
    parent,
    diagnostics,
    timings: { storageAndResourcesMs, parseHtmlMs, domAnalysisMs, relationsMs, totalMs },
    performance: performanceMetrics ? { ...performanceMetrics } : null,
    pageMeta: node.type === "pagina" || node.type === "proyecto" ? getPageMeta(node.content) : null,
    pdfResource: node.type === "pdf" ? getPdfResourceInfo(node.content) : null,
    imageResource: node.type === "imagen" ? getImageResourceDescriptor(node.content, node.name) : null,
    calendarMeta: node.type === "calendario" ? getCalendarMeta(node.content) : null,
    tempoMeta: node.type === "tempo" ? getTempoMeta(node.content) : null,
    nodalMeta,
  };
}

export function formatBytes(bytes: number, locale: string): string {
  if (bytes < 1024) return `${bytes.toLocaleString(locale)} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toLocaleString(locale, { maximumFractionDigits: 1 })} KB`;
  return `${(bytes / 1024 ** 2).toLocaleString(locale, { maximumFractionDigits: 1 })} MB`;
}

export type { NodeInspection } from "./types";
