import { hisLexicon, normalizeLexicalText } from "../../lexicon";
import { analyzeGeneralSemantics } from "../conversation/GeneralSemanticAnalyzer";
import { resolveGeneralReferences } from "../conversation/ReferenceResolver";
import { emptyPersistedConversationState } from "../conversation/ConversationState";
import type { SemanticFrame } from "../conversation/types";
import type { DiscourseRole, GrammarSignals, IntentScore, LanguageUnderstandingInput, LanguageUnderstandingResult, MorphologyFeature, PragmaticIntent, ResolvedReference, ResolvedSubject } from "./types";

const nowMs = () => typeof performance !== "undefined" ? performance.now() : Date.now();
const COMMUNICATION = new Set(["contar", "decir", "comentar", "explicar", "compartir", "narrar"]);

function morphology(text: string): MorphologyFeature[] {
  const lexical = hisLexicon.analyzeQuery(text);
  return lexical.tokens.map((token) => {
    const raw = token.normalized;
    const entry = token.match.entry;
    const lemma = entry?.canonical ?? inferLemma(raw);
    const clitics: string[] = [];
    if (/(?:me|te|se|lo|la|le|nos|os|los|las|les)$/u.test(raw) && raw.length > 4) clitics.push(raw.match(/(?:me|te|se|lo|la|le|nos|os|los|las|les)$/u)?.[0] ?? "");
    const feature: MorphologyFeature = { surface: token.original, lemma, pos: entry?.partOfSpeech ? [entry.partOfSpeech] : inferPos(raw), clitics, features: [...(entry?.morphology ?? [])], provenance: entry?.source ? [entry.source] : [{ provider: "rule", rule: "spanish-conversational-morphology-v1" }], confidence: entry ? 0.96 : 0.72 };
    if (/^(?:yo|me|mi|mis)$/u.test(raw)) Object.assign(feature, { pos: ["pronoun"], person: 1, number: "singular" });
    if (/^(?:tu|te|ti)$/u.test(raw)) Object.assign(feature, { pos: ["pronoun"], person: 2, number: "singular" });
    if (/^(?:ellos|ellas|nosotros|nosotras)$/u.test(raw)) feature.number = "plural";
    if (/^(?:voy|tengo|quiero|creo|pienso|prefiero|digo|cuento)$/u.test(raw)) Object.assign(feature, { person: 1, number: "singular", tense: "present", mood: "indicative" });
    if (/(?:ar|er|ir)(?:me|te|se|lo|la|le|nos|os|los|las|les)?$/u.test(raw)) feature.mood = "infinitive";
    if (/(?:ando|iendo)(?:me|te|se)?$/u.test(raw)) feature.mood = "gerund";
    if (/(?:ado|ido)$/u.test(raw)) feature.mood = "participle";
    return feature;
  });
}

function inferLemma(word: string): string {
  const cliticless = word.replace(/(me|te|se|lo|la|le|nos|os|los|las|les)$/u, "");
  const irregular: Record<string, string> = { voy: "ir", fui: "ir", tengo: "tener", tuve: "tener", quiero: "querer", creo: "creer", prefiero: "preferir", dijo: "decir", dije: "decir", vi: "ver", hice: "hacer" };
  return irregular[word] ?? cliticless;
}

function inferPos(word: string): string[] {
  if (/^(?:yo|tu|el|ella|ellos|ellas|me|te|se|nos|esto|eso|aquello)$/u.test(word)) return ["pronoun"];
  if (/^(?:mi|mis|tu|tus|su|sus|este|esta|ese|esa)$/u.test(word)) return ["determiner"];
  if (/^(?:no|nunca|jamas)$/u.test(word)) return ["adverb"];
  if (/(?:ar|er|ir|ando|iendo|ado|ido)$/u.test(word)) return ["verb"];
  return [];
}

