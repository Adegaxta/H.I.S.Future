import type { LexicalQueryAnalysis } from "../../lexicon";
import type { NodeItem } from "../../types/nodes";
import type { ExplicitNodeReference } from "../AINodeInspector";
import type { ResolvedEntity } from "./types";
import { normalize, whole } from "./utils";

function compact(value: string): string {
  return normalize(value).replace(/\s+/gu, "");
}

export function resolveEntities(query: string, lexical: LexicalQueryAnalysis, nodes: readonly NodeItem[], references: readonly ExplicitNodeReference[]): ResolvedEntity[] {
  const found = new Map<string, ResolvedEntity>();
  for (const reference of references) {
    if (!reference.nodeId || !reference.resolvedName) continue;
    const key = normalize(reference.resolvedName);
    found.set(key, { canonical: reference.resolvedName, normalized: key, namespace: "lore", nodeIds: [reference.nodeId, ...reference.ambiguousNodeIds], source: "explicit_reference", strength: "strong" });
  }
  for (const match of lexical.entities) {
    if (match.ambiguous || !match.entry || match.entry.category === "app" && normalize(match.canonical) === "nodo") continue;
    const key = normalize(match.canonical);
    const nodeIds = nodes.filter((node) => normalize(node.name) === key).map((node) => node.id);
    if (!found.has(key)) found.set(key, { canonical: match.canonical, normalized: key, namespace: match.namespace, nodeIds, source: "lexicon", strength: "strong" });
  }
  const normalizedQuery = normalize(query);
  const compactQueryTerms = normalizedQuery.split(/\s+/gu).map(compact).filter((term) => term.length >= 5);
  const labels = [...nodes].sort((a, b) => normalize(b.name).length - normalize(a.name).length);
  for (const node of labels) {
    const key = normalize(node.name);
    const compactKey = compact(key);
    const punctuationInsensitiveMatch = compactKey.length >= 5 && compactQueryTerms.includes(compactKey);
    if (key.length < 3 || (!whole(normalizedQuery, key) && !punctuationInsensitiveMatch) || found.has(key)) continue;
    found.set(key, { canonical: node.name, normalized: key, namespace: "lore", nodeIds: nodes.filter((candidate) => normalize(candidate.name) === key || compact(candidate.name) === compactKey).map((candidate) => candidate.id), source: "node_name", strength: "strong" });
  }
  return [...found.values()].filter((entity, index, all) => !all.some((other, otherIndex) => otherIndex !== index && other.normalized.length > entity.normalized.length && whole(other.normalized, entity.normalized)));
}
