import type { AIConcept } from "./types";

const CONCEPTS: readonly AIConcept[] = [
  {
    id: "his-gemita",
    name: "Gemita",
    aliases: [],
    type: "alias",
    definition: "Gemita es el apodo del asistente local de H.I.S.",
    attributes: [
      { label: "Se refiere a", value: "asistente local de H.I.S." },
      { label: "Modelo base", value: "Gemma 3 1B" },
      { label: "Ejecución", value: "local" },
    ],
  },
];

export function listAIConcepts(): readonly AIConcept[] {
  return CONCEPTS;
}