function grammar(text: string, features: MorphologyFeature[]): GrammarSignals {
  const n = normalizeLexicalText(text);
  const lemmas = features.map((item) => item.lemma);
  const obligation = /\b(?:tengo que|debo|hay que|necesito)\b/u.test(n);
  const desire = /\b(?:quiero|deseo|me gustaria)\b/u.test(n);
  const belief = /\b(?:creo|pienso|supongo|quizas|tal vez)\b/u.test(n);
  const possibility = /\b(?:puede|podria|posiblemente)\b/u.test(n);
  const nearFuture = /\b(?:voy|vamos|va|van) a\s+\w+/u.test(n);
  const communicationIntention = nearFuture && lemmas.some((lemma) => COMMUNICATION.has(lemma));
  const modality: GrammarSignals["modality"] = obligation ? "obligation" : belief ? "belief" : desire ? "desire" : possibility ? "possibility" : nearFuture ? "intention" : /\b(?:seguro|sin duda)\b/u.test(n) ? "certainty" : "neutral";
  const signals = [obligation && "obligation", desire && "desire", belief && "belief", possibility && "possibility", nearFuture && "near_future", communicationIntention && "communication_intention"].filter(Boolean) as string[];
  return {
    explicitSubject: /\byo\b/u.test(n) ? "USER" : /\btu\b/u.test(n) ? "ASSISTANT" : null,
    implicitSubject: features.some((item) => item.person === 1 && (item.tense || item.pos.includes("verb"))) ? "USER" : null,
    mainVerb: features.find((item) => item.pos.includes("verb") || item.mood)?.lemma ?? null,
    auxiliaries: features.filter((item) => ["ir", "tener", "haber", "deber", "poder"].includes(item.lemma)).map((item) => item.lemma),
    negated: /\b(?:no|nunca|jamas)\b/u.test(n), interrogative: /\?/u.test(text) || /^(?:que|quien|como|cuando|donde|por que|cual)\b/u.test(n),
    imperative: /^(?:dime|haz|explica|cuenta|traduce|reescribe|resume|acorta|amplia)\b/u.test(n), conditional: /\bsi\b.+\b(?:entonces|si|voy|va|sera|seria|haria|hago)\b/u.test(n),
    causal: /\b(?:porque|debido a|por eso|asi que)\b/u.test(n), contrast: /\b(?:pero|aunque|sin embargo|en cambio)\b/u.test(n), coordination: /\b(?:y|o|ni)\b/u.test(n),
    temporal: /\b(?:ayer|hoy|manana|antes|despues|luego|semana|martes|lunes|miercoles|jueves|viernes|sabado|domingo)\b/u.test(n), modality, communicationIntention, signals,
  };
}

function scoreIntents(text: string, grammarSignals: GrammarSignals, frame: SemanticFrame): IntentScore[] {
  const n = normalizeLexicalText(text); const scores = new Map<PragmaticIntent, { score: number; signals: string[] }>();
  const add = (intent: PragmaticIntent, score: number, signal: string) => { const old = scores.get(intent); scores.set(intent, { score: Math.min(1, Math.max(score, old?.score ?? 0) + (old ? 0.04 : 0)), signals: [...(old?.signals ?? []), signal] }); };
  if (/^(?:hola+|holi+|buenas|hey)\b/u.test(n)) add("GREETING", 0.96, "greeting_form");
  if (/\b(?:te voy a contar|voy a contarte|quiero contarte|te cuento|mi dia)\b/u.test(n) || grammarSignals.communicationIntention) add("SHARE_EXPERIENCE", 0.99, "communication_intention");
  if (grammarSignals.modality === "obligation" || frame.tasks.length) add("TASK_DECLARATION", 0.91, "obligation_or_task_frame");
  if (grammarSignals.interrogative) add("QUESTION", 0.82, "interrogative_structure");
  if (grammarSignals.interrogative && /\b(?:que|quien|como|cuando|donde|por que|cual)\b/u.test(n)) add("KNOWLEDGE_REQUEST", 0.68, "wh_structure");
  if (grammarSignals.imperative && !/^(?:cuenta|cuentame)\b/u.test(n)) add("ACTION_REQUEST", 0.79, "imperative");
  if (frame.mentions.some((m) => m.semanticType === "PREFERENCE")) add("PREFERENCE", 0.97, "preference_frame");
  if (frame.modality === "correction") add("CORRECTION", 0.99, "correction_marker");
  if (/\b(?:reescribe|dilo de otra forma)\b/u.test(n)) add("REWRITE", 0.97, "rewrite_instruction");
  if (/\b(?:traduce|en ingles|en espanol)\b/u.test(n)) add("TRANSLATE", 0.95, "translation_instruction");
  if (/\b(?:mas corto|acorta|resume)\b/u.test(n)) add("SHORTEN", 0.93, "shorten_instruction");
  if (/\b(?:amplia|profundiza|mas detalle)\b/u.test(n)) add("EXPAND", 0.93, "expand_instruction");
  if (!scores.size || scores.has("GREETING")) add("SMALL_TALK", scores.has("GREETING") ? 0.78 : 0.55, "social_or_open_default");
  if (scores.has("SHARE_EXPERIENCE")) { scores.set("TASK_DECLARATION", { score: Math.min(scores.get("TASK_DECLARATION")?.score ?? 0, 0.11), signals: ["communication_intention_suppresses_task"] }); scores.set("KNOWLEDGE_REQUEST", { score: Math.min(scores.get("KNOWLEDGE_REQUEST")?.score ?? 0, 0.07), signals: ["disclosure_not_knowledge"] }); }
  return [...scores].map(([intent, value]) => ({ intent, score: value.score, supportingSignals: value.signals })).sort((a, b) => b.score - a.score);
}

