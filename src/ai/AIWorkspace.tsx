import { useCallback, useEffect, useLayoutEffect, useRef, useState, type UIEvent } from "react";
import type { NodeItem } from "../types/nodes";
import { AIComposer } from "./AIComposer";
import { AIConversationSidebar } from "./AIConversationSidebar";
import { AIMessage } from "./AIMessage";
import { emitAILog } from "./AILogger";
import { prepareAIRequest } from "./AIRequestPreparation";
import { LOCAL_AI_CONFIG } from "./config";
import { listAIConcepts } from "./ConceptStore";
import { LocalAIClientError, streamLocalAIChat } from "./LocalAIClient";
import { ensureLocalAIServer, LocalAIRuntimeError, type LocalAIRuntimeState } from "./LocalAIRuntime";
import { GEMITAV_V0_ENABLED, runGemitaV, type GemitaVConversationState } from "./response-engine";
import { applyMemoryPolicy, assembleConversationContext, buildIncrementalSummary, emptyPersistedConversationState, resolveGeneralReferences, shouldRefreshSummary, updateConversationState } from "./conversation";
import { appendMessage, createConversation, deleteConversation, listConversations, listMemoryRecords, listMessages, loadConversationState, loadConversationSummary, renameConversation, saveConversationState, saveConversationSummary, saveMemoryRecords, saveSemanticMentions, searchMessages } from "./conversation/ConversationRepository";
import type { PersistedConversationState } from "./conversation";
import { conversationEventGraph, hotConversationStates } from "./conversation";
import { languageUnderstandingPipeline } from "./language-understanding";
import type { AIConversationSummary, AIMessageData } from "./types";
import "./styles.css";

const AUTO_SCROLL_THRESHOLD_PX = 120;
const UI_MESSAGE_PAGE = 80;

function updateConversationMessage(state: Record<string, AIMessageData[]>, conversationId: string, messageId: string, update: (message: AIMessageData) => AIMessageData) {
  return { ...state, [conversationId]: (state[conversationId] ?? []).map((message) => message.id === messageId ? update(message) : message) };
}

