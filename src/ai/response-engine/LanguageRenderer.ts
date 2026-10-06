import type { LocalAIChatMessage } from "../LocalAIClient";
import { renderDeterministic } from "./NLGFinalizer";
import type { ResponsePlan } from "./ResponsePlan";
import type { AnswerSpec } from "./types";

export interface LanguageRenderer { readonly id: string; canRender(plan: ResponsePlan): boolean; render(plan: ResponsePlan, spec: AnswerSpec): string | Promise<string> }

const VARIANTS = ["Dale, cuéntame.", "Sí, te escucho. ¿Qué pasó?", "Va, cuéntame.", "¿Qué pasó? Te leo."];
export class DeterministicNLGRenderer implements LanguageRenderer {
  readonly id = "deterministic-nlg-v1";
  private recent: string[] = [];
  canRender(plan: ResponsePlan): boolean { return plan.canUseDeterministicNLG; }
  render(plan: ResponsePlan, spec: AnswerSpec): string {
    if (plan.communicativeGoal === "ACKNOWLEDGE_AND_INVITE") {
      const available = VARIANTS.filter((value) => !this.recent.includes(value)); const chosen = available[0] ?? VARIANTS[0]; this.recent = [chosen, ...this.recent].slice(0, 3); return chosen;
    }
    return renderDeterministic(spec);
  }
}

export class GemmaRenderer implements LanguageRenderer {
  readonly id = "gemma";
  canRender(plan: ResponsePlan): boolean { return plan.requiresGenerativeRenderer; }
  render(): string { throw new Error("GemmaRenderer is streamed by the local provider"); }
}

export function serializeCompactRendererPrompt(query: string, plan: ResponsePlan): readonly LocalAIChatMessage[] {
  const payload = { goal: plan.communicativeGoal, tone: plan.tone, verbosity: plan.verbosity, facts: plan.authorizedFacts.map((f) => f.text), relations: plan.authorizedRelations.map((r) => [r.source, r.relation, r.target]), uncertainty: plan.uncertainty, conflicts: plan.conflicts, constraints: ["No invent facts", "Do not expose internal IDs"] };
  return [{ role: "user", content: `Renderiza en lenguaje natural solo el plan autorizado.\n[REQUEST]${query}\n[PLAN]${JSON.stringify(payload)}` }];
}

export const deterministicNLGRenderer = new DeterministicNLGRenderer();
