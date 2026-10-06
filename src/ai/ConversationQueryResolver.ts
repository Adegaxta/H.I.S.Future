import type { NodeItem } from "../types/nodes";
import { hisLexicon, normalizeLexicalText } from "../lexicon";
import type { AIConcept } from "./types";

const MAX_HISTORY_USER_TURNS = 8;
const MAX_TOPIC_CHARS = 80;

const ENTITY_STOP_WORDS = new Set([
  "acerca", "antes", "como", "concepto", "cuando", "despues", "donde", "ella", "ellos", "entonces",
  "esto", "future", "futuro", "historia", "hisfuture", "mundo", "nodo", "numero", "pagina", "porque",
  "proyecto", "quien", "sobre", "universo",
]);

const GREETINGS = new Set([
  "hola", "buenas", "buen dia", "buenos dias", "buenas tardes", "buenas noches", "hey", "hi", "hello",
  "como estas", "como va", "que tal",
]);

export interface ConversationQueryTurn {
  role: "user" | "assistant";
  content: string;
  error?: boolean;
  pending?: boolean;
}

export type ConversationQueryResolutionKind =
  | "explicit_entity"
  | "previous_user_entity"
  | "recent_active_entity"
  | "previous_topic"
  | "unchanged";

export interface ConversationQueryResolution {
  originalQuery: string;
  effectiveQuery: string;
  activeEntities: string[];
  activeTopic: string | null;
  kind: ConversationQueryResolutionKind;
}

function normalize(value: string): string {
  return normalizeLexicalText(value);
}

function containsWholeTerm(text: string, term: string): boolean {
  return (` ${text} `).includes(` ${term} `);
}

function displayMention(value: string): string {
  const cleaned = value.replace(/[^\p{L}\p{N}-]/gu, "").trim();
  if (!cleaned) return "";
  return `${cleaned.charAt(0).toLocaleUpperCase("es")}${cleaned.slice(1)}`;
}

function knownLabels(nodes: readonly NodeItem[], concepts: readonly AIConcept[]): string[] {
  const labels = [
    ...nodes.map((node) => node.name.trim()),
    ...concepts.flatMap((concept) => [concept.name, ...(concept.aliases ?? [])]),
  ].filter(Boolean);
  return [...new Map(labels.map((label) => [normalize(label), label])).values()];
}

function detectKnownEntities(
  query: string,
  nodes: readonly NodeItem[],
  concepts: readonly AIConcept[],
): string[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return [];
  const labels = knownLabels(nodes, concepts);
  const found: string[] = hisLexicon.analyzeQuery(query).entities
    .filter((match) => !match.ambiguous)
    .map((match) => match.canonical);

  for (const label of labels) {
    const normalizedLabel = normalize(label);
    if (normalizedLabel.length >= 3 && containsWholeTerm(normalizedQuery, normalizedLabel)) found.push(label);
  }

  const queryTokens = query
    .split(/\s+/)
    .map((raw) => ({ raw, normalized: normalize(raw) }))
    .filter(({ normalized }) => normalized.length >= 4 && !ENTITY_STOP_WORDS.has(normalized));
  const labelTokens = labels.flatMap((label) => normalize(label).split(" "));
  for (const token of queryTokens) {
    const matchesKnownLabel = labelTokens.some((knownToken) =>
      knownToken === token.normalized
      || (token.normalized.length >= 5 && knownToken.startsWith(token.normalized)),
    );
    if (matchesKnownLabel) found.push(displayMention(token.raw));
  }

  return [...new Map(found.map((entity) => [normalize(entity), entity])).values()];
}

function explicitTopic(query: string): string | null {
  const numberTopic = query.match(/\b(?:n[uú]mero)\s+\d+\b/iu)?.[0];
  if (numberTopic) return numberTopic.slice(0, MAX_TOPIC_CHARS);

  const quotedTopic = query.match(/[“"']([^”"']{2,80})[”"']/u)?.[1]?.trim();
  if (quotedTopic) return quotedTopic;

  const trailingTopic = query.match(/\b(?:sobre|acerca de|de)\s+(?:el|la|los|las)?\s*([^?!.]{3,80})/iu)?.[1]?.trim();
  if (!trailingTopic) return null;
  return trailingTopic.replace(/\s+(?:en|dentro de)\s+his\s*future$/iu, "").slice(0, MAX_TOPIC_CHARS).trim() || null;
}

function isVagueFollowUp(query: string): boolean {
  const normalized = normalize(query);
  if (!normalized || GREETINGS.has(normalized)) return false;
  if (/\b(el|ella|ellos|ellas|eso|esto|ese|esa|ahi)\b/u.test(normalized)) return true;
  return [
    /^(?:y )?cuando (?:murio|muere|murieron)$/u,
    /^(?:y )?que paso despues$/u,
    /^(?:y )?que hizo despues$/u,
    /^(?:y )?antes$/u,
    /^(?:y )?por que$/u,
    /^(?:y )?como ocurrio$/u,
    /^(?:y )?como funciona$/u,
    /^(?:pero )?sale mas veces$/u,
  ].some((pattern) => pattern.test(normalized));
}

function groundFollowUp(query: string, reference: string): string {
  let effective = query.trim().replace(/[?¿!¡]+$/g, "").replace(/^(?:y|pero)\s+/iu, "").trim();
  effective = effective.replace(/\b(?:él|ella|ellos|ellas|eso|esto|ese|esa|ahí)\b/giu, reference);
  if (containsWholeTerm(normalize(effective), normalize(reference))) return effective;
  if (/\b(?:después|antes)\b/iu.test(effective)) {
    return effective.replace(/\b(después|antes)\b/iu, `${reference} $1`);
  }
  return `${effective} ${reference}`.trim();
}

export function resolveConversationQuery(
  originalQuery: string,
  history: readonly ConversationQueryTurn[],
  nodes: readonly NodeItem[],
  concepts: readonly AIConcept[],
): ConversationQueryResolution {
  const currentEntities = detectKnownEntities(originalQuery, nodes, concepts);
  if (currentEntities.length > 0) {
    return {
      originalQuery,
      effectiveQuery: originalQuery,
      activeEntities: currentEntities,
      activeTopic: explicitTopic(originalQuery),
      kind: "explicit_entity",
    };
  }

  if (!isVagueFollowUp(originalQuery)) {
    return {
      originalQuery,
      effectiveQuery: originalQuery,
      activeEntities: [],
      activeTopic: explicitTopic(originalQuery),
      kind: "unchanged",
    };
  }

  const recentUserTurns = history
    .filter((turn) => turn.role === "user" && !turn.error && !turn.pending && turn.content.trim())
    .slice(-MAX_HISTORY_USER_TURNS)
    .reverse();

  for (let index = 0; index < recentUserTurns.length; index += 1) {
    const entities = detectKnownEntities(recentUserTurns[index].content, nodes, concepts);
    if (entities.length === 0) continue;
    return {
      originalQuery,
      effectiveQuery: groundFollowUp(originalQuery, entities[0]),
      activeEntities: entities,
      activeTopic: null,
      kind: index === 0 ? "previous_user_entity" : "recent_active_entity",
    };
  }

  for (const turn of recentUserTurns) {
    const topic = explicitTopic(turn.content);
    if (!topic) continue;
    return {
      originalQuery,
      effectiveQuery: groundFollowUp(originalQuery, topic),
      activeEntities: [],
      activeTopic: topic,
      kind: "previous_topic",
    };
  }

  return {
    originalQuery,
    effectiveQuery: originalQuery,
    activeEntities: [],
    activeTopic: null,
    kind: "unchanged",
  };
}
