import { hisLexicon } from "../../lexicon";
import type { NodeItem } from "../../types/nodes";
import { resolveExplicitNodeReferences } from "../AINodeInspector";
import type { ConversationQueryTurn } from "../ConversationQueryResolver";
import { resolveEntities } from "./EntityResolver";
import { resolveIntents } from "./IntentResolver";
import { resolveScope } from "./ScopeResolver";
import type { ConversationState, MemoryResolution, ResolvedEntity } from "./types";
import { normalize } from "./utils";

function dependsOnPrevious(query: string): boolean {
  const text = normalize(query);
  const shortPronounReference = text.split(/\s+/u).length <= 7 && /\b(el|ella|ellos|ellas|eso|esto|ese|esa|ahi)\b/u.test(text);
  return shortPronounReference
    || [
      /^(?:y |pero )?que paso despues$/u,
      /^(?:y |pero )?que ocurrio despues$/u,
      /^(?:y |pero )?cuando murio$/u,
      /^(?:y |pero )?por que$/u,
      /^(?:y |pero )?como ocurrio$/u,
      /^(?:y )?antes$/u,
      /^(?:y )?despues$/u,
    ].some((pattern) => pattern.test(text));
}

function validTurns(history: readonly ConversationQueryTurn[]) {
  return history.filter((turn) => !turn.error && !turn.pending && turn.content.trim());
}

export function resolveConversationMemory(query: string, history: readonly ConversationQueryTurn[], nodes: readonly NodeItem[], currentEntities: readonly ResolvedEntity[]): MemoryResolution {
  const turns = validTurns(history);
  const userTurns = turns.filter((turn) => turn.role === "user").slice(-8).reverse();
  let inherited: ResolvedEntity[] = [];
  let reason: string | null = null;
  if (currentEntities.length === 0 && dependsOnPrevious(query)) {
    for (const turn of userTurns) {
      const lexical = hisLexicon.analyzeQuery(turn.content);
      const references = resolveExplicitNodeReferences(turn.content, nodes);
      inherited = resolveEntities(turn.content, lexical, nodes, references);
      if (inherited.length) { reason = "dependent_follow_up"; break; }
    }
  }
  const active = currentEntities.length ? [...currentEntities] : inherited;
  const effectiveQuery = inherited.length ? `${query.replace(/[?¿!¡]+$/gu, "").trim()} ${inherited[0].canonical}` : query;
  const currentLexical = hisLexicon.analyzeQuery(effectiveQuery);
  const currentIntent = resolveIntents(query, currentLexical);
  const scope = resolveScope(effectiveQuery, currentLexical, active);
  const relevantHistory = reason ? turns.slice(-2).map(({ role, content }) => ({ role, content })) : [];
  const state: ConversationState = {
    activeEntities: active.map((entity) => entity.canonical),
    activeScope: scope.scope,
    recentTopics: userTurns.slice(0, 3).map((turn) => turn.content.slice(0, 120)),
    lastIntent: currentIntent.intents[0] ?? null,
    recentTargetIds: active.flatMap((entity) => entity.nodeIds),
  };
  return { state, effectiveQuery, inheritedEntities: inherited.map((entity) => entity.canonical), inheritanceReason: reason, modelHistory: relevantHistory.slice(-4) };
}