function discourse(text: string, intents: IntentScore[], recent: readonly { role: string; content: string }[]): DiscourseRole {
  const n = normalizeLexicalText(text); const top = intents[0]?.intent;
  if (top === "GREETING" && recent.length === 0) return "OPENING";
  if (top === "CORRECTION") return "CORRECTION";
  if (top === "SHARE_EXPERIENCE") return "TOPIC_INTRODUCTION";
  if (/^(?:primero|despues|luego|entonces)\b/u.test(n)) return "NARRATIVE_CONTINUATION";
  if (/\b(?:pero|sin embargo|en cambio)\b/u.test(n)) return "CONTRAST";
  if (top === "QUESTION" || top === "KNOWLEDGE_REQUEST") return recent.length ? "QUESTION_ON_TOPIC" : "TOPIC_INTRODUCTION";
  return recent.length ? "ELABORATION" : "TOPIC_INTRODUCTION";
}

function resolveSubject(frame: SemanticFrame, grammarSignals: GrammarSignals, state: ReturnType<typeof emptyPersistedConversationState>): ResolvedSubject {
  const candidates: ResolvedSubject["candidates"] = [];
  if (grammarSignals.explicitSubject) candidates.push({ subject: grammarSignals.explicitSubject, confidence: 0.99, reason: "explicit_pronoun" });
  else if (grammarSignals.implicitSubject) candidates.push({ subject: grammarSignals.implicitSubject, confidence: 0.9, reason: "verb_person" });
  for (const person of frame.people) candidates.push({ subject: person, confidence: 0.72, reason: "explicit_person_mention" });
  if (!candidates.length && frame.references.length && state.activePeople[0]) candidates.push({ subject: state.activePeople[0], confidence: 0.76, reason: "recent_person_antecedent" });
  if (!candidates.length && state.activeSubjects[0]) candidates.push({ subject: state.activeSubjects[0], confidence: 0.55, reason: "conversation_state" });
  return { candidates, selected: candidates[0]?.subject ?? null };
}

