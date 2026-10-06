import type { ActiveConversationContext } from "../conversation";
import type { LanguageUnderstandingResult } from "../language-understanding";
import type { ResponsePlan } from "./ResponsePlan";

export interface CapabilityDescriptor { id: string; intents: string[]; minimumConfidence: number }
export interface CapabilitySelection { capabilityIds: string[]; reasons: string[]; confidence: number }
/** Foundation only: callers must supply an allow-list; V1 activates no tools itself. */
export function selectCapabilities(understanding: LanguageUnderstandingResult, plan: ResponsePlan, _context: ActiveConversationContext, available: readonly CapabilityDescriptor[] = []): CapabilitySelection {
  const intents = new Set(understanding.intents.value.filter((item) => item.score >= 0.7).map((item) => item.intent));
  const selected = available.filter((capability) => capability.minimumConfidence <= understanding.confidence && capability.intents.some((intent) => intents.has(intent as never)));
  return { capabilityIds: selected.map((item) => item.id), reasons: selected.map((item) => `intent_match:${item.id}`), confidence: selected.length ? Math.min(understanding.confidence, plan.confidence) : 1 };
}
