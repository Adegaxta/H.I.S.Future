import type { DiagnosticEvent, DiagnosticLevel } from "./events";

export const DIAGNOSTIC_CATEGORIES = [
  "PROJECT",
  "EDITOR",
  "DATABASE",
  "ASSETS",
  "DISCORD",
  "SYSTEM",
  "INTEGRITY",
  "ERROR",
] as const;

export type PresentedCategory = (typeof DIAGNOSTIC_CATEGORIES)[number] | "UNCLASSIFIED";

export type DiagnosticDisplayEntry =
  | { kind: "event"; key: string; events: [DiagnosticEvent] }
  | { kind: "operation"; key: string; operationId: string; events: DiagnosticEvent[] }
  | { kind: "trace"; key: string; traceId: string; events: DiagnosticEvent[] };

export interface IntegrityFindingSummary {
  rule: string;
  severity: "ERROR" | "WARNING";
  message: string;
  nodeId?: string;
  expected: string;
  actual: string;
  operation?: string;
  evidence?: {
    collection?: string;
    index?: number;
    relatedNodeIds?: string[];
    relationRole?: string;
  };
}

export interface IntegritySummary {
  status: "PASS" | "WARNING" | "FAILED";
  nodeCount: number;
  deletedNodeCount?: number;
  findings: IntegrityFindingSummary[];
}

export interface DiagnosticEntityReference {
  id: string;
  role: "source" | "related";
}

export interface ResolvedDiagnosticEntityReference extends DiagnosticEntityReference {
  state: "active" | "deleted" | "missing";
}

export interface DiagnosticTouchedSummary {
  nodes: DiagnosticEntityReference[];
  resourceIds: string[];
  relationFindings: number;
  workspaceEvents: number;
  persistenceEvents: number;
}

export interface DiagnosticEvidenceEvent {
  timestamp: string;
  level: DiagnosticLevel;
  category: string;
  action: string;
  operation?: string;
  operationId?: string;
  traceId?: string;
  message: string;
  nodeId?: string;
  relatedNodeIds?: string[];
  resourceId?: string;
  integrity?: IntegritySummary;
}

export interface DiagnosticEvidencePayload {
  source: "H.I.S. Future diagnostics";
  historyScope: "current-session-buffer";
  events: DiagnosticEvidenceEvent[];
}

const isIntegritySummary = (value: unknown): value is IntegritySummary => {
  if (!value || typeof value !== "object") return false;
  const summary = value as Partial<IntegritySummary>;
  return (
    (summary.status === "PASS" || summary.status === "WARNING" || summary.status === "FAILED") &&
    typeof summary.nodeCount === "number" &&
    Array.isArray(summary.findings) &&
    summary.findings.every((finding) =>
      finding &&
      typeof finding.rule === "string" &&
      (finding.severity === "ERROR" || finding.severity === "WARNING") &&
      typeof finding.message === "string" &&
      typeof finding.expected === "string" &&
      typeof finding.actual === "string" &&
      (finding.nodeId === undefined || typeof finding.nodeId === "string") &&
      (finding.evidence === undefined || (
        typeof finding.evidence === "object" &&
        finding.evidence !== null &&
        (finding.evidence.relatedNodeIds === undefined ||
          (Array.isArray(finding.evidence.relatedNodeIds) &&
            finding.evidence.relatedNodeIds.every((id) => typeof id === "string")))
      )),
    )
  );
};

export function getPresentedCategory(category: string): PresentedCategory {
  const normalized = category.toUpperCase();
  return DIAGNOSTIC_CATEGORIES.includes(normalized as (typeof DIAGNOSTIC_CATEGORIES)[number])
    ? normalized as PresentedCategory
    : "UNCLASSIFIED";
}

export function getHumanEventMessage(event: DiagnosticEvent): string {
  if (getPresentedCategory(event.category) !== "INTEGRITY" || event.action !== "check.completed") {
    return event.message;
  }
  try {
    const parsed: unknown = JSON.parse(event.technicalDetail);
    if (!isIntegritySummary(parsed)) return event.message;
    if (parsed.status === "PASS") return "Workspace consistent";
    return parsed.status === "WARNING" ? "Workspace warning" : "Workspace inconsistent";
  } catch {
    return event.message;
  }
}

