import type { LexicalQueryAnalysis } from "../../lexicon";
import type { ResolvedEntity, ScopeResolution } from "./types";
import { normalize } from "./utils";

export function resolveScope(query: string, lexical: LexicalQueryAnalysis, entities: readonly ResolvedEntity[] = []): ScopeResolution {
  const text = normalize(query);
  const reasons: string[] = [];
  const appCue = /\b(tipo de nodo|nodo donde|muestra(?:me)? el nodo|cuantas? imagenes|estructura|secciones|bloques|metadata|editor|aplicacion|app)\b/u.test(text)
    || /\bque dice el nodo\b/u.test(text);
  const explicitLoreCue = /\b(universo|lore|canon|historia de hisfuture|del lore)\b/u.test(text);
  const generalCue = /\b(real|mundo real|concepto real|fuera de his|conocimiento general)\b/u.test(text);
  const loreEntity = [...lexical.entities, ...entities.map((entity) => ({ namespace: entity.namespace }))]
    .some((entity) => entity.namespace === "lore");
  if (appCue) reasons.push("app_intent_language");
  if (explicitLoreCue) reasons.push("explicit_lore_language");
  if (loreEntity) reasons.push("lore_entity");
  if (generalCue) reasons.push("general_knowledge_comparison");
  if ((appCue && explicitLoreCue) || (generalCue && (explicitLoreCue || loreEntity))) {
    return { scope: "MIXED", confidence: 0.96, reasons };
  }
  if (appCue) return { scope: "APP", confidence: 0.95, reasons };
  if (explicitLoreCue || loreEntity || entities.some((entity) => entity.source === "node_name")) {
    return { scope: "LORE", confidence: explicitLoreCue || loreEntity ? 0.94 : 0.82, reasons: reasons.length ? reasons : ["project_entity"] };
  }
  return { scope: "GENERAL", confidence: 0.72, reasons: ["no_his_domain_signal"] };
}
