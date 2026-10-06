import { normalizeLexicalText } from "../../lexicon";
import type { MemoryRecord, RetrievedMemory, SemanticFrame } from "./types";

function terms(value: string): Set<string> {
  return new Set(normalizeLexicalText(value).split(/\s+/u).filter((term) => term.length >= 3));
}

function overlap(left: Set<string>, right: Set<string>): number {
  let count = 0;
  for (const term of left) if (right.has(term)) count += 1;
  return count;
}

export function retrieveMemories(input: { conversationId: string; frame: SemanticFrame; query: string; records: readonly MemoryRecord[]; now?: Date; maxRecords?: number; charBudget?: number }): { selected: RetrievedMemory[]; rejected: RetrievedMemory[]; usedChars: number } {
  const now = input.now ?? new Date();
  const queryTerms = terms(`${input.query} ${input.frame.people.join(" ")} ${input.frame.concepts.join(" ")} ${input.frame.tasks.join(" ")}`);
  const candidates = input.records
    .filter((record) => !record.supersededBy)
    .filter((record) => !record.expiresAt || new Date(record.expiresAt).getTime() > now.getTime())
    .filter((record) => record.scope !== "GLOBAL")
    .filter((record) => record.scope !== "CONVERSATION" || record.sourceConversationId === input.conversationId)
    .map((record): RetrievedMemory => {
      const reasons: string[] = [];
      let score = record.priority / 100 + record.confidence;
      const lexical = overlap(queryTerms, terms(`${record.subject} ${record.predicate ?? ""} ${record.value}`));
      if (lexical) { score += lexical * 1.5; reasons.push("lexical_relevance"); }
      if (input.frame.people.some((person) => normalizeLexicalText(record.value).includes(normalizeLexicalText(person)))) { score += 3; reasons.push("active_person"); }
      if (input.frame.tasks.some((task) => normalizeLexicalText(record.value).includes(normalizeLexicalText(task)))) { score += 2.5; reasons.push("active_task"); }
      if (record.memoryType === "PREFERENCE") { score += 1; reasons.push("preference"); }
      const ageDays = Math.max(0, (now.getTime() - new Date(record.updatedAt).getTime()) / 86_400_000);
      score += Math.max(0, 1 - ageDays / 90);
      return { record, score, reasons: reasons.length ? reasons : ["low_general_relevance"], provenance: `memory://${record.memoryType.toLowerCase()}/${record.id}` };
    })
    .sort((left, right) => right.score - left.score || right.record.updatedAt.localeCompare(left.record.updatedAt));

  const maxRecords = input.maxRecords ?? 6;
  const charBudget = input.charBudget ?? 1_200;
  const selected: RetrievedMemory[] = [];
  const rejected: RetrievedMemory[] = [];
  let usedChars = 0;
  for (const item of candidates) {
    const cost = item.record.value.length + item.record.subject.length + 48;
    if (item.score < 1.4 || selected.length >= maxRecords || usedChars + cost > charBudget) rejected.push(item);
    else { selected.push(item); usedChars += cost; }
  }
  return { selected, rejected, usedChars };
}