export default function AIWorkspace({ nodes, projectId, initialConversationId, onConversationChange }: { nodes: readonly NodeItem[]; projectId: string; initialConversationId?: string; onConversationChange?: (conversationId: string) => void }) {
  const [conversations, setConversations] = useState<AIConversationSummary[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [messagesByConversation, setMessagesByConversation] = useState<Record<string, AIMessageData[]>>({});
  const [hasOlderByConversation, setHasOlderByConversation] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [runtimeState, setRuntimeState] = useState<LocalAIRuntimeState>("stopped");
  const endRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const gemitaStateByConversationRef = useRef<Record<string, GemitaVConversationState>>({});
  const semanticStateByConversationRef = useRef<Record<string, PersistedConversationState>>({});
  const mountedRef = useRef(true);
  const initialConversationIdRef = useRef(initialConversationId);
  const onConversationChangeRef = useRef(onConversationChange);
  onConversationChangeRef.current = onConversationChange;
  const messages = messagesByConversation[selectedId] ?? [];
  const lastMessageContent = messages[messages.length - 1]?.content;

  const loadConversation = useCallback(async (id: string) => {
    shouldAutoScrollRef.current = true;
    setSelectedId(id);
    onConversationChangeRef.current?.(id);
    const [persistedMessages, persistedState] = await Promise.all([listMessages(projectId, id, { limit: UI_MESSAGE_PAGE }), loadConversationState(projectId, id)]);
    if (!mountedRef.current) return;
    setMessagesByConversation((current) => ({ ...current, [id]: persistedMessages.map(({ model: _model, ...message }) => message) }));
    setHasOlderByConversation((current) => ({ ...current, [id]: persistedMessages.length === UI_MESSAGE_PAGE }));
    semanticStateByConversationRef.current[id] = persistedState ?? emptyPersistedConversationState(id);
    emitAILog("chat", "conversation_opened", { metadata: { conversationId: id, loadedMessages: persistedMessages.length, paginated: persistedMessages.length === UI_MESSAGE_PAGE } });
  }, [projectId]);

  useEffect(() => {
    mountedRef.current = true;
    void (async () => {
      let records = await listConversations(projectId);
      if (!records.length) records = [await createConversation(projectId)];
      if (!mountedRef.current) return;
      setConversations(records);
      const initial = records.find((record) => record.id === initialConversationIdRef.current) ?? records[0];
      await loadConversation(initial.id);
    })().catch((error: unknown) => emitAILog("error", "conversation_bootstrap_failed", { metadata: { message: error instanceof Error ? error.message : String(error) } }));
    return () => { mountedRef.current = false; abortControllerRef.current?.abort(); abortControllerRef.current = null; };
  }, [loadConversation, projectId]);

  useLayoutEffect(() => { if (shouldAutoScrollRef.current) endRef.current?.scrollIntoView({ block: "end" }); }, [lastMessageContent, messages.length, selectedId]);
  const handleMessagesScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const container = event.currentTarget;
    shouldAutoScrollRef.current = container.scrollHeight - container.scrollTop - container.clientHeight <= AUTO_SCROLL_THRESHOLD_PX;
  }, []);

  const newChat = () => {
    if (isGenerating) return;
    void createConversation(projectId).then((conversation) => {
      setConversations((current) => [conversation, ...current]);
      setMessagesByConversation((current) => ({ ...current, [conversation.id]: [] }));
      semanticStateByConversationRef.current[conversation.id] = emptyPersistedConversationState(conversation.id);
      setSelectedId(conversation.id); setQuery(""); shouldAutoScrollRef.current = true;
    });
  };
  const selectConversation = useCallback((id: string) => { if (!isGenerating) void loadConversation(id); }, [isGenerating, loadConversation]);
  const handleRename = (id: string) => {
    const title = window.prompt("Nuevo nombre de la conversación", conversations.find((item) => item.id === id)?.title ?? "");
    if (!title?.trim()) return;
    void renameConversation(projectId, id, title.trim()).then(() => setConversations((items) => items.map((item) => item.id === id ? { ...item, title: title.trim(), updatedAt: new Date().toISOString() } : item)));
  };
  const handleDelete = (id: string) => {
    if (!window.confirm("¿Eliminar esta conversación y su memoria asociada?")) return;
    void deleteConversation(projectId, id).then(async () => {
      const remaining = conversations.filter((item) => item.id !== id);
      const next = remaining[0] ?? await createConversation(projectId);
      setConversations(remaining.length ? remaining : [next]);
      setMessagesByConversation((current) => { const copy = { ...current }; delete copy[id]; return copy; });
      delete semanticStateByConversationRef.current[id]; delete gemitaStateByConversationRef.current[id];
      await loadConversation(next.id);
    });
  };
  const loadOlder = () => {
    const firstSequence = messages[0]?.sequence;
    if (!selectedId || firstSequence === undefined) return;
    void listMessages(projectId, selectedId, { beforeSequence: firstSequence, limit: UI_MESSAGE_PAGE }).then((older) => {
      setMessagesByConversation((current) => ({ ...current, [selectedId]: [...older.map(({ model: _model, ...message }) => message), ...(current[selectedId] ?? [])] }));
      setHasOlderByConversation((current) => ({ ...current, [selectedId]: older.length === UI_MESSAGE_PAGE }));
    });
  };

  const send = (content: string) => {
    const trimmedContent = content.trim();
    if (!trimmedContent || isGenerating || !selectedId) return;
    shouldAutoScrollRef.current = true;
    const conversationId = selectedId;
    const currentMessages = messagesByConversation[conversationId] ?? [];
    const requestKey = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const requestId = requestKey.slice(-4);
    const now = new Date().toISOString();
    const userMessage: AIMessageData = { id: `user-${requestKey}`, role: "user", content: trimmedContent, createdAt: now };
    const assistantMessage: AIMessageData = { id: `assistant-${requestKey}`, role: "assistant", content: "", createdAt: now, pending: true };
    emitAILog("his", "request_started", { requestId, metadata: { conversationId } });
    setMessagesByConversation((current) => ({ ...current, [conversationId]: [...(current[conversationId] ?? []), userMessage, assistantMessage] }));
    setIsGenerating(true);

    void (async () => {
      const persistedUser = await appendMessage(projectId, { id: userMessage.id, role: "user", content: userMessage.content, conversationId, createdAt: now });
      userMessage.sequence = persistedUser.sequence;
      const currentConversation = conversations.find((item) => item.id === conversationId);
      if (currentConversation?.title === "Nueva conversación") {
        const title = trimmedContent.slice(0, 42);
        await renameConversation(projectId, conversationId, title);
        setConversations((items) => items.map((item) => item.id === conversationId ? { ...item, title, updatedAt: now, messageCount: (item.messageCount ?? 0) + 1 } : item));
      }

      if (!GEMITAV_V0_ENABLED) {
        const prepared = prepareAIRequest(trimmedContent, currentMessages, nodes, listAIConcepts(), requestId);
        const controller = new AbortController(); abortControllerRef.current = controller; setRuntimeState("starting");
        await ensureLocalAIServer(); if (mountedRef.current) setRuntimeState("ready");
        let text = "";
        const metrics = await streamLocalAIChat(prepared.history, { onDelta: (delta) => { text += delta; setMessagesByConversation((current) => updateConversationMessage(current, conversationId, assistantMessage.id, (message) => ({ ...message, content: text }))); } }, controller.signal);
        await appendMessage(projectId, { id: assistantMessage.id, conversationId, role: "assistant", content: text, createdAt: new Date().toISOString(), pipeline: "legacy", model: LOCAL_AI_CONFIG.requestModel });
        setMessagesByConversation((current) => updateConversationMessage(current, conversationId, assistantMessage.id, (message) => ({ ...message, pending: false, ...(metrics ? { metrics } : {}) })));
        return;
      }

      const priorState = semanticStateByConversationRef.current[conversationId] ?? await loadConversationState(projectId, conversationId) ?? emptyPersistedConversationState(conversationId);
      const recent = currentMessages.filter((message) => !message.pending && !message.error).slice(-12).map((message, index) => ({ ...message, sequence: message.sequence ?? Math.max(1, persistedUser.sequence - currentMessages.length + index) }));
      const understanding = languageUnderstandingPipeline.analyze({ conversationId, messageId: userMessage.id, text: trimmedContent, role: "user", state: priorState, recentMessages: recent });
      const frame = understanding.semanticFrame.value;
      conversationEventGraph.addFrame(conversationId, userMessage.id, frame);
      const reference = resolveGeneralReferences({ text: trimmedContent, frame, state: priorState, recentMessages: recent });
      const nextState = updateConversationState({ state: priorState, frame, userMessageId: userMessage.id, referencedMessageIds: reference.referencedMessageIds });
      const policy = applyMemoryPolicy({ conversationId, messageId: userMessage.id, text: trimmedContent, frame });
      await Promise.all([saveSemanticMentions(projectId, frame.mentions), saveConversationState(projectId, nextState), saveMemoryRecords(projectId, policy.records)]);
      semanticStateByConversationRef.current[conversationId] = nextState;
      const searchTerm = [...frame.people, ...reference.resolvedSubjects, ...priorState.activePeople].filter(Boolean).slice(0, 2).join(" ");
      const [memories, summary, oldMatches] = await Promise.all([
        listMemoryRecords(projectId, conversationId),
        loadConversationSummary(projectId, conversationId),
        searchTerm ? searchMessages(projectId, conversationId, searchTerm, 12) : Promise.resolve([]),
      ]);
      const context = assembleConversationContext({ conversationId, currentMessage: trimmedContent, semanticFrame: frame, state: { ...nextState, activePeople: reference.resolvedSubjects.length ? reference.resolvedSubjects : nextState.activePeople }, recentMessages: recent, referencedMessages: oldMatches.filter((message) => !recent.some((item) => item.id === message.id)), memories, ...(summary ? { summary } : {}), charBudget: 4_800 });
      hotConversationStates.update(conversationId, nextState, frame, context);
      emitAILog("semantic", "analysis_complete", { requestId, metadata: { people: frame.people.length, concepts: frame.concepts.length, dates: frame.mentions.filter((item) => item.semanticType === "DATE").length, tasks: frame.tasks.length, references: frame.references.length } });
      emitAILog("reference", "resolved", { requestId, metadata: { subjects: reference.resolvedSubjects, messages: reference.referencedMessageIds.length, confidence: reference.confidence, reasons: reference.reasons } });
      emitAILog("memory_write", "policy_applied", { requestId, metadata: { decision: policy.decision, records: policy.records.length, reasons: policy.reasons } });
      emitAILog("memory_retrieve", "ranked", { requestId, metadata: { candidates: memories.length, selected: context.selectedMemories.length, rejected: context.rejectedMemories.length, reasons: context.selectedMemories.flatMap((item) => item.reasons) } });
      emitAILog("context_assembly", "assembled", { requestId, metadata: { recent: context.recentMessages.length, referenced: context.referencedMessages.length, memories: context.selectedMemories.length, summary: Boolean(context.conversationSummary), hisEvidence: context.hisEvidenceRefs.length, totalChars: context.serialized.length } });

      const controller = new AbortController(); abortControllerRef.current = controller;
      const result = await runGemitaV({ requestId, query: trimmedContent, history: recent, nodes, concepts: listAIConcepts(), state: gemitaStateByConversationRef.current[conversationId], conversationContext: context, languageUnderstanding: understanding }, {
        signal: controller.signal,
        maxRepairAttempts: 1,
        generateDraft: async (history, signal, options) => {
          setRuntimeState("starting");
          const runtime = await ensureLocalAIServer(); if (mountedRef.current && !signal.aborted) setRuntimeState("ready");
          emitAILog("model", "draft_request_sent", { requestId, metadata: { model: LOCAL_AI_CONFIG.requestModel, historyMessages: history.length, promptChars: history.reduce((sum, message) => sum + message.content.length, 0), runtimeOwnership: runtime.ownership } });
          let text = ""; const metrics = await streamLocalAIChat(history, { onDelta: (delta) => { text += delta; } }, signal, options); return { text, metrics };
        },
      });
      if (!mountedRef.current || controller.signal.aborted) return;
      gemitaStateByConversationRef.current[conversationId] = result.state;
      const assistantCreatedAt = new Date().toISOString();
      const persistedAssistant = await appendMessage(projectId, { id: assistantMessage.id, conversationId, role: "assistant", content: result.text, createdAt: assistantCreatedAt, responseType: result.route.mode, operation: result.act.primaryAct, pipeline: "gemitav-v0.1", model: result.modelCalls > 0 ? LOCAL_AI_CONFIG.requestModel : undefined, metadata: { provenance: context.provenance, reasons: context.reasons, answerSpecRef: `answerspec://${requestId}` } });
      const finalState: PersistedConversationState = { ...nextState, lastAssistantMessageId: assistantMessage.id, lastIntent: result.answerSpec.intents[0] ?? null, lastScope: result.answerSpec.scope, lastConversationAct: result.act.primaryAct, lastAnswerSpecRef: `answerspec://${requestId}`, lastEvidenceRefs: result.answerSpec.sourceIds, updatedAt: assistantCreatedAt };
      await saveConversationState(projectId, finalState); semanticStateByConversationRef.current[conversationId] = finalState;
      const messageCount = (currentConversation?.messageCount ?? 0) + 2;
      if (shouldRefreshSummary(messageCount)) {
        const summaryMessages = await listMessages(projectId, conversationId, { limit: UI_MESSAGE_PAGE });
        const delta = summary ? summaryMessages.filter((message) => message.sequence > summary.sourceSequenceEnd) : summaryMessages;
        if (delta.length) {
          const nextSummary = buildIncrementalSummary({ conversationId, messages: delta, ...(summary ? { previous: summary } : {}) });
          await saveConversationSummary(projectId, nextSummary);
          emitAILog("summary", "incremental_summary_saved", { requestId, metadata: { version: nextSummary.version, start: nextSummary.sourceSequenceStart, end: nextSummary.sourceSequenceEnd, userStatements: nextSummary.userStatements.length, assistantStatementsPromoted: 0 } });
        }
      }
      setMessagesByConversation((current) => updateConversationMessage(current, conversationId, assistantMessage.id, (message) => ({ ...message, sequence: persistedAssistant.sequence, content: result.text, pending: false, model: result.modelCalls > 0 ? LOCAL_AI_CONFIG.model : undefined, metrics: result.modelCalls > 0 ? result.modelMetrics ?? undefined : undefined })));
      setConversations((items) => items.map((item) => item.id === conversationId ? { ...item, updatedAt: assistantCreatedAt, messageCount: (item.messageCount ?? 1) + 1 } : item).sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")));
    })().catch((error: unknown) => {
      if (abortControllerRef.current?.signal.aborted) { emitAILog("warn", "request_aborted", { requestId }); return; }
      emitAILog("error", error instanceof LocalAIRuntimeError ? "llama_unavailable" : "conversation_request_failed", { requestId, metadata: { code: error instanceof LocalAIClientError ? error.kind : "unknown", message: error instanceof Error ? error.message : String(error) } });
      if (mountedRef.current) setMessagesByConversation((current) => updateConversationMessage(current, conversationId, assistantMessage.id, (message) => ({ ...message, content: error instanceof LocalAIRuntimeError ? error.message : "GemitaV no pudo completar una respuesta segura.", pending: false, error: true })));
    }).finally(() => { if (mountedRef.current) { abortControllerRef.current = null; setIsGenerating(false); } });
  };

  return <section className="ai-workspace" aria-label="IA">
    <AIConversationSidebar conversations={conversations} selectedId={selectedId} query={query} isGenerating={isGenerating} onQueryChange={setQuery} onNewChat={newChat} onSelect={selectConversation} onRename={handleRename} onDelete={handleDelete} />
    <div className="ai-conversation">
      <div className="ai-conversation__messages" aria-live="polite" onScroll={handleMessagesScroll}><div className="ai-conversation__messages-inner">
        {hasOlderByConversation[selectedId] ? <button type="button" className="ai-conversation__load-older" onClick={loadOlder} disabled={isGenerating}>Cargar mensajes anteriores</button> : null}
        {messages.length === 0 ? <div className="ai-conversation__empty">Escribe un mensaje para comenzar una conversación local.</div> : messages.map((message) => <AIMessage key={message.id} message={message} />)}<div ref={endRef} />
      </div></div>
      <div className="ai-conversation__composer-wrap"><AIComposer model={LOCAL_AI_CONFIG.model} isGenerating={isGenerating} onSend={send} /><div className="ai-conversation__runtime-note" role="status">{runtimeState === "starting" ? "Preparando modelo local…" : isGenerating ? "Generando respuesta…" : "llama.cpp local · 127.0.0.1:8080"}</div></div>
    </div>
  </section>;
}
