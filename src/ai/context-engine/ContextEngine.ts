import { hisLexicon } from "../../lexicon";
import { createAINodeInspector, resolveExplicitNodeReferences } from "../AINodeInspector";
import { resolveAIConcepts } from "../ConceptResolver";
import { applyContextBudget } from "./ContextBudgetManager";
import { buildContextV1 } from "./ContextBuilderV1";
import { expandContexts } from "./ContextExpander";
import { resolveConversationMemory } from "./ConversationMemory";
import { resolveEntities } from "./EntityResolver";
import { gradeEvidence } from "./EvidenceGrader";
import { resolveIntents } from "./IntentResolver";
import { buildQueryPlan } from "./QueryPlanner";
import { buildResponsePlan } from "./ResponsePlanner";
import { resolveScope } from "./ScopeResolver";
import { rankCandidates } from "./CandidateRanker";
import { chunkStructure } from "./StructuralChunker";
import { buildStructuralGraph } from "./StructuralGraph";
import type { ContextEngineInput, ContextEngineResult, ResolvedEntity } from "./types";
import { normalize, timed } from "./utils";

function mergeEntities(primary: readonly ResolvedEntity[], inheritedNames: readonly string[]): ResolvedEntity[] {
  const inherited = inheritedNames.map((canonical) => ({ canonical, normalized: normalize(canonical), namespace: "lore", nodeIds: [], source: "node_name" as const, strength: "medium" as const }));
  return [...new Map([...primary, ...inherited].map((entity) => [entity.normalized, entity])).values()];
}

export function runContextEngine(input: ContextEngineInput): ContextEngineResult {
  const lexical = timed(() => hisLexicon.analyzeQuery(input.query));
  const initialReferences = resolveExplicitNodeReferences(input.query, input.nodes);
  const initialEntities = resolveEntities(input.query, lexical.value, input.nodes, initialReferences);
  const scope = timed(() => resolveScope(input.query, lexical.value, initialEntities));
  const memory = timed(() => resolveConversationMemory(input.query, input.history, input.nodes, initialEntities));
  const effectiveLexicalTiming = memory.value.effectiveQuery === input.query ? null : timed(() => hisLexicon.analyzeQuery(memory.value.effectiveQuery));
  const effectiveLexical = effectiveLexicalTiming?.value ?? lexical.value;
  if (effectiveLexicalTiming) lexical.timeMs += effectiveLexicalTiming.timeMs;
  const references = timed(() => resolveExplicitNodeReferences(memory.value.effectiveQuery, input.nodes));
  const entities = timed(() => mergeEntities(resolveEntities(memory.value.effectiveQuery, effectiveLexical, input.nodes, references.value), memory.value.inheritedEntities));
  const finalScopeTiming = timed(() => resolveScope(memory.value.effectiveQuery, effectiveLexical, entities.value));
  const finalScope = finalScopeTiming.value;
  scope.value = finalScope;
  scope.timeMs += finalScopeTiming.timeMs;
  const intent = timed(() => resolveIntents(input.query, effectiveLexical));
  const plan = timed(() => buildQueryPlan(input.query, finalScope, entities.value, intent.value));
  const inspectionStart = typeof performance !== "undefined" ? performance.now() : Date.now();
  const structures = createAINodeInspector(input.nodes).inspectAll();
  const inspectionMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - inspectionStart;
  const chunks = structures.flatMap(chunkStructure);
  const graph = timed(() => buildStructuralGraph(structures));
  const retrieval = timed(() => rankCandidates(memory.value.effectiveQuery, plan.value, chunks, structures, graph.value.edges));
  const expansion = timed(() => expandContexts(plan.value, structures, retrieval.value));
  const evidence = timed(() => gradeEvidence(plan.value, expansion.value));
  const responsePlan = buildResponsePlan(plan.value);
  const conversationChars = memory.value.modelHistory.reduce((total, turn) => total + turn.content.length, 0);
  const bounded = applyContextBudget(expansion.value, conversationChars);
  const concepts = resolveAIConcepts(memory.value.effectiveQuery, input.concepts ?? []);
  const context = timed(() => buildContextV1({ scope: finalScope, plan: plan.value, evidence: evidence.value, responsePlan, selected: bounded.selected, concepts, budget: bounded.budget }));
  return {
    context: context.value,
    modelHistory: memory.value.modelHistory,
    scope: finalScope,
    memory: memory.value,
    references: references.value,
    entities: entities.value,
    intents: intent.value,
    plan: plan.value,
    selected: bounded.selected,
    evidence: evidence.value,
    responsePlan,
    budget: bounded.budget,
    trace: {
      originalQuery: input.query,
      normalizedQuery: normalize(input.query),
      lexical,
      scope,
      memory,
      references,
      entities,
      intent,
      plan,
      retrieval: { value: { candidateCount: retrieval.value.length, candidates: retrieval.value }, timeMs: retrieval.timeMs + inspectionMs },
      graph: { value: { edgeCount: graph.value.edges.length, expandedNodeIds: bounded.selected.map((item) => item.structure.id) }, timeMs: graph.timeMs },
      expansion,
      evidence,
      context: { value: { chars: context.value?.length ?? 0, budget: bounded.budget }, timeMs: context.timeMs },
    },
  };
}
