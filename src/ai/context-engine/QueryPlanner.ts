import type { IntentResolution, QueryPlan, ResolvedEntity, ScopeResolution } from "./types";
import { normalize, unique } from "./utils";

export function buildQueryPlan(query: string, scope: ScopeResolution, entities: readonly ResolvedEntity[], intent: IntentResolution): QueryPlan {
  const text = normalize(query);
  const aspects: string[] = [];
  const add = (pattern: RegExp, aspect: string) => { if (pattern.test(text)) aspects.push(aspect); };
  add(/\b(que es|quien es|definicion)\b/u, "definition");
  add(/\b(origen|nacio|surgio|formo)\b/u, "origin");
  add(/\b(como funciona|funcionamiento)\b/u, "functioning");
  add(/\b(componentes|partes|compone)\b/u, "components");
  add(/\b(relacion|relaciona|calls?|conecta)\b/u, "relations");
  add(/\b(historia|papel|importancia)\b/u, "role");
  add(/\b(cuando|fecha|timeline|cronologia|antes|despues)\b/u, "timeline");
  add(/\b(por que|causa)\b/u, "cause");
  add(/\b(color|colores)\b/u, "exact_color");
  add(/\b(tipo de nodo|estructura|secciones|imagenes|tablas|bloques)\b/u, "document_structure");
  if (intent.intents.includes("COMPARE")) aspects.push("comparison");
  const exhaustive = /\b(al completo|todo|toda|everything|exhaustiv)\b/u.test(text) || intent.intents.includes("FULL_NODE");
  if (exhaustive && intent.intents.includes("GENERAL_EXPLANATION")) aspects.push("definition", "origin", "functioning", "components", "relations", "role");
  if (aspects.length === 0) aspects.push(intent.intents.includes("SUMMARY") ? "overview" : "answer");
  const detailed = exhaustive || aspects.length >= 3 || intent.intents.includes("SUMMARY");
  return { targets: [...entities], aspects: unique(aspects), scope: scope.scope, desiredDepth: exhaustive ? "exhaustive" : detailed ? "detailed" : "normal", intents: intent.intents };
}
