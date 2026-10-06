import type { NodeItem } from "../types/nodes";
import { hisLexicon, normalizeLexicalText } from "../lexicon";
import {
  AI_NODE_LIMITS,
  classifyAINodeIntent,
  createAINodeInspector,
  resolveExplicitNodeReferences,
  selectNodeContent,
  type AINodeContentMode,
  type AINodeIntent,
  type AINodeStructure,
  type ExplicitNodeReference,
} from "./AINodeInspector";

export const NODE_CONTEXT_LIMITS = {
  maxTerms: 8,
  maxNodes: 3,
  maxFragmentChars: 900,
  maxTotalFragmentChars: 2_400,
  maxSourceNameChars: 160,
  maxSourceIdChars: 120,
  maxSerializedContextChars: 16_000,
  maxTraceCandidates: 8,
} as const;

export const NODE_RETRIEVAL_WEIGHTS = {
  // Explicit chat references bypass discovery. Calls are the next strongest
  // evidence because they store a target Node id; names/headings/text follow.
  explicitReference: 5_000,
  callToRequestedNode: 1_600,
  exactQueryName: 1_200,
  queryContainsName: 900,
  exactNameTerm: 700,
  nameWholeTerm: 420,
  namePartialTerm: 260,
  headingWholeTerm: 180,
  contentWholeTerm: 90,
  contentPartialTerm: 45,
} as const;

export type NodeContextStatus = "no_context" | "context_found";

export interface NodeContextSource {
  nodeId: string;
  name: string;
  type: NodeItem["type"];
  score: number;
  matchedTerms: string[];
  fragment: string;
  reason?: "useful_content";
}

export interface NodeContextDocument {
  structure: AINodeStructure;
  contentMode: AINodeContentMode;
  content: string;
  targetReason: "explicit_reference" | "exact_name";
}

export interface NodeContextCandidateTrace {
  nodeId: string;
  name: string;
  score: number;
  matchedTerms: string[];
  reasons: string[];
  excludedReason?: "empty_content";
}

export interface NodeContextResult {
  status: NodeContextStatus;
  terms: string[];
  sources: NodeContextSource[];
  totalFragmentChars: number;
  shouldMentionNoContext: boolean;
  candidateCount: number;
  candidates: NodeContextCandidateTrace[];
  intent: AINodeIntent;
  mode: "fragments" | "full_node" | "structural_summary";
  explicitReferences: ExplicitNodeReference[];
  documents: NodeContextDocument[];
  inspectionMs: number;
  appNodeQuestion: boolean;
}

interface RankedNode {
  node: NodeItem;
  text: string;
  normalizedText: string;
  score: number;
  matchedTerms: string[];
  isExactNameMatch: boolean;
  structure: AINodeStructure;
  reasons: string[];
}

const GREETING_QUERIES = new Set([
  "hola", "buenas", "buen dia", "buenos dias", "buenas tardes", "buenas noches", "hey", "hi", "hello",
  "como estas", "como va", "que tal",
]);

function normalize(value: string): string {
  return normalizeLexicalText(value);
}

