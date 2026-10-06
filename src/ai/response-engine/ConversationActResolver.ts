import { hisLexicon, normalizeLexicalText } from "../../lexicon";
import type { GemitaVConversationState, ConversationAct, ConversationActResult, ResponseLanguage } from "./types";
import type { LanguageUnderstandingResult } from "../language-understanding";

interface ScoredAct { act: ConversationAct; score: number; reason: string }

const exactChat = new Set(["hola", "buenas", "hey", "hi", "hello", "que tal", "que tal estas", "como estas", "como vas"]);
const previousOperationSignals: Array<{ act: ConversationAct; phrases: string[]; reason: string }> = [
  { act: "TRANSLATE_PREVIOUS", phrases: ["en espanol por favor", "traducelo al espanol", "in spanish please", "translate it to english", "en ingles por favor"], reason: "translation_instruction" },
  { act: "SHORTEN_PREVIOUS", phrases: ["hazlo mas corto", "mas corto", "resumelo mas", "shorten it", "make it shorter"], reason: "shortening_instruction" },
  { act: "EXPAND_PREVIOUS", phrases: ["explicalo mas", "amplialo", "profundiza", "dame mas detalle", "expand on that", "explain more"], reason: "expansion_instruction" },
  { act: "REWRITE_PREVIOUS", phrases: ["reescribelo", "redactalo de nuevo", "dilo de otra forma", "rewrite it", "rephrase it"], reason: "rewrite_instruction" },
];

function includesPhrase(text: string, phrases: readonly string[]): boolean {
  return phrases.some((phrase) => text === phrase || text.includes(phrase));
}

function inferRequestedLanguage(text: string, lexicalLanguage: string): ResponseLanguage {
  if (/\b(?:espanol|castellano|spanish)\b/u.test(text)) return "es";
  if (/\b(?:ingles|english)\b/u.test(text)) return "en";
  return lexicalLanguage === "en" ? "en" : lexicalLanguage === "es" ? "es" : "und";
}

export function resolveConversationAct(query: string, state: GemitaVConversationState, understanding?: LanguageUnderstandingResult): ConversationActResult {
  const text = normalizeLexicalText(query);
  const lexical = hisLexicon.analyzeQuery(query);
  const scores: ScoredAct[] = [];
  const hasPreviousAssistant = Boolean(state.lastAssistantMessage);
  const add = (act: ConversationAct, score: number, reason: string) => scores.push({ act, score, reason });

  const pragmatic = understanding?.intents.value[0];
  if (pragmatic && ["GREETING", "SMALL_TALK", "SHARE_EXPERIENCE", "DISCLOSURE", "OPINION", "PREFERENCE", "TASK_DECLARATION", "CLOSURE"].includes(pragmatic.intent)) add("CHAT", pragmatic.score, `pragmatic_${pragmatic.intent.toLowerCase()}`);
  if (pragmatic?.intent === "CORRECTION") add("CORRECT_REFERENCE", pragmatic.score, "pragmatic_correction");
  if (pragmatic?.intent === "FOLLOW_UP" || (pragmatic?.intent === "QUESTION" && /\b(?:te conte|me dijiste|mencione|recien|ayer)\b/u.test(text))) add("FOLLOW_UP", pragmatic.score, "conversational_recall");
  if (pragmatic?.intent === "META") add("META", pragmatic.score, "pragmatic_meta");

  for (const signal of previousOperationSignals) {
    if (includesPhrase(text, signal.phrases)) add(signal.act, hasPreviousAssistant ? 1 : 0.86, hasPreviousAssistant ? signal.reason : `${signal.reason}_without_previous_response`);
  }
  if (/\b(?:yo|a mi)\b/u.test(text) && /\b(?:fuiste tu|eras tu|a ti|tu recibiste)\b/u.test(text)) add("CORRECT_REFERENCE", 1, "speaker_reference_correction");
  if (/^(?:y |pero )?(?:que paso despues|que ocurrio despues|y despues|por que|como ocurrio|antes|despues)$/u.test(text)) add("FOLLOW_UP", 0.98, "dependent_follow_up_language");
  if (/\b(?:que (?:fue lo que )?me dijo|what did .+ tell me|me referia a|recuerdas? (?:lo|que))\b/u.test(text)) add("FOLLOW_UP", 0.995, "personal_conversation_recall");
  if (exactChat.has(text) || (/^(?:hola|buenas|hey)\b/u.test(text) && text.split(/\s+/u).length <= 5)) add("CHAT", 0.98, "social_small_talk");

  const selfReference = /\b(?:gemita|gemitav|tu core|tu version|recibiste|te mejoraron|eres una ia|que puedes hacer)\b/u.test(text);
  const technicalMeta = /\b(?:his core|context engine|arquitectura|version tecnica|modelo local|llama\.cpp)\b/u.test(text);
  if (selfReference) add("META", technicalMeta ? 0.9 : 0.97, technicalMeta ? "technical_system_meta" : "conversational_system_meta");

  const hasKnownEntity = lexical.entities.some((entity) => !entity.ambiguous);
  const factualLanguage = /\b(?:que|quien|cuando|donde|como funciona|informacion|explica|dime|cual|cuanto|historia|relacion|define)\b/u.test(text);
  if (hasKnownEntity || factualLanguage) add("KNOWLEDGE", hasKnownEntity ? 0.92 : 0.72, hasKnownEntity ? "his_entity_detected" : "factual_language");
  if (scores.length === 0) add("CHAT", 0.62, "non_factual_default");

  scores.sort((left, right) => right.score - left.score);
  const primary = scores[0];
  const secondaryActs = [...new Set(scores.slice(1).filter((item) => item.score >= primary.score - 0.12).map((item) => item.act))];
  const previousOperation = ["TRANSLATE_PREVIOUS", "SHORTEN_PREVIOUS", "EXPAND_PREVIOUS", "REWRITE_PREVIOUS", "CORRECT_REFERENCE"].includes(primary.act);
  const personalRecall = scores.some((item) => item.act === primary.act && item.reason === "personal_conversation_recall");
  const languageSaysSocial = pragmatic && ["GREETING", "SMALL_TALK", "SHARE_EXPERIENCE", "DISCLOSURE", "OPINION", "PREFERENCE", "TASK_DECLARATION", "CLOSURE"].includes(pragmatic.intent);
  const knowledgeRequired = !languageSaysSocial && (primary.act === "KNOWLEDGE" || (primary.act === "FOLLOW_UP" && !personalRecall && !/\b(?:te conte|me dijiste|mencione|recien|ayer)\b/u.test(text)) || (primary.act === "META" && technicalMeta));
  const referencesPreviousAssistant = previousOperation || primary.act === "FOLLOW_UP";
  const referencesPreviousUser = primary.act === "CORRECT_REFERENCE" || primary.act === "FOLLOW_UP";
  return {
    primaryAct: primary.act,
    secondaryActs,
    language: inferRequestedLanguage(text, lexical.language),
    referencesPreviousUser,
    referencesPreviousAssistant,
    knowledgeRequired,
    retrievalPolicy: "SKIP",
    confidence: primary.score,
    reasons: [...new Set(scores.filter((item) => item.act === primary.act).map((item) => item.reason))],
  };
}
