import type { ActiveConversationContext, PersistedConversationState, SemanticFrame } from "./types";

export interface HotConversationSnapshot { state: PersistedConversationState; recentFrames: SemanticFrame[]; selectedMemoryIds: string[]; summaryVersion: number | null; version: number }
export class HotConversationStateStore {
  private readonly values = new Map<string, HotConversationSnapshot>();
  get(conversationId: string): HotConversationSnapshot | null { return this.values.get(conversationId) ?? null; }
  update(conversationId: string, state: PersistedConversationState, frame: SemanticFrame, context?: ActiveConversationContext): HotConversationSnapshot {
    const previous = this.values.get(conversationId);
    const next = { state, recentFrames: [...(previous?.recentFrames ?? []), frame].slice(-16), selectedMemoryIds: context?.selectedMemories.map((item) => item.record.id) ?? previous?.selectedMemoryIds ?? [], summaryVersion: context?.conversationSummary?.version ?? previous?.summaryVersion ?? null, version: (previous?.version ?? 0) + 1 };
    this.values.set(conversationId, next); return next;
  }
  close(conversationId: string): HotConversationSnapshot | null { const value = this.get(conversationId); this.values.delete(conversationId); return value; }
}
export const hotConversationStates = new HotConversationStateStore();