function compactText(value: string): string {
  return value
    .replace(/\r/g, "")
    .replace(/[\t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function significantTerms(query: string): string[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery || GREETING_QUERIES.has(normalizedQuery)) return [];
  return hisLexicon.analyzeQuery(query).significantTerms.slice(0, NODE_CONTEXT_LIMITS.maxTerms);
}

function containsWholeTerm(haystack: string, term: string): boolean {
  return (` ${haystack} `).includes(` ${term} `);
}

function scoreNode(
  node: NodeItem,
  structure: AINodeStructure,
  query: string,
  terms: readonly string[],
  explicitIds: ReadonlySet<string>,
  requestedTargetIds: ReadonlySet<string>,
): RankedNode | null {
  const normalizedQuery = normalize(query);
  const normalizedName = normalize(node.name);
  const text = compactText(structure.markdown);
  const normalizedText = normalize(text);
  const isExactNameMatch = normalizedName === normalizedQuery || terms.some((term) => normalizedName === term);
  let score = 0;
  const matchedTerms = new Set<string>();
  const reasons = new Set<string>();

  if (explicitIds.has(node.id)) { score += NODE_RETRIEVAL_WEIGHTS.explicitReference; reasons.add("explicit_reference"); }
  if (normalizedName && normalizedName === normalizedQuery) { score += NODE_RETRIEVAL_WEIGHTS.exactQueryName; reasons.add("exact_name"); }
  else if (normalizedName && normalizedQuery.includes(normalizedName) && normalizedName.length >= 3) { score += NODE_RETRIEVAL_WEIGHTS.queryContainsName; reasons.add("query_contains_name"); }

  for (const term of terms) {
    if (normalizedName === term) {
      score += NODE_RETRIEVAL_WEIGHTS.exactNameTerm;
      reasons.add("exact_name_term");
      matchedTerms.add(term);
    } else if (containsWholeTerm(normalizedName, term)) {
      score += NODE_RETRIEVAL_WEIGHTS.nameWholeTerm;
      reasons.add("name_term");
      matchedTerms.add(term);
    } else if (normalizedName.includes(term)) {
      score += NODE_RETRIEVAL_WEIGHTS.namePartialTerm;
      reasons.add("name_partial");
      matchedTerms.add(term);
    }

    const headingMatches = structure.headings.some((heading) => containsWholeTerm(normalize(heading.text), term));
    if (headingMatches) {
      score += NODE_RETRIEVAL_WEIGHTS.headingWholeTerm;
      reasons.add("heading");
      matchedTerms.add(term);
    }
    if (containsWholeTerm(normalizedText, term)) {
      score += NODE_RETRIEVAL_WEIGHTS.contentWholeTerm;
      reasons.add("content");
      matchedTerms.add(term);
    } else if (normalizedText.includes(term)) {
      score += NODE_RETRIEVAL_WEIGHTS.contentPartialTerm;
      reasons.add("content_partial");
      matchedTerms.add(term);
    }
  }

  if (structure.calls.some((call) => requestedTargetIds.has(call.targetId))) {
    score += NODE_RETRIEVAL_WEIGHTS.callToRequestedNode;
    reasons.add("call_to_requested_node");
  }

  if (score === 0) return null;
  score += Math.min(matchedTerms.size, 4) * 15;
  return {
    node,
    text,
    normalizedText,
    score,
    matchedTerms: [...matchedTerms],
    isExactNameMatch,
    structure,
    reasons: [...reasons],
  };
}

function clippedWindow(text: string, terms: readonly string[], limit: number): string {
  if (text.length <= limit) return text;
  const normalizedText = normalize(text);
  const firstMatch = terms
    .map((term) => normalizedText.indexOf(term))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0] ?? 0;
  const start = Math.max(0, firstMatch - Math.floor(limit * 0.25));
  const end = Math.min(text.length, start + limit);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

function buildFragment(candidate: RankedNode, limit: number): string {
  if (!candidate.text) return "";
  const paragraphs = candidate.text.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
  if (paragraphs.length === 0) return clippedWindow(candidate.text, candidate.matchedTerms, limit);

  let focusIndex = 0;
  let focusScore = -1;
  paragraphs.forEach((paragraph, index) => {
    const normalizedParagraph = normalize(paragraph);
    const matchedTermCount = candidate.matchedTerms.reduce(
      (total, term) => total + (normalizedParagraph.includes(term) ? 1 : 0),
      0,
    );
    const paragraphScore = matchedTermCount * 10_000 + Math.min(paragraph.length, 2_000);
    if (paragraphScore > focusScore) {
      focusIndex = index;
      focusScore = paragraphScore;
    }
  });

  if (paragraphs[focusIndex].length >= limit) {
    return clippedWindow(paragraphs[focusIndex], candidate.matchedTerms, limit);
  }

  const selected = [paragraphs[focusIndex]];
  const previous = focusIndex > 0 ? paragraphs[focusIndex - 1] : null;
  if (previous && previous.length <= 200 && previous.length + selected[0].length + 2 <= limit) {
    selected.unshift(previous);
  }
  for (let index = focusIndex + 1; index < paragraphs.length; index += 1) {
    const currentLength = selected.join("\n\n").length;
    if (currentLength + paragraphs[index].length + 2 > limit) break;
    selected.push(paragraphs[index]);
  }
  return selected.join("\n\n");
}

function looksLikeInternalQuery(query: string, terms: readonly string[]): boolean {
  const normalizedQuery = normalize(query);
  if (/\b(h i s|proyecto|nodo|pagina|nota|mis notas|documento interno)\b/.test(normalizedQuery)) return true;
  const tokens = query.split(/\s+/).filter(Boolean);
  return tokens.some((token, index) => {
    const cleaned = token.replace(/[^\p{L}\p{N}-]/gu, "");
    const canBeProperName = index > 0 || tokens.length === 1;
    return canBeProperName
      && cleaned.length >= 3
      && /^\p{Lu}/u.test(cleaned)
      && terms.includes(normalize(cleaned));
  });
}

function isAppNodeQuestion(query: string): boolean {
  const normalizedQuery = normalize(query);
  return /\b(?:nodo|nodos)\b.*\b(?:his|aplicacion|app)\b|\b(?:his|aplicacion|app)\b.*\b(?:nodo|nodos)\b/u.test(normalizedQuery);
}

export function retrieveNodeContext(query: string, nodes: readonly NodeItem[]): NodeContextResult {
  const terms = significantTerms(query);
  const intent = classifyAINodeIntent(query);
  const appNodeQuestion = isAppNodeQuestion(query);
  const explicitReferences = resolveExplicitNodeReferences(query, nodes);
  const explicitIds = new Set(explicitReferences.flatMap((reference) => reference.nodeId ? [reference.nodeId] : []));
  if (terms.length === 0 && explicitIds.size === 0 && !appNodeQuestion) {
    return {
      status: "no_context",
      terms,
      sources: [],
      totalFragmentChars: 0,
      shouldMentionNoContext: false,
      candidateCount: 0,
      candidates: [],
      intent,
      mode: "fragments",
      explicitReferences,
      documents: [],
      inspectionMs: 0,
      appNodeQuestion,
    };
  }

  const uniqueNodes = [...new Map(nodes.map((node) => [node.id, node])).values()];
  const normalizedQuery = normalize(query);
  const requestedTargetIds = explicitIds.size > 0
    ? explicitIds
    : new Set(uniqueNodes.filter((node) => {
      const name = normalize(node.name);
      return name.length >= 3 && containsWholeTerm(normalizedQuery, name);
    }).map((node) => node.id));
  const inspectionStarted = typeof performance !== "undefined" ? performance.now() : Date.now();
  const inspector = createAINodeInspector(uniqueNodes);
  const structures = new Map(inspector.inspectAll().map((structure) => [structure.id, structure]));
  const inspectionMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - inspectionStarted;

  const ranked = uniqueNodes
    .map((node) => structures.has(node.id) ? scoreNode(node, structures.get(node.id)!, query, terms, explicitIds, requestedTargetIds) : null)
    .filter((candidate): candidate is RankedNode => candidate !== null)
    .sort((left, right) =>
      right.score - left.score
      || left.node.name.localeCompare(right.node.name, "es", { sensitivity: "base" })
      || left.node.id.localeCompare(right.node.id),
    );

  const candidates = ranked.slice(0, NODE_CONTEXT_LIMITS.maxTraceCandidates).map((candidate) => ({
    nodeId: candidate.node.id,
    name: candidate.node.name,
    score: candidate.score,
    matchedTerms: candidate.matchedTerms,
    reasons: candidate.reasons,
    ...(!candidate.text.trim() ? { excludedReason: "empty_content" as const } : {}),
  }));

  const exactTargets = ranked.filter((candidate) => candidate.isExactNameMatch).slice(0, AI_NODE_LIMITS.maxDocuments);
  const targetCandidates = [
    ...explicitReferences.flatMap((reference) => {
      if (!reference.nodeId) return [];
      const candidate = ranked.find((item) => item.node.id === reference.nodeId);
      return candidate ? [candidate] : [];
    }),
    ...exactTargets,
  ].filter((candidate, index, all) => all.findIndex((item) => item.node.id === candidate.node.id) === index)
    .slice(0, AI_NODE_LIMITS.maxDocuments);

  const documents: NodeContextDocument[] = targetCandidates.map((candidate) => {
    const focused = buildFragment(candidate, NODE_CONTEXT_LIMITS.maxFragmentChars);
    const selected = selectNodeContent(candidate.structure, intent, focused);
    return {
      structure: candidate.structure,
      contentMode: selected.mode,
      content: selected.content,
      targetReason: explicitIds.has(candidate.node.id) ? "explicit_reference" : "exact_name",
    };
  });

  const sources: NodeContextSource[] = [];
  let remainingChars = NODE_CONTEXT_LIMITS.maxTotalFragmentChars;
  for (const candidate of ranked) {
    if (sources.length === NODE_CONTEXT_LIMITS.maxNodes || remainingChars <= 0) break;
    if (documents.some((document) => document.structure.id === candidate.node.id && document.contentMode !== "none")) continue;
    const fragment = buildFragment(candidate, Math.min(NODE_CONTEXT_LIMITS.maxFragmentChars, remainingChars));
    if (!fragment) continue;
    sources.push({
      nodeId: candidate.node.id,
      name: candidate.node.name,
      type: candidate.node.type,
      score: candidate.score,
      matchedTerms: candidate.matchedTerms,
      fragment,
      reason: "useful_content",
    });
    remainingChars -= fragment.length;
  }

  const totalFragmentChars = sources.reduce((total, source) => total + source.fragment.length, 0);
  return {
    status: sources.length > 0 || documents.length > 0 || appNodeQuestion ? "context_found" : "no_context",
    terms,
    sources,
    totalFragmentChars,
    shouldMentionNoContext: sources.length === 0 && looksLikeInternalQuery(query, terms),
    candidateCount: ranked.length,
    candidates,
    intent,
    mode: intent === "full_node" || intent === "summary" ? "full_node" : intent === "relations" || intent === "structure" ? "structural_summary" : "fragments",
    explicitReferences,
    documents,
    inspectionMs,
    appNodeQuestion,
  };
}
