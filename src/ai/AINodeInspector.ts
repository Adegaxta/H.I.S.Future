import { documentToMarkdown } from "../export/nodeMarkdown";
import { analyzeDom, analyzeDomFallback } from "../nodes/inspector/domAnalysis";
import { analyzeSource } from "../nodes/inspector/sourceAnalysis";
import type { HeadingInspection, ImageInspection, LinkInspection, TableInspection } from "../nodes/inspector/types";
import { getNodalMeta } from "../nodes/metadata";
import type { NodeItem } from "../types/nodes";
import { hisLexicon, normalizeLexicalText } from "../lexicon";

export const AI_NODE_LIMITS = {
  smallTextChars: 4_500,
  mediumTextChars: 9_000,
  maxFullContentChars: 10_000,
  globalStartChars: 2_200,
  globalEndChars: 1_600,
  maxSectionExcerpts: 5,
  sectionExcerptChars: 650,
  maxDocuments: 3,
  maxRelationsPerDirection: 24,
} as const;

export type AINodeIntent = "point" | "general" | "summary" | "full_node" | "relations" | "structure";
export type AINodeSize = "small" | "medium" | "large";
export type AINodeContentMode = "none" | "full" | "representative" | "global_summary";

export interface AINodeCall {
  targetId: string;
  targetName: string | null;
  count: number;
  broken: boolean;
}

export interface AINodeRelation {
  sourceId: string;
  sourceName: string | null;
  targetId: string;
  targetName: string | null;
  kind: "mention" | "nodal";
  role?: string;
  count: number;
  broken: boolean;
}

export interface AINodeStructure {
  id: string;
  name: string;
  type: NodeItem["type"];
  parentId: string | null;
  parentName: string | null;
  textLength: number;
  htmlLength: number;
  blockCount: number;
  size: AINodeSize;
  headings: HeadingInspection[];
  links: LinkInspection[];
  images: ImageInspection[];
  tables: TableInspection[];
  calls: AINodeCall[];
  totalCalls: number;
  repeatedCalls: number;
  incomingCalls: AINodeRelation[];
  outgoingRelations: AINodeRelation[];
  incomingRelations: AINodeRelation[];
  children: { id: string; name: string; type: NodeItem["type"] }[];
  specialBlocks: {
    globes: number;
    pageIndexes: number;
    columns: number;
    columnLayouts: number;
    syncedBlocks: number;
    embeds: number;
  };
  plainText: string;
  markdown: string;
  inspectionMs: number;
}

export interface ExplicitNodeReference {
  source: string;
  name: string;
  nodeId: string | null;
  resolvedName: string | null;
  ambiguousNodeIds: string[];
}

interface CachedInspection {
  content: string;
  structure: Omit<AINodeStructure, "incomingCalls" | "incomingRelations" | "children" | "parentName" | "inspectionMs">;
}

const cache = new Map<string, CachedInspection>();
const now = () => typeof performance !== "undefined" ? performance.now() : Date.now();

function normalize(value: string): string {
  return normalizeLexicalText(value);
}

