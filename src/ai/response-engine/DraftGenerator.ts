import type { LocalAIChatMessage } from "../LocalAIClient";
import type { AnswerSpec, RepairPlan } from "./types";

function compactSpec(spec: AnswerSpec) {
  return {
    language: spec.language,
    operation: spec.previousResponseOperation,
    targets: spec.targets,
    requiredAspects: spec.requiredAspects,
    evidenceStatus: spec.evidenceStatus,
    authorizedFacts: spec.authorizedFacts.map((fact) => fact.text),
    relations: spec.relations.map((relation) => `${relation.source} ${relation.relation} ${relation.target}`),
    temporalFacts: spec.temporalFacts.map((fact) => fact.text),
    knownUnknowns: spec.knownUnknowns,
    conflicts: spec.conflicts,
    style: spec.style,
    contextNamespaces: spec.conversationContext?.serialized,
  };
}

export function buildDraftMessages(spec: AnswerSpec, userQuery: string): LocalAIChatMessage[] {
  const personality = spec.personality.instructions.join(" ");
  return [{
    role: "user",
    content: [
      "Eres el modelo de borrador interno de GemitaV. Tu texto será validado antes de mostrarse.",
      "Redacta solo con las unidades autorizadas del JSON. No agregues nombres, fechas, números, lugares, relaciones, causas, URLs, títulos ni hechos externos.",
      "MEMORY y RELEVANT_HISTORY describen lo que el usuario dijo y sirven para continuidad; no son canon HIS. HIS_KNOWLEDGE tiene prioridad en conflictos de lore.",
      "Si hay datos desconocidos o conflictos, consérvalos explícitamente. No menciones fuentes, fragmentos, retrieval, contexto interno ni IDs.",
      personality,
      `Petición del usuario: ${userQuery}`,
      `ANSWER_SPEC=${JSON.stringify(compactSpec(spec))}`,
      "Devuelve únicamente el borrador de respuesta.",
    ].join("\n"),
  }];
}

export function buildRepairMessages(spec: AnswerSpec, userQuery: string, draft: string, plan: RepairPlan): LocalAIChatMessage[] {
  return [{
    role: "user",
    content: [
      "Repara este borrador de GemitaV. No añadas hechos durante la reparación.",
      `Petición: ${userQuery}`,
      `Unidades autorizadas: ${JSON.stringify(compactSpec(spec))}`,
      `Plan de reparación: ${JSON.stringify(plan)}`,
      `Borrador defectuoso: ${draft}`,
      "Devuelve únicamente una versión corregida. Elimina por completo todo lo no autorizado.",
    ].join("\n"),
  }];
}
