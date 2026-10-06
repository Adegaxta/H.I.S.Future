import type { NodeItem } from "../types/nodes";
import { hisLexicon } from "../lexicon";
import { emitAILog } from "./AILogger";
import { buildAIKnowledgeContext, buildGroundedUserMessage, buildNodeKnowledgeContext, combineAIContexts } from "./ContextBuilder";
import { resolveAIConcepts } from "./ConceptResolver";
import { resolveConversationQuery } from "./ConversationQueryResolver";
import type { LocalAIChatMessage } from "./LocalAIClient";
import { retrieveNodeContext } from "./NodeContextRetrieval";
import type { AIConcept, AIMessageData } from "./types";
import { CONTEXT_ENGINE_V1_ENABLED, runContextEngine, type ContextEngineResult } from "./context-engine";

export interface PreparedAIRequest { history: LocalAIChatMessage[]; engine: ContextEngineResult | null; contextChars: number }

export function emitContextEngineLogs(result: ContextEngineResult, requestId: string) {
  const trace = result.trace;
  emitAILog("lexicon", "analysis_complete", { requestId, metadata: { language: trace.lexical.value.language, terms: trace.lexical.value.significantTerms, timeMs: Number(trace.lexical.timeMs.toFixed(2)) } });
  emitAILog("scope", "resolved", { requestId, metadata: { scope: result.scope.scope, confidence: result.scope.confidence, reasons: result.scope.reasons, timeMs: Number(trace.scope.timeMs.toFixed(2)) } });
  emitAILog("memory", "resolved", { requestId, metadata: { inherited: result.memory.inheritedEntities, reason: result.memory.inheritanceReason, modelHistory: result.modelHistory.length, activeEntities: result.memory.state.activeEntities, timeMs: Number(trace.memory.timeMs.toFixed(2)) } });
  emitAILog("resolve", "entities_resolved", { requestId, metadata: { references: result.references.map((reference) => reference.source), entities: result.entities.map((entity) => entity.canonical), effectiveQuery: result.memory.effectiveQuery, timeMs: Number((trace.references.timeMs + trace.entities.timeMs).toFixed(2)) } });
  emitAILog("plan", "query_planned", { requestId, metadata: { intents: result.intents.intents, targets: result.plan.targets.map((target) => target.canonical), aspects: result.plan.aspects, depth: result.plan.desiredDepth, timeMs: Number((trace.intent.timeMs + trace.plan.timeMs).toFixed(2)) } });
  emitAILog("retrieval", "ranked", { requestId, metadata: { candidates: trace.retrieval.value.candidateCount, timeMs: Number(trace.retrieval.timeMs.toFixed(2)) } });
  trace.retrieval.value.candidates.slice(0, 8).forEach((candidate, index) => emitAILog("retrieval", "candidate", { requestId, debugOnly: true, metadata: { rank: index + 1, node: candidate.chunk.nodeName, section: candidate.chunk.section, score: candidate.score, reasons: candidate.reasons } }));
  emitAILog("graph", "expanded", { requestId, metadata: { edges: trace.graph.value.edgeCount, nodeIds: trace.graph.value.expandedNodeIds, timeMs: Number(trace.graph.timeMs.toFixed(2)) } });
  emitAILog("expand", "contexts_selected", { requestId, metadata: { selected: result.selected.map((item) => ({ node: item.structure.name, mode: item.contentMode, chars: item.content.length })), timeMs: Number(trace.expansion.timeMs.toFixed(2)) } });
  emitAILog("evidence", "graded", { requestId, metadata: { status: result.evidence.status, supported: result.evidence.supportedAspects, missing: result.evidence.missingAspects, reasons: result.evidence.reasons, timeMs: Number(trace.evidence.timeMs.toFixed(2)) } });
  emitAILog("context", "serialized", { requestId, metadata: { scope: result.scope.scope, chars: trace.context.value.chars, estimatedTokens: result.budget.estimatedInputTokens, contentChars: result.budget.contentChars, timeMs: Number(trace.context.timeMs.toFixed(2)) } });
}

export function prepareAIRequest(query: string, currentMessages: readonly AIMessageData[], nodes: readonly NodeItem[], concepts: readonly AIConcept[], requestId: string): PreparedAIRequest {
  if (CONTEXT_ENGINE_V1_ENABLED) {
    const engine = runContextEngine({ query, history: currentMessages, nodes, concepts });
    emitContextEngineLogs(engine, requestId);
    return {
      engine,
      contextChars: engine.context?.length ?? 0,
      history: [...engine.modelHistory, { role: "user", content: buildGroundedUserMessage(query, engine.context) }],
    };
  }
  const lexical = hisLexicon.analyzeQuery(query);
  const resolution = resolveConversationQuery(query, currentMessages, nodes, concepts);
  const knowledge = buildAIKnowledgeContext(resolveAIConcepts(resolution.effectiveQuery, concepts));
  const nodeResult = retrieveNodeContext(resolution.effectiveQuery, nodes);
  const context = combineAIContexts(knowledge, buildNodeKnowledgeContext(nodeResult));
  emitAILog("his", "legacy_context_engine", { requestId, metadata: { terms: lexical.significantTerms, selected: nodeResult.sources.length, historyMessages: currentMessages.length } });
  return {
    engine: null,
    contextChars: context?.length ?? 0,
    history: [
      ...currentMessages.filter((message) => !message.error && !message.pending && message.content.trim()).map(({ role, content }) => ({ role, content })),
      { role: "user", content: buildGroundedUserMessage(query, context) },
    ],
  };
}