function compactText(value: string): string {
  return value.replace(/\r/g, "").replace(/[\t ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function nodeSize(length: number): AINodeSize {
  if (length <= AI_NODE_LIMITS.smallTextChars) return "small";
  if (length <= AI_NODE_LIMITS.mediumTextChars) return "medium";
  return "large";
}

function inspectBase(node: NodeItem, nodesById: ReadonlyMap<string, NodeItem>): CachedInspection["structure"] {
  const cached = cache.get(node.id);
  if (cached?.content === node.content) return cached.structure;
  const source = analyzeSource(node.content);
  const document = typeof DOMParser !== "undefined" ? new DOMParser().parseFromString(source.parseableHtml, "text/html") : null;
  const dom = document ? analyzeDom(document, new Set(nodesById.keys())) : analyzeDomFallback(node.content, new Set(nodesById.keys()));
  const markdown = compactText(document ? documentToMarkdown(document, node.name, false) : dom.text);
  const groupedCalls = new Map<string, AINodeCall>();
  for (const mention of dom.mentions) {
    const current = groupedCalls.get(mention.targetId);
    if (current) current.count += 1;
    else groupedCalls.set(mention.targetId, { targetId: mention.targetId, targetName: nodesById.get(mention.targetId)?.name ?? null, count: 1, broken: !nodesById.has(mention.targetId) });
  }
  const meta = getNodalMeta(node.content);
  const structure: CachedInspection["structure"] = {
    id: node.id,
    name: node.name,
    type: node.type,
    parentId: node.parentId,
    textLength: markdown.length,
    htmlLength: node.content.length,
    blockCount: dom.structure.editorBlocks,
    size: nodeSize(markdown.length),
    headings: dom.headings,
    links: dom.links,
    images: dom.images,
    tables: dom.tables,
    calls: [...groupedCalls.values()],
    totalCalls: dom.mentions.length,
    repeatedCalls: Math.max(0, dom.mentions.length - groupedCalls.size),
    outgoingRelations: meta.relations.map((relation) => ({
      sourceId: node.id,
      sourceName: node.name,
      targetId: relation.targetId,
      targetName: nodesById.get(relation.targetId)?.name ?? null,
      kind: "nodal",
      role: relation.role,
      count: 1,
      broken: !nodesById.has(relation.targetId),
    })),
    specialBlocks: {
      globes: dom.structure.globes,
      pageIndexes: dom.structure.pageIndexes,
      columns: dom.structure.columns,
      columnLayouts: dom.structure.columnLayouts,
      syncedBlocks: dom.structure.syncedBlocks,
      embeds: dom.structure.embeds,
    },
    plainText: dom.text,
    markdown,
  };
  cache.set(node.id, { content: node.content, structure });
  return structure;
}

export function createAINodeInspector(nodes: readonly NodeItem[]) {
  const uniqueNodes = [...new Map(nodes.map((node) => [node.id, node])).values()];
  const nodesById = new Map(uniqueNodes.map((node) => [node.id, node]));
  const liveIds = new Set(nodesById.keys());
  for (const cachedId of cache.keys()) if (!liveIds.has(cachedId)) cache.delete(cachedId);
  const bases = new Map<string, CachedInspection["structure"]>();
  const incomingCalls = new Map<string, AINodeRelation[]>();
  const incomingRelations = new Map<string, AINodeRelation[]>();
  let indexed = false;

  const base = (node: NodeItem) => {
    const existing = bases.get(node.id);
    if (existing) return existing;
    const inspected = inspectBase(node, nodesById);
    bases.set(node.id, inspected);
    return inspected;
  };

  const ensureRelationIndex = () => {
    if (indexed) return;
    indexed = true;
    for (const source of uniqueNodes) {
      const inspected = base(source);
      for (const call of inspected.calls) {
        const items = incomingCalls.get(call.targetId) ?? [];
        items.push({ sourceId: source.id, sourceName: source.name, targetId: call.targetId, targetName: call.targetName, kind: "mention", count: call.count, broken: call.broken });
        incomingCalls.set(call.targetId, items);
      }
      for (const relation of inspected.outgoingRelations) {
        const items = incomingRelations.get(relation.targetId) ?? [];
        items.push(relation);
        incomingRelations.set(relation.targetId, items);
      }
    }
  };

  return {
    inspect(nodeOrId: NodeItem | string): AINodeStructure | null {
      const node = typeof nodeOrId === "string" ? nodesById.get(nodeOrId) : nodeOrId;
      if (!node) return null;
      const started = now();
      ensureRelationIndex();
      const inspected = base(node);
      return {
        ...inspected,
        parentName: node.parentId ? nodesById.get(node.parentId)?.name ?? null : null,
        children: uniqueNodes.filter((candidate) => candidate.parentId === node.id).map(({ id, name, type }) => ({ id, name, type })),
        incomingCalls: (incomingCalls.get(node.id) ?? []).slice(0, AI_NODE_LIMITS.maxRelationsPerDirection),
        incomingRelations: (incomingRelations.get(node.id) ?? []).slice(0, AI_NODE_LIMITS.maxRelationsPerDirection),
        inspectionMs: now() - started,
      };
    },
    inspectAll(): AINodeStructure[] {
      return uniqueNodes.map((node) => this.inspect(node)).filter((item): item is AINodeStructure => item !== null);
    },
  };
}

export function resolveExplicitNodeReferences(query: string, nodes: readonly NodeItem[]): ExplicitNodeReference[] {
  const references: ExplicitNodeReference[] = [];
  const groups = new Map<string, NodeItem[]>();
  for (const node of nodes) {
    const key = normalize(node.name);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(node);
    groups.set(key, group);
  }
  const names = [...groups.keys()].sort((left, right) => right.length - left.length || left.localeCompare(right, "es"));
  for (const match of query.matchAll(/@([^@\n\r]+)/gu)) {
    const raw = match[1].trimStart();
    const normalizedRaw = normalize(raw);
    const matchedName = names.find((name) => normalizedRaw === name || normalizedRaw.startsWith(`${name} `));
    if (!matchedName) {
      const unresolved = raw.split(/[?!,.;:]/u)[0].trim();
      references.push({ source: `@${unresolved}`, name: unresolved, nodeId: null, resolvedName: null, ambiguousNodeIds: [] });
      continue;
    }
    const candidates = groups.get(matchedName)!.slice().sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
    references.push({ source: `@${candidates[0].name}`, name: candidates[0].name, nodeId: candidates[0].id, resolvedName: candidates[0].name, ambiguousNodeIds: candidates.slice(1).map((node) => node.id) });
  }
  return references.slice(0, AI_NODE_LIMITS.maxDocuments);
}

export function classifyAINodeIntent(query: string): AINodeIntent {
  const normalized = normalize(query);
  if (hisLexicon.analyzeQuery(query).intentHints.includes("summary")) return "summary";
  if (/\b(todo|toda|completo|completa|entero|entera)\b.*\b(nodo|pagina|informacion)\b|\b(nodo|pagina)\b.*\b(todo|toda|completo|completa|entero|entera)\b/u.test(normalized)) return "full_node";
  if (/\b(resume|resumen|resumeme|sintetiza|sintesis)\b/u.test(normalized)) return "summary";
  if (/\b(call|calls|mencion|menciones|relacion|relaciones|relacionado|conecta|conectado)\b/u.test(normalized)) return "relations";
  if (/\b(estructura|contiene|seccion|secciones|heading|headings|titulo|titulos|imagen|imagenes|tabla|tablas|tipo de nodo|bloques)\b/u.test(normalized)) return "structure";
  if (/\b(hablame|cuentame|informacion general|quien es|que es)\b/u.test(normalized)) return "general";
  return "point";
}

export function selectNodeContent(structure: AINodeStructure, intent: AINodeIntent, focusedFragment = ""): { mode: AINodeContentMode; content: string } {
  if (!structure.markdown.trim()) return { mode: "none", content: "" };
  if (intent === "relations" || intent === "structure") return { mode: "representative", content: focusedFragment };
  if (intent === "point") return { mode: "representative", content: focusedFragment };
  if (structure.markdown.length <= AI_NODE_LIMITS.maxFullContentChars) return { mode: "full", content: structure.markdown };
  const text = structure.markdown;
  const excerpts = structure.headings.slice(0, AI_NODE_LIMITS.maxSectionExcerpts).map((heading) => {
    const marker = `${"#".repeat(heading.level)} ${heading.text}`;
    const at = text.indexOf(marker);
    return at >= 0 ? text.slice(at, at + AI_NODE_LIMITS.sectionExcerptChars).trim() : marker;
  });
  return {
    mode: "global_summary",
    content: [
      "[INICIO DEL NODO]",
      text.slice(0, AI_NODE_LIMITS.globalStartChars).trim(),
      ...excerpts.flatMap((excerpt, index) => [`[SECCIÓN REPRESENTATIVA ${index + 1}]`, excerpt]),
      "[FINAL DEL NODO]",
      text.slice(-AI_NODE_LIMITS.globalEndChars).trim(),
    ].join("\n\n"),
  };
}
