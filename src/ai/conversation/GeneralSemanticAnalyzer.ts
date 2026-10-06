import { normalizeLexicalText } from "../../lexicon";
import type { SemanticFrame, SemanticMention, SemanticSubject, SemanticType, TemporalReference } from "./types";

const REFERENCE_PATTERN = /\b(eso|esto|ese|esa|el|ella|ellos|ellas|ahi|entonces|lo anterior|lo segundo|esa persona|ese proyecto|lo que dijiste)\b/giu;
const TEMPORAL_PATTERN = /\b(anteayer|ayer|hoy|mañana|manana|el (?:lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo)|hace (?:un|dos|tres|\d+) días|la semana pasada|antes|después|despues|luego)\b/giu;
const PLACE_PATTERN = /\b(?:en|a|desde)\s+(?:el|la|los|las)?\s*([\p{L}][\p{L}-]*(?:\s+[\p{L}][\p{L}-]*){0,2})/giu;
const NAME_PATTERN = /\b[\p{Lu}ÁÉÍÓÚÑ][\p{L}ÁÉÍÓÚÑáéíóúñ-]{2,}\b/gu;
const STOP_NAMES = new Set(["Gemita", "GemitaV", "HIS", "Hoy", "Ayer", "Mañana", "Martes", "Lunes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]);

function isoDateAtLocalMidnight(date: Date): string {
  return `${date.getFullYear().toString().padStart(4, "0")}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
}

function resolveTemporal(surfaceText: string, anchor: Date): TemporalReference {
  const normalized = normalizeLexicalText(surfaceText);
  const resolved = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  let exact = true;
  if (normalized === "ayer") resolved.setDate(resolved.getDate() - 1);
  else if (normalized === "anteayer") resolved.setDate(resolved.getDate() - 2);
  else if (normalized === "hoy") { /* anchor day */ }
  else if (normalized === "manana") resolved.setDate(resolved.getDate() + 1);
  else if (normalized === "la semana pasada") resolved.setDate(resolved.getDate() - 7);
  else {
    const days = normalized.match(/^hace (un|dos|tres|\d+) dias$/u);
    const count = days ? ({ un: 1, dos: 2, tres: 3 }[days[1]] ?? Number(days[1])) : null;
    if (count !== null && Number.isFinite(count)) resolved.setDate(resolved.getDate() - count);
    else {
      const weekday = normalized.match(/^el (lunes|martes|miercoles|jueves|viernes|sabado|domingo)$/u)?.[1];
      if (weekday) {
        const target = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"].indexOf(weekday);
        let delta = (target - resolved.getDay() + 7) % 7;
        if (delta === 0) exact = false;
        else resolved.setDate(resolved.getDate() + delta);
      } else exact = false;
    }
  }
  return { surfaceText, resolvedValue: exact ? isoDateAtLocalMidnight(resolved) : null, resolution: exact ? "relative" : "ambiguous", anchorDate: anchor.toISOString() };
}

function mention(input: Omit<SemanticMention, "id" | "conversationId" | "messageId">, conversationId: string, messageId: string, index: number): SemanticMention {
  return { id: `${messageId}:mention:${index}`, conversationId, messageId, ...input };
}

function sentenceSubject(text: string): SemanticSubject {
  const normalized = normalizeLexicalText(text);
  if (/\b(?:yo|me|mi|mis|conmigo)\b/u.test(normalized)) return "USER";
  if (/\b(?:tu|te|ti|gemita|gemitav)\b/u.test(normalized)) return "ASSISTANT";
  return "USER";
}

function modality(text: string): SemanticFrame["modality"] {
  const normalized = normalizeLexicalText(text);
  if (/\b(?:no,? me referia|quise decir|corrijo)\b/u.test(normalized)) return "correction";
  if (/\b(?:creo|pienso|supongo|tal vez|quizas)\b/u.test(normalized)) return "belief";
  if (/\?\s*$/u.test(text.trim())) return "question";
  return "assertion";
}

export function analyzeGeneralSemantics(input: { conversationId: string; messageId: string; text: string; role?: "user" | "assistant"; now?: Date }): SemanticFrame {
  const { conversationId, messageId, text } = input;
  const now = input.now ?? new Date();
  const normalized = normalizeLexicalText(text);
  const frameModality = modality(text);
  const subject = input.role === "assistant" ? "ASSISTANT" : sentenceSubject(text);
  const mentions: SemanticMention[] = [];
  const add = (surfaceText: string, semanticType: SemanticType, confidence: number, extra: Partial<SemanticMention> = {}) => {
    mentions.push(mention({ surfaceText, normalizedValue: normalizeLexicalText(surfaceText), semanticType, confidence, source: "rule", subject, modality: frameModality, ...extra }, conversationId, messageId, mentions.length));
  };

  if (/\b(?:yo|me|mi|mis|conmigo)\b/iu.test(text)) add(text.match(/\b(?:yo|me|mi|mis|conmigo)\b/iu)?.[0] ?? "yo", "SELF", 0.99, { subject: "USER" });
  if (/\b(?:tu|tú|te|ti|gemita|gemitav)\b/iu.test(text)) add(text.match(/\b(?:tu|tú|te|ti|gemita|gemitav)\b/iu)?.[0] ?? "GemitaV", "ASSISTANT", 0.99, { subject: "ASSISTANT" });
  for (const match of text.matchAll(TEMPORAL_PATTERN)) add(match[0], /\b(?:antes|despues|luego|entonces)\b/u.test(normalizeLexicalText(match[0])) ? "TIME" : "DATE", 0.96, { temporalReference: resolveTemporal(match[0], now) });
  for (const match of text.matchAll(REFERENCE_PATTERN)) add(match[0], "REFERENCE", 0.86);

  const people = new Set<string>();
  for (const match of text.matchAll(NAME_PATTERN)) {
    if (STOP_NAMES.has(match[0])) continue;
    people.add(match[0]);
    add(match[0], "PERSON", 0.78, { subject: match[0] });
  }

  const placeMatch = [...text.matchAll(PLACE_PATTERN)].find((match) => /\b(?:trabajo|casa|oficina|escuela|universidad|madrid|lima)\b/iu.test(match[1]));
  if (placeMatch) add(placeMatch[1].trim(), "PLACE", 0.82);

  const preference = normalized.match(/\b(?:prefiero|me gusta|quiero que|de ahora en adelante)\s+(.+)/u);
  if (preference) add(preference[1].replace(/[.!?]+$/u, "").trim(), "PREFERENCE", 0.96, { subject: "USER", relation: "prefers", object: preference[1].trim() });
  const task = normalized.match(/\b(?:tengo que|debo|voy a|termino|terminar|hacer)\s+(.+)/u);
  if (task) add(task[1].replace(/[.!?]+$/u, "").trim(), "TASK", 0.9, { relation: "plans", object: task[1].trim() });
  const decision = normalized.match(/\b(?:decidimos|acordamos|queda decidido)\s+(?:que\s+)?(.+)/u);
  if (decision) add(decision[1].trim(), "DECISION", 0.93, { relation: "decided", object: decision[1].trim() });
  const correction = text.match(/\b(?:no,?\s*)?(?:me refería|me referia|quise decir)\s+a?\s*([^.!?]+)/iu);
  if (correction) add(correction[1].trim(), "CORRECTION", 0.99, { relation: "corrects_reference", object: correction[1].trim(), modality: "correction" });

  const eventSignals = /\b(?:hable|hablé|fui|vi|dijo|respondio|respondió|ocurrio|ocurrió|trabaje|trabajé|reuni|reuní|termine|terminé)\b/u;
  if (eventSignals.test(normalized)) add(text.trim(), "EVENT", 0.84, { relation: normalized.match(eventSignals)?.[0] ?? "event", object: text.trim() });

  const referenceValues = mentions.filter((item) => item.semanticType === "REFERENCE" || item.semanticType === "CORRECTION").map((item) => item.surfaceText);
  return {
    speaker: input.role === "assistant" ? "ASSISTANT" : "USER",
    subject,
    mentions,
    people: [...people],
    places: mentions.filter((item) => item.semanticType === "PLACE").map((item) => item.surfaceText),
    concepts: mentions.filter((item) => item.semanticType === "CONCEPT").map((item) => item.surfaceText),
    tasks: mentions.filter((item) => item.semanticType === "TASK").map((item) => item.surfaceText),
    references: referenceValues,
    modality: frameModality,
  };
}
