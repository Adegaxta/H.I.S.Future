import type { QueryPlan, ResponsePlan } from "./types";

export function buildResponsePlan(plan: QueryPlan): ResponsePlan {
  const format = plan.intents.includes("COMPARE") ? "comparison"
    : plan.intents.includes("TIMELINE") ? "timeline"
      : plan.desiredDepth === "exhaustive" || plan.aspects.length >= 3 ? "structured"
        : "prose";
  return { depth: plan.desiredDepth, format, requiredAspects: [...plan.aspects] };
}
