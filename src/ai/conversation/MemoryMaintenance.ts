import { normalizeLexicalText } from "../../lexicon";
import { supersessionKey } from "./MemoryPolicy";
import type { MemoryRecord } from "./types";

export interface MemoryAuditEntry { recordId: string; action: "keep" | "deduplicate" | "supersede" | "expire" | "conflict"; reason: string; relatedRecordId?: string }
export interface MemoryConsolidationResult { active: MemoryRecord[]; changed: MemoryRecord[]; audit: MemoryAuditEntry[] }

export class MemoryConsolidator {
  consolidate(records: readonly MemoryRecord[], now = new Date()): MemoryConsolidationResult {
    const active: MemoryRecord[] = []; const changed: MemoryRecord[] = []; const audit: MemoryAuditEntry[] = []; const exact = new Map<string, MemoryRecord>(); const mutable = records.map((record) => ({ ...record }));
    for (const record of mutable.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))) {
      if (record.expiresAt && new Date(record.expiresAt) <= now) { audit.push({ recordId: record.id, action: "expire", reason: "expires_at_elapsed" }); continue; }
      const duplicateKey = `${record.scope}|${record.memoryType}|${normalizeLexicalText(record.subject)}|${normalizeLexicalText(record.predicate ?? "")}|${normalizeLexicalText(record.value)}`;
      const duplicate = exact.get(duplicateKey);
      if (duplicate) { record.supersededBy = duplicate.id; changed.push(record); audit.push({ recordId: record.id, action: "deduplicate", reason: "same_normalized_claim", relatedRecordId: duplicate.id }); continue; }
      const key = supersessionKey(record);
      const previous = key ? [...active].reverse().find((candidate) => supersessionKey(candidate) === key && !candidate.supersededBy) : undefined;
      if (previous && normalizeLexicalText(previous.value) !== normalizeLexicalText(record.value)) {
        previous.supersededBy = record.id; changed.push(previous); audit.push({ recordId: previous.id, action: "supersede", reason: "newer_value_for_same_subject_predicate", relatedRecordId: record.id });
      }
      exact.set(duplicateKey, record); active.push(record); audit.push({ recordId: record.id, action: "keep", reason: "current_non_duplicate" });
    }
    return { active: active.filter((record) => !record.supersededBy), changed, audit };
  }
}

export class MemoryDeduplicator extends MemoryConsolidator {}
export class MemoryConflictResolver extends MemoryConsolidator {}
export class MemoryDecay { score(record: MemoryRecord, now = new Date()): number { const days = Math.max(0, (now.getTime() - new Date(record.updatedAt).getTime()) / 86_400_000); return record.confidence * Math.max(0.2, 1 - days / 365); } }
export class MemoryAudit { inspect(records: readonly MemoryRecord[]): MemoryAuditEntry[] { return new MemoryConsolidator().consolidate(records).audit; } }
