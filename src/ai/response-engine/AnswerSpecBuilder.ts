import type { ContextEngineResult, QueryIntent, SelectedContext } from "../context-engine";
import { normalize } from "../context-engine/utils";
import { GEMITAV_DEFAULT_PERSONALITY } from "./PersonalityProfile";
import type { AnswerSpec, AuthorizedFact, AuthorizedRelation, ConversationActResult, EvidenceRef, GemitaVConversationState, PreviousResponseOperation } from "./types";

const MAX_FACTS = 36;
const MAX_FACT_CHARS = 900;

interface FactCandidate {
  fact: AuthorizedFact;
  source: SelectedContext;
  section: string | null;
  score: number;
  aspects: string[];
}

function cleanText(value: string): string {
  return value
    .replace(/<[^>]+>/gu, " ")
    .replace(/^\s{0,3}#{1,6}\s+.*$/gmu, " ")
    .replace(/^\s*(?:[-*+] |\d+[.)]\s+)/gmu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function withoutKnownHeadings(value: string, source: SelectedContext): string {
  return source.structure.headings.reduce((text, heading) => text.split(heading.text).join(" "), value);
}

function sentences(value: string): string[] {
  const clean = cleanText(value);
  return clean.match(/[^.!?\n]+(?:[.!?]+|$)/gu)?.map((part) => part.trim()).filter((part) => part.length >= 8) ?? [];
}

function mentionsTarget(value: string, targets: readonly string[]): boolean {
  if (targets.length === 0) return true;
  const text = normalize(value);
  const compactText = text.replace(/\s+/gu, "");
  return targets.some((target) => {
    const term = normalize(target);
    const compactTerm = term.replace(/\s+/gu, "");
    return term.length >= 3 && (text.includes(term) || compactTerm.length >= 5 && compactText.includes(compactTerm));
  });
}

function aspectsForSentence(sentence: string, requiredAspects: readonly string[], targets: readonly string[]): string[] {
  const text = normalize(sentence);
  const direct = mentionsTarget(sentence, targets);
  return requiredAspects.filter((aspect) => {
    switch (aspect) {
      case "definition": return targets.length > 0 && direct && /\b(?:es|son|se define|consiste|se refiere)\b/u.test(text);
      case "origin": return direct && /\b(?:origen|nacio|surgio|se formo|cread[oa]s?)\b/u.test(text);
      case "functioning": return direct && /\b(?:funciona|mediante|cuando|proceso|mecanismo|permite|produce)\b/u.test(text);
      case "components": return direct && /\b(?:componentes|partes|compone|formad[oa]s? por|produce|producen)\b/u.test(text);
      case "relations": return direct && /\b(?:relacion|conecta|vinculo|junto|entre|participa|forma)\b/u.test(text);
      case "role": return direct && /\b(?:papel|funcion|importancia|conecta|conserva|permite|participa)\b/u.test(text);
      case "timeline": return direct && /\b(?:\d{3,4}|antes|despues|durante|murio|nacio|fecha)\b/u.test(text);
      case "cause": return direct && /\b(?:porque|debido|causa|provoco|origino|por eso|cuando)\b/u.test(text);
      case "exact_color": return direct && /\b(?:azul|verde|rojo|amarillo|negro|blanco|violeta|morado|naranja|gris|dorado|plateado|cian|magenta|turquesa)(?:es|a|o|as|os)?\b/u.test(text);
      case "overview":
      case "answer": return direct;
      default: return direct;
    }
  });
}

function factBudget(intents: readonly QueryIntent[], requiredAspects: readonly string[]): number {
  if (intents.includes("DEFINITION") && requiredAspects.every((aspect) => aspect === "definition")) return 3;
  if (intents.includes("FULL_NODE")) return 24;
  if (intents.includes("SUMMARY")) return 10;
  if (intents.includes("COMPARE") || requiredAspects.length >= 3) return 12;
  return 5;
}

function candidateScore(source: SelectedContext, section: string | null, sentence: string, targets: readonly string[], aspects: readonly string[]): number {
  let score = source.score;
  if (mentionsTarget(sentence, targets)) score += 1_000;
  if (mentionsTarget(section ?? "", targets)) score += 2_000;
  if (mentionsTarget(source.structure.name, targets)) score += 1_600;
  if (source.targetReason === "resolved_target") score += 800;
  if (source.rankingReasons.includes("heading_match")) score += 500;
  if (aspects.includes("definition")) score += 700;
  return score;
}

function collectEvidenceAndFacts(selected: readonly SelectedContext[], targets: readonly string[], requiredAspects: readonly string[]): { evidence: EvidenceRef[]; candidates: FactCandidate[] } {
  const evidence: EvidenceRef[] = [];
  const candidates: FactCandidate[] = [];
  const seenFacts = new Set<string>();
  for (const item of selected) {
    const chunks = item.chunks.length ? item.chunks : item.content ? [{ id: `${item.structure.id}:content`, text: item.content, section: null }] : [];
    for (const chunk of chunks) {
      const answerText = withoutKnownHeadings(chunk.text, item);
      const text = cleanText(answerText).slice(0, MAX_FACT_CHARS);
      if (!text) continue;
      const ref: EvidenceRef = { id: `ev-${evidence.length + 1}`, sourceId: item.structure.id, text, kind: "content" };
      evidence.push(ref);
      for (const sentence of sentences(answerText)) {
        if (candidates.length >= MAX_FACTS) break;
        const key = normalize(sentence);
        if (!key || seenFacts.has(key)) continue;
        seenFacts.add(key);
        const aspects = aspectsForSentence(sentence, requiredAspects, targets);
        candidates.push({
          fact: {
            id: `fact-${candidates.length + 1}`,
            semanticType: aspects.includes("definition") ? "definition" : "claim",
            text: sentence.slice(0, MAX_FACT_CHARS),
            entityIds: targets.filter((target) => mentionsTarget(sentence, [target])),
            evidenceIds: [ref.id],
            confidence: aspects.length ? 0.95 : 0.75,
          },
          source: item,
          section: "section" in chunk ? chunk.section : null,
          score: candidateScore(item, "section" in chunk ? chunk.section : null, sentence, targets, aspects),
          aspects,
        });
      }
    }
  }
  return { evidence, candidates };
}

function collectRelations(selected: readonly SelectedContext[], evidence: readonly EvidenceRef[]): AuthorizedRelation[] {
  return selected.flatMap((item) => [
    ...item.structure.calls.filter((relation) => !relation.broken).map((relation) => ({ source: item.structure.name, relation: "calls", target: relation.targetName ?? relation.targetId })),
    ...item.structure.outgoingRelations.filter((relation) => !relation.broken).map((relation) => ({ source: item.structure.name, relation: relation.kind, target: relation.targetName ?? relation.targetId })),
  ]).map((relation, index) => ({
    id: `rel-${index + 1}`,
    ...relation,
    evidenceIds: evidence.filter((ref) => ref.sourceId === selected.find((item) => item.structure.name === relation.source)?.structure.id).map((ref) => ref.id),
  }));
}

function pruneForAnswer(engine: ContextEngineResult, targets: readonly string[]) {
  const requiredAspects = engine.responsePlan.requiredAspects;
  const { evidence: evidenceBefore, candidates } = collectEvidenceAndFacts(engine.selected, targets, requiredAspects);
  const relationsBefore = collectRelations(engine.selected, evidenceBefore);
  const budget = factBudget(engine.intents.intents, requiredAspects);
  const selectedCandidates = candidates
    .filter((candidate) => candidate.aspects.length > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, budget);
  const authorizedFacts = selectedCandidates.map(({ fact }, index) => ({ ...fact, id: `fact-${index + 1}` }));
  const selectedEvidenceIds = new Set(authorizedFacts.flatMap((fact) => fact.evidenceIds));
  const evidence = evidenceBefore.filter((ref) => selectedEvidenceIds.has(ref.id));
  const relationBudget = requiredAspects.includes("relations") ? (engine.intents.intents.includes("RELATIONS") ? 6 : 3) : 0;
  const relations = relationsBefore
    .filter((relation) => mentionsTarget(relation.source, targets) || mentionsTarget(relation.target, targets))
    .slice(0, relationBudget);
  const selectedAspects = requiredAspects.filter((aspect) => selectedCandidates.some((candidate) => candidate.aspects.includes(aspect)) || (aspect === "relations" && relations.length > 0) || (aspect === "document_structure" && engine.selected.length > 0));
  return {
    evidence,
    authorizedFacts,
    relations,
    selectedAspects,
    metrics: {
      answerSpecFactsBeforePrune: candidates.length,
      answerSpecFactsAfterPrune: authorizedFacts.length,
      relationsBeforePrune: relationsBefore.length,
      relationsAfterPrune: relations.length,
      selectedAspects,
    },
  };
}

function previousOperation(act: ConversationActResult, sourceText: string): PreviousResponseOperation | undefined {
  const type = act.primaryAct === "TRANSLATE_PREVIOUS" ? "TRANSLATE"
    : act.primaryAct === "SHORTEN_PREVIOUS" ? "SHORTEN"
      : act.primaryAct === "EXPAND_PREVIOUS" ? "EXPAND"
        : act.primaryAct === "REWRITE_PREVIOUS" ? "REWRITE"
          : act.primaryAct === "CORRECT_REFERENCE" ? "CORRECT_REFERENCE"
            : null;
  return type ? { type, sourceText, ...(type === "TRANSLATE" ? { targetLanguage: act.language } : {}) } : undefined;
}

const emptyPruningMetrics = { answerSpecFactsBeforePrune: 0, answerSpecFactsAfterPrune: 0, relationsBeforePrune: 0, relationsAfterPrune: 0, selectedAspects: [] as string[] };

export function buildAnswerSpec(input: {
  requestId: string;
  act: ConversationActResult;
  engine: ContextEngineResult | null;
  state: GemitaVConversationState;
  previousSpec?: AnswerSpec | null;
}): AnswerSpec {
  const previousAssistant = input.state.lastAssistantMessage ?? "";
  if (!input.engine && input.previousSpec) {
    const operation = previousOperation(input.act, previousAssistant);
    return {
      ...input.previousSpec,
      requestId: input.requestId,
      conversationAct: input.act.primaryAct,
      language: input.act.language === "und" ? input.previousSpec.language : input.act.language,
      depth: input.act.primaryAct === "EXPAND_PREVIOUS" ? "detailed" : input.previousSpec.depth,
      previousResponseOperation: operation,
      style: { ...input.previousSpec.style, concise: input.act.primaryAct === "SHORTEN_PREVIOUS" },
    };
  }

  if (!input.engine) {
    const operation = previousOperation(input.act, previousAssistant);
    const evidence: EvidenceRef[] = previousAssistant ? [{ id: "ev-previous-response", sourceId: "conversation", text: previousAssistant, kind: "previous_response" }] : [];
    const authorizedFacts: AuthorizedFact[] = previousAssistant ? [{ id: "fact-previous-response", semanticType: "previous_response", text: previousAssistant, entityIds: input.state.activeEntities, evidenceIds: ["ev-previous-response"], confidence: 1 }] : [];
    return {
      requestId: input.requestId,
      scope: "CONVERSATION",
      conversationAct: input.act.primaryAct,
      intents: [],
      language: input.act.language,
      depth: input.act.primaryAct === "EXPAND_PREVIOUS" ? "detailed" : input.act.primaryAct === "CHAT" && !input.act.reasons.includes("social_small_talk") ? "normal" : "brief",
      format: "prose",
      targets: input.state.activeEntities,
      requiredAspects: [],
      evidenceStatus: operation && !previousAssistant ? "INSUFFICIENT" : "SUPPORTED",
      evidence,
      authorizedFacts,
      relations: [],
      temporalFacts: [],
      metadataFacts: [],
      unsupportedAspects: [],
      knownUnknowns: operation && !previousAssistant ? ["No hay una respuesta anterior disponible."] : [],
      conflicts: [],
      ...(operation ? { previousResponseOperation: operation } : {}),
      style: { concise: input.act.primaryAct === "SHORTEN_PREVIOUS", natural: true, useHeadings: false, useList: false },
      personality: GEMITAV_DEFAULT_PERSONALITY,
      sourceIds: evidence.map((ref) => ref.sourceId),
      pruningMetrics: { ...emptyPruningMetrics },
    };
  }

  const engine = input.engine;
  const targets = engine.plan.targets.map((target) => target.canonical);
  const pruned = pruneForAnswer(engine, targets);
  const missingAfterPrune = engine.responsePlan.requiredAspects.filter((aspect) => !pruned.selectedAspects.includes(aspect));
  const evidenceStatus = engine.evidence.status === "CONFLICTING" ? "CONFLICTING"
    : missingAfterPrune.length === engine.responsePlan.requiredAspects.length ? "INSUFFICIENT"
      : missingAfterPrune.length > 0 ? "PARTIAL"
        : engine.evidence.status;
  const unsupportedAspects = [...new Set([...engine.evidence.missingAspects, ...missingAfterPrune])];
  const temporalFacts = engine.responsePlan.requiredAspects.includes("timeline")
    ? pruned.authorizedFacts.filter((fact) => /\b(?:\d{3,4}|antes|despu[eé]s|durante|naci[oó]|muri[oó])\b/iu.test(fact.text)).map((fact, index) => ({ id: `time-${index + 1}`, text: fact.text, values: fact.text.match(/\b\d{3,4}\b/gu) ?? [], evidenceIds: fact.evidenceIds }))
    : [];
  const metadataFacts = engine.scope.scope === "APP" || engine.responsePlan.requiredAspects.includes("document_structure") ? engine.selected.flatMap((item) => [
    { key: "name", value: item.structure.name },
    { key: "type", value: item.structure.type },
    { key: "blocks", value: item.structure.blockCount },
    { key: "images", value: item.structure.images.length },
    { key: "tables", value: item.structure.tables.length },
  ].map((fact, index) => ({ id: `meta-${item.structure.id}-${index}`, ...fact, sourceId: item.structure.id }))) : [];
  return {
    requestId: input.requestId,
    scope: engine.scope.scope,
    conversationAct: input.act.primaryAct,
    intents: [...engine.intents.intents],
    language: input.act.language,
    depth: engine.responsePlan.depth,
    format: engine.responsePlan.format,
    targets,
    requiredAspects: [...engine.responsePlan.requiredAspects],
    evidenceStatus,
    evidence: pruned.evidence,
    authorizedFacts: pruned.authorizedFacts,
    relations: pruned.relations,
    temporalFacts,
    metadataFacts,
    unsupportedAspects,
    knownUnknowns: unsupportedAspects.map((aspect) => `HIS no especifica: ${aspect}.`),
    conflicts: [...engine.evidence.conflictingClaims],
    style: { concise: engine.responsePlan.depth === "brief", natural: true, useHeadings: engine.responsePlan.format === "structured", useList: ["comparison", "timeline"].includes(engine.responsePlan.format) },
    personality: GEMITAV_DEFAULT_PERSONALITY,
    sourceIds: [...new Set(pruned.evidence.map((ref) => ref.sourceId))],
    pruningMetrics: pruned.metrics,
  };
}
