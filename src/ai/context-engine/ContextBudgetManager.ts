import type { ContextBudget, SelectedContext } from "./types";

export const CONTEXT_BUDGETS = {
  totalChars: 15_000,
  instructionsChars: 2_200,
  conversationChars: 1_600,
  contentChars: 9_200,
  metadataChars: 1_200,
  responseReserveChars: 5_000,
} as const;

export function applyContextBudget(selected: readonly SelectedContext[], conversationChars: number): { selected: SelectedContext[]; budget: ContextBudget } {
  let remaining = CONTEXT_BUDGETS.contentChars;
  const bounded: SelectedContext[] = [];
  for (const item of selected) {
    if (item.contentMode === "none") { bounded.push(item); continue; }
    if (remaining <= 0) continue;
    const content = item.content.length <= remaining ? item.content : `${item.content.slice(0, Math.max(0, remaining - 1))}…`;
    bounded.push({ ...item, content });
    remaining -= content.length;
  }
  const contentChars = bounded.reduce((total, item) => total + item.content.length, 0);
  const metadataChars = Math.min(CONTEXT_BUDGETS.metadataChars, bounded.length * 220);
  const usedConversation = Math.min(CONTEXT_BUDGETS.conversationChars, conversationChars);
  const totalChars = Math.min(CONTEXT_BUDGETS.totalChars, CONTEXT_BUDGETS.instructionsChars + usedConversation + contentChars + metadataChars);
  return { selected: bounded, budget: { totalChars, instructionsChars: CONTEXT_BUDGETS.instructionsChars, conversationChars: usedConversation, contentChars, metadataChars, responseReserveChars: CONTEXT_BUDGETS.responseReserveChars, estimatedInputTokens: Math.ceil(totalChars / 4) } };
}
