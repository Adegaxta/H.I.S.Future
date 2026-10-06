import { invoke } from "@tauri-apps/api/core";
import { isDesktopRuntime } from "../../project/runtime";
import type { ConversationRecord, ConversationSummaryRecord, MemoryRecord, PersistedConversationState, PersistedMessage, SemanticMention } from "./types";

interface BrowserStore {
  conversations: ConversationRecord[];
  messages: Map<string, PersistedMessage[]>;
  states: Map<string, PersistedConversationState>;
  memories: MemoryRecord[];
  summaries: Map<string, ConversationSummaryRecord>;
}

const browserStores = new Map<string, BrowserStore>();
function browser(projectId: string): BrowserStore {
  let store = browserStores.get(projectId);
  if (!store) { store = { conversations: [], messages: new Map(), states: new Map(), memories: [], summaries: new Map() }; browserStores.set(projectId, store); }
  return store;
}

export async function listConversations(projectId: string): Promise<ConversationRecord[]> {
  if (!isDesktopRuntime()) return [...browser(projectId).conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return invoke("list_ai_conversations", { includeArchived: false, limit: 500 });
}

export async function createConversation(projectId: string, title = "Nueva conversación"): Promise<ConversationRecord> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  if (!isDesktopRuntime()) {
    const record = { id, projectId, vaultId: projectId, title, createdAt: now, updatedAt: now, archived: false, messageCount: 0 };
    browser(projectId).conversations.unshift(record);
    browser(projectId).messages.set(id, []);
    return record;
  }
  return invoke("create_ai_conversation", { id, projectId, vaultId: projectId, title, now });
}

export async function renameConversation(projectId: string, id: string, title: string): Promise<void> {
  const now = new Date().toISOString();
  if (!isDesktopRuntime()) {
    const item = browser(projectId).conversations.find((conversation) => conversation.id === id);
    if (item) { item.title = title; item.updatedAt = now; }
    return;
  }
  await invoke("rename_ai_conversation", { id, title, now });
}

export async function archiveConversation(projectId: string, id: string, archived = true): Promise<void> {
  const now = new Date().toISOString();
  if (!isDesktopRuntime()) {
    const item = browser(projectId).conversations.find((conversation) => conversation.id === id);
    if (item) { item.archived = archived; item.updatedAt = now; }
    return;
  }
  await invoke("archive_ai_conversation", { id, archived, now });
}

export async function deleteConversation(projectId: string, id: string): Promise<void> {
  if (!isDesktopRuntime()) {
    const store = browser(projectId);
    store.conversations = store.conversations.filter((conversation) => conversation.id !== id);
    store.messages.delete(id); store.states.delete(id);
    store.memories = store.memories.filter((memory) => memory.sourceConversationId !== id);
    return;
  }
  await invoke("delete_ai_conversation", { id });
}

export async function appendMessage(projectId: string, message: Omit<PersistedMessage, "sequence">): Promise<PersistedMessage> {
  if (!isDesktopRuntime()) {
    const store = browser(projectId);
    const messages = store.messages.get(message.conversationId) ?? [];
    const persisted = { ...message, sequence: (messages[messages.length - 1]?.sequence ?? 0) + 1 };
    messages.push(persisted); store.messages.set(message.conversationId, messages);
    const conversation = store.conversations.find((item) => item.id === message.conversationId);
    if (conversation) { conversation.messageCount += 1; conversation.updatedAt = message.createdAt ?? new Date().toISOString(); }
    return persisted;
  }
  return invoke("append_ai_message", { message });
}

export async function listMessages(projectId: string, conversationId: string, options: { beforeSequence?: number; limit?: number } = {}): Promise<PersistedMessage[]> {
  const limit = options.limit ?? 80;
  if (!isDesktopRuntime()) {
    const values = browser(projectId).messages.get(conversationId) ?? [];
    return values.filter((message) => options.beforeSequence === undefined || message.sequence < options.beforeSequence).slice(-limit);
  }
  return invoke("list_ai_messages", { conversationId, beforeSequence: options.beforeSequence ?? null, limit });
}

export async function searchMessages(projectId: string, conversationId: string, query: string, limit = 20): Promise<PersistedMessage[]> {
  if (!isDesktopRuntime()) {
    const lowered = query.toLocaleLowerCase();
    return (browser(projectId).messages.get(conversationId) ?? []).filter((message) => message.content.toLocaleLowerCase().includes(lowered)).slice(-limit);
  }
  return invoke("search_ai_messages", { conversationId, query, limit });
}

export async function saveConversationState(projectId: string, state: PersistedConversationState): Promise<void> {
  if (!isDesktopRuntime()) { browser(projectId).states.set(state.conversationId, state); return; }
  await invoke("save_ai_conversation_state", { conversationId: state.conversationId, stateJson: state, now: state.updatedAt });
}

export async function loadConversationState(projectId: string, conversationId: string): Promise<PersistedConversationState | null> {
  if (!isDesktopRuntime()) return browser(projectId).states.get(conversationId) ?? null;
  return invoke("load_ai_conversation_state", { conversationId });
}

export async function saveSemanticMentions(projectId: string, mentions: SemanticMention[]): Promise<void> {
  void projectId;
  if (!mentions.length || !isDesktopRuntime()) return;
  await invoke("save_ai_semantic_mentions", { mentions });
}

export async function saveMemoryRecords(projectId: string, records: MemoryRecord[]): Promise<void> {
  if (!records.length) return;
  if (!isDesktopRuntime()) {
    const store = browser(projectId);
    for (const record of records) {
      if (["PREFERENCE", "TASK", "DECISION"].includes(record.memoryType)) {
        store.memories = store.memories.map((existing) => !existing.supersededBy && existing.id !== record.id && existing.scope === record.scope && existing.memoryType === record.memoryType && existing.subject === record.subject && (existing.predicate ?? "") === (record.predicate ?? "") ? { ...existing, supersededBy: record.id } : existing);
      }
      store.memories.push(record);
    }
    return;
  }
  await invoke("save_ai_memory_records", { records });
}

export async function listMemoryRecords(projectId: string, conversationId: string, limit = 250): Promise<MemoryRecord[]> {
  const now = new Date().toISOString();
  if (!isDesktopRuntime()) return browser(projectId).memories.filter((memory) => !memory.supersededBy && (!memory.expiresAt || memory.expiresAt > now) && (memory.scope !== "CONVERSATION" || memory.sourceConversationId === conversationId));
  return invoke("list_ai_memory_records", { conversationId, now, limit });
}

export async function saveConversationSummary(projectId: string, summary: ConversationSummaryRecord): Promise<void> {
  if (!isDesktopRuntime()) { browser(projectId).summaries.set(summary.conversationId, summary); return; }
  await invoke("save_ai_conversation_summary", { summary });
}

export async function loadConversationSummary(projectId: string, conversationId: string): Promise<ConversationSummaryRecord | null> {
  if (!isDesktopRuntime()) return browser(projectId).summaries.get(conversationId) ?? null;
  return invoke("load_ai_conversation_summary", { conversationId });
}
