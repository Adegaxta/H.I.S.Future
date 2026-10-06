import type { LexicalQueryAnalysis } from "../../lexicon";
import type { IntentResolution, QueryIntent } from "./types";
import { normalize, unique } from "./utils";

export function resolveIntents(query: string, lexical: LexicalQueryAnalysis): IntentResolution {
  const text = normalize(query);
  const intents: QueryIntent[] = [];
  const reasons: string[] = [];
  const add = (intent: QueryIntent, reason: string) => { intents.push(intent); reasons.push(reason); };
  if (lexical.intentHints.includes("summary") || /\b(resume|resumen|resumeme|summarize|summary|overview)\b/u.test(text)) add("SUMMARY", "summary_signal");
  if (/\b(todo|toda|completo|completa|entero|entera|everything|full node)\b/u.test(text) && /\b(nodo|node|informacion)\b/u.test(text)) add("FULL_NODE", "whole_document_signal");
  if (/\b(compara|comparar|comparacion|compare|diferencias?)\b/u.test(text)) add("COMPARE", "comparison_signal");
  if (/\b(relacion|relaciones|relaciona|calls?|conecta|vinculo)\b/u.test(text)) add("RELATIONS", "relation_signal");
  if (/\b(tipo de nodo|estructura|secciones|imagenes|tablas|bloques|metadata)\b/u.test(text)) add("STRUCTURE", "structure_signal");
  if (/\b(cronologia|linea temporal|timeline|antes|despues)\b/u.test(text)) add("TIMELINE", "temporal_signal");
  if (/\b(por que|causa|origino|provoco)\b/u.test(text)) add("CAUSE", "causal_signal");
  if (/\b(que es|quien es|define|definicion|what is|who is)\b/u.test(text)) add("DEFINITION", "definition_signal");
  if (/\b(eso|esto|ese|esa|ahi)\b/u.test(text) || [
    /^(?:y |pero )?que paso despues$/u,
    /^(?:y |pero )?que ocurrio despues$/u,
    /^(?:y |pero )?cuando murio$/u,
    /^(?:y |pero )?por que$/u,
    /^(?:y )?antes$/u,
    /^(?:y )?despues$/u,
  ].some((pattern) => pattern.test(text))) add("FOLLOW_UP", "dependent_language");
  if (/\b(explica|explicame|hablame|cuentame|explain|tell me)\b/u.test(text)) add("GENERAL_EXPLANATION", "explanation_signal");
  if (intents.length === 0) add("FACT", "default_factual");
  return { intents: unique(intents), reasons };
}