export function getIntegritySummary(event: DiagnosticEvent): IntegritySummary | null {
  if (getPresentedCategory(event.category) !== "INTEGRITY" || event.action !== "check.completed") return null;
  try {
    const parsed: unknown = JSON.parse(event.technicalDetail);
    return isIntegritySummary(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function getDiagnosticEntityReferences(event: DiagnosticEvent): DiagnosticEntityReference[] {
  const references = new Map<string, DiagnosticEntityReference>();
  const add = (id: string | undefined, role: DiagnosticEntityReference["role"]) => {
    if (!id) return;
    const current = references.get(id);
    if (!current || role === "source") references.set(id, { id, role });
  };
  add(event.nodeId, "source");
  event.relatedNodeIds?.forEach((id) => add(id, "related"));
  getIntegritySummary(event)?.findings.forEach((finding) => {
    add(finding.nodeId, "source");
    finding.evidence?.relatedNodeIds?.forEach((id) => add(id, "related"));
  });
  return [...references.values()];
}

export function resolveDiagnosticEntityReferences(
  event: DiagnosticEvent,
  nodes: readonly { id: string }[],
  deletedNodeIds: readonly string[] = [],
): ResolvedDiagnosticEntityReference[] {
  const nodeIds = new Set(nodes.map(({ id }) => id));
  const deletedIds = new Set(deletedNodeIds);
  return getDiagnosticEntityReferences(event).map((reference) => ({
    ...reference,
    state: nodeIds.has(reference.id) ? "active" : deletedIds.has(reference.id) ? "deleted" : "missing",
  }));
}

export function summarizeDiagnosticHistory(events: readonly DiagnosticEvent[]): DiagnosticTouchedSummary {
  const nodes = new Map<string, DiagnosticEntityReference>();
  const resourceIds = new Set<string>();
  let relationFindings = 0;
  let workspaceEvents = 0;
  let persistenceEvents = 0;

  for (const event of events) {
    getDiagnosticEntityReferences(event).forEach((reference) => {
      const current = nodes.get(reference.id);
      if (!current || reference.role === "source") nodes.set(reference.id, reference);
    });
    if (event.resourceId) resourceIds.add(event.resourceId);
    const category = getPresentedCategory(event.category);
    if (category === "DATABASE") persistenceEvents += 1;
    if (category === "PROJECT" || category === "EDITOR") workspaceEvents += 1;
    relationFindings += getIntegritySummary(event)?.findings.filter(
      (finding) => Boolean(finding.evidence?.relationRole),
    ).length ?? 0;
  }

  return {
    nodes: [...nodes.values()],
    resourceIds: [...resourceIds],
    relationFindings,
    workspaceEvents,
    persistenceEvents,
  };
}

export function getLatestIntegritySummary(events: readonly DiagnosticEvent[]): {
  event: DiagnosticEvent;
  summary: IntegritySummary;
} | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    const summary = getIntegritySummary(event);
    if (summary) return { event, summary };
  }
  return null;
}

export function createDiagnosticEvidencePayload(
  events: readonly DiagnosticEvent[],
): DiagnosticEvidencePayload {
  return {
    source: "H.I.S. Future diagnostics",
    historyScope: "current-session-buffer",
    events: events.map((event) => {
      const integrity = getIntegritySummary(event);
      const references = getDiagnosticEntityReferences(event);
      const source = references.find(({ role }) => role === "source");
      const relatedNodeIds = references.filter(({ role }) => role === "related").map(({ id }) => id);
      return {
        timestamp: event.timestamp,
        level: event.level,
        category: event.category,
        action: event.action,
        ...(event.operation ? { operation: event.operation } : {}),
        ...(event.operationId ? { operationId: event.operationId } : {}),
        ...(event.traceId ? { traceId: event.traceId } : {}),
        message: event.message,
        ...(source ? { nodeId: source.id } : {}),
        ...(relatedNodeIds.length ? { relatedNodeIds } : {}),
        ...(event.resourceId ? { resourceId: event.resourceId } : {}),
        ...(integrity ? {
          integrity: {
            status: integrity.status,
            nodeCount: integrity.nodeCount,
            ...(integrity.deletedNodeCount !== undefined ? { deletedNodeCount: integrity.deletedNodeCount } : {}),
            findings: integrity.findings.map((finding) => ({
              rule: finding.rule,
              severity: finding.severity,
              ...(finding.nodeId ? { nodeId: finding.nodeId } : {}),
              expected: finding.expected,
              actual: finding.actual,
              ...(finding.operation ? { operation: finding.operation } : {}),
              message: finding.message,
              ...(finding.evidence ? {
                evidence: {
                  ...(finding.evidence.collection ? { collection: finding.evidence.collection } : {}),
                  ...(finding.evidence.index !== undefined ? { index: finding.evidence.index } : {}),
                  ...(finding.evidence.relatedNodeIds ? { relatedNodeIds: [...finding.evidence.relatedNodeIds] } : {}),
                  ...(finding.evidence.relationRole ? { relationRole: finding.evidence.relationRole } : {}),
                },
              } : {}),
            })),
          },
        } : {}),
      };
    }),
  };
}

export function filterDiagnosticEvents(
  events: readonly DiagnosticEvent[],
  options: {
    debugMode: boolean;
    levels?: readonly DiagnosticLevel[];
    categories?: readonly PresentedCategory[];
  },
): DiagnosticEvent[] {
  return events.filter((event) => {
    if (!options.debugMode && (event.level === "DEBUG" || event.level === "TRACE")) return false;
    if (options.levels?.length && !options.levels.includes(event.level)) return false;
    const category = getPresentedCategory(event.category);
    return !options.categories?.length || options.categories.includes(category);
  });
}

export function groupDiagnosticEvents(events: readonly DiagnosticEvent[]): DiagnosticDisplayEntry[] {
  const entries: DiagnosticDisplayEntry[] = [];
  const operationGroups = new Map<string, Extract<DiagnosticDisplayEntry, { kind: "operation" }>>();
  const traceGroups = new Map<string, Extract<DiagnosticDisplayEntry, { kind: "trace" }>>();
  for (const [index, event] of events.entries()) {
    if (event.operationId) {
      let group = operationGroups.get(event.operationId);
      if (!group) {
        group = { kind: "operation", key: `operation-${event.operationId}`, operationId: event.operationId, events: [] };
        operationGroups.set(event.operationId, group);
        entries.push(group);
      }
      group.events.push(event);
      continue;
    }

    if (event.traceId) {
      let group = traceGroups.get(event.traceId);
      if (!group) {
        group = { kind: "trace", key: `trace-${event.traceId}`, traceId: event.traceId, events: [] };
        traceGroups.set(event.traceId, group);
        entries.push(group);
      }
      group.events.push(event);
      continue;
    }

    entries.push({ kind: "event", key: `event-${index}`, events: [event] });
  }
  return entries;
}

export function formatIntegrityCounts(event: DiagnosticEvent): string | null {
  const summary = getIntegritySummary(event);
  if (!summary) return null;
  const errors = summary.findings.filter(({ severity }) => severity === "ERROR").length;
  const warnings = summary.findings.filter(({ severity }) => severity === "WARNING").length;
  return `${summary.nodeCount} nodes • ${errors} errors • ${warnings} warnings`;
}