export class LanguageUnderstandingPipeline {
  private cache = new Map<string, LanguageUnderstandingResult>();
  analyze(input: LanguageUnderstandingInput): LanguageUnderstandingResult {
    const key = `${input.conversationId}:${input.messageId}:${normalizeLexicalText(input.text)}`; const cached = this.cache.get(key); if (cached) return { ...cached, cacheHit: true };
    const timings: Record<string, number> = {}; let started = nowMs();
    const normalized = normalizeLexicalText(input.text); timings.normalizeMs = nowMs() - started;
    started = nowMs(); const lexical = hisLexicon.analyzeQuery(input.text); timings.lexicalMs = nowMs() - started;
    started = nowMs(); const morphologyResult = morphology(input.text); timings.morphologyMs = nowMs() - started;
    started = nowMs(); const grammarResult = grammar(input.text, morphologyResult); timings.grammarMs = nowMs() - started;
    started = nowMs(); const frame = analyzeGeneralSemantics({ conversationId: input.conversationId, messageId: input.messageId, text: input.text, role: input.role, now: input.now });
    // Communication futures are intentions, never tasks by themselves.
    if (grammarResult.communicationIntention) { frame.mentions = frame.mentions.filter((m) => m.semanticType !== "TASK"); frame.tasks = []; }
    timings.semanticFrameMs = nowMs() - started;
    started = nowMs(); const intents = scoreIntents(input.text, grammarResult, frame); timings.intentMs = nowMs() - started;
    started = nowMs(); const discourseResult = discourse(input.text, intents, input.recentMessages ?? []); timings.discourseMs = nowMs() - started;
    frame.communicativeAct = intents[0]?.intent;
    frame.discourseRole = discourseResult;
    frame.addressee = grammarResult.communicationIntention ? "ASSISTANT" : undefined;
    frame.predicate = grammarResult.mainVerb ?? undefined;
    frame.events = frame.mentions.filter((m) => m.semanticType === "EVENT").map((m) => m.surfaceText);
    frame.preferences = frame.mentions.filter((m) => m.semanticType === "PREFERENCE").map((m) => m.object ?? m.surfaceText);
    frame.decisions = frame.mentions.filter((m) => m.semanticType === "DECISION").map((m) => m.object ?? m.surfaceText);
    frame.temporalReferences = frame.mentions.flatMap((m) => m.temporalReference ? [m.temporalReference] : []);
    frame.polarity = grammarResult.negated ? "negative" : "positive";
    frame.certainty = grammarResult.modality === "belief" ? 0.55 : grammarResult.modality === "possibility" ? 0.45 : 0.88;
    frame.knowledgeRequest = (intents.find((i) => i.intent === "KNOWLEDGE_REQUEST")?.score ?? 0) >= 0.7;
    frame.actionRequest = (intents.find((i) => i.intent === "ACTION_REQUEST")?.score ?? 0) >= 0.7;
    frame.socialIntent = ["GREETING", "SMALL_TALK", "SHARE_EXPERIENCE"].includes(intents[0]?.intent ?? "");
    const state = input.state ?? emptyPersistedConversationState(input.conversationId);
    started = nowMs(); const subjectResult = resolveSubject(frame, grammarResult, state); timings.subjectMs = nowMs() - started;
    started = nowMs(); const legacyReferences = resolveGeneralReferences({ text: input.text, frame, state, recentMessages: input.recentMessages ?? [] });
    const references: ResolvedReference[] = frame.mentions.filter((m) => m.semanticType === "REFERENCE" || m.semanticType === "CORRECTION").map((m) => ({ surface: m.surfaceText, target: legacyReferences.resolvedSubjects[0] ?? null, confidence: legacyReferences.confidence, reason: legacyReferences.reasons[0] ?? "unresolved", sourceMessageIds: legacyReferences.referencedMessageIds })); timings.referenceMs = nowMs() - started;
    const temporal = frame.mentions.flatMap((m) => m.temporalReference ? [m.temporalReference] : []); timings.temporalMs = 0;
    const confidence = Math.min(0.99, (0.92 + (intents[0]?.score ?? 0.5) + (subjectResult.selected ? 0.85 : 0.65)) / 3);
    frame.confidence = confidence;
    frame.provenance = ["his://language-understanding/v1", ...frame.mentions.map((m) => `mention://${m.id}`)];
    const result: LanguageUnderstandingResult = { version: 1, normalizedText: { value: normalized, confidence: 1, reasons: ["unicode_and_accent_normalization"], provenance: ["his://lexicon/normalizer"] }, lexical: { value: lexical, confidence: lexical.tokens.some((t) => t.match.entry) ? 0.95 : 0.72, reasons: ["lexicon_v1"], provenance: lexical.tokens.flatMap((t) => t.match.source ? [`lexicon://${t.match.source.provider}/${t.match.source.recordId ?? t.canonical}`] : []) }, morphology: { value: morphologyResult, confidence: morphologyResult.length ? Math.min(...morphologyResult.map((m) => m.confidence)) : 0, reasons: ["lexicon_features", "spanish_conversational_rules"], provenance: ["his://language-understanding/morphology-v1"] }, grammar: { value: grammarResult, confidence: grammarResult.signals.length ? 0.9 : 0.72, reasons: grammarResult.signals, provenance: ["his://language-understanding/grammar-v1"] }, semanticFrame: { value: frame, confidence, reasons: ["lexical_morphology_grammar_merge"], provenance: frame.mentions.map((m) => `mention://${m.id}`) }, intents: { value: intents, confidence: intents[0]?.score ?? 0.5, reasons: intents[0]?.supportingSignals ?? [], provenance: ["his://language-understanding/intent-scorer-v1"] }, discourse: { value: discourseResult, confidence: discourseResult === "ELABORATION" ? 0.7 : 0.9, reasons: ["intent_and_recent_turns"], provenance: ["his://language-understanding/discourse-v1"] }, subject: { value: subjectResult, confidence: subjectResult.candidates[0]?.confidence ?? 0.4, reasons: subjectResult.candidates.map((c) => c.reason), provenance: ["his://language-understanding/subject-v1"] }, references: { value: references, confidence: references.length ? legacyReferences.confidence : 1, reasons: legacyReferences.reasons, provenance: legacyReferences.referencedMessageIds.map((id) => `message://${id}`) }, temporal: { value: temporal, confidence: temporal.length ? Math.min(...temporal.map((t) => t.resolution === "ambiguous" ? 0.45 : 0.96)) : 1, reasons: temporal.map((t) => t.resolution), provenance: temporal.map((t) => `time://${t.anchorDate}`) }, timings, confidence, cacheHit: false };
    this.cache.set(key, result); if (this.cache.size > 5000) this.cache.delete(this.cache.keys().next().value!); return result;
  }
  invalidateConversation(conversationId: string): void { for (const key of this.cache.keys()) if (key.startsWith(`${conversationId}:`)) this.cache.delete(key); }
}

export const languageUnderstandingPipeline = new LanguageUnderstandingPipeline();
