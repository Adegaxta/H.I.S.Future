import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { isDesktopRuntime } from "../project/runtime";
import type { NodeItem } from "../types/nodes";
import {
  clearDiagnosticEvents,
  getDiagnosticEvents,
  isDiagnosticTrackingPaused,
  MAX_DIAGNOSTIC_EVENTS,
  pauseDiagnosticTracking,
  subscribeDiagnosticEvents,
  type DiagnosticEvent,
} from "../diagnostics/events";
import {
  DIAGNOSTIC_CATEGORIES,
  filterDiagnosticEvents,
  formatIntegrityCounts,
  getDiagnosticEntityReferences,
  getHumanEventMessage,
  getIntegritySummary,
  getLatestIntegritySummary,
  getPresentedCategory,
  groupDiagnosticEvents,
  resolveDiagnosticEntityReferences,
  summarizeDiagnosticHistory,
  type DiagnosticDisplayEntry,
  type DiagnosticEntityReference,
  type IntegrityFindingSummary,
  type PresentedCategory,
} from "../diagnostics/presentation";
import "./DevelopmentConsole.css";

type ConsoleMode = "human" | "debug";
type ConsoleView = "events" | "overview";
type TraceFilter = { kind: "operation" | "trace"; id: string } | null;

interface DevelopmentConsoleProps {
  nodes: readonly NodeItem[];
  deletedNodeIds: readonly string[];
  workspaceAvailable: boolean;
  onInspectNode: (id: string) => void;
  onNavigateNode: (id: string) => void;
  onNavigateDeletedNode: (id: string) => void;
  focusNodeId: string | null;
  openRequest: number;
  onClearNodeFocus: () => void;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const levels = ["TRACE", "DEBUG", "INFO", "WARN", "ERROR"] as const;
const formatTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

function EntityActions({
  reference,
  state,
  workspaceAvailable,
  onInspect,
  onNavigate,
  onNavigateDeleted,
}: {
  reference: DiagnosticEntityReference;
  state: "active" | "deleted" | "missing";
  workspaceAvailable: boolean;
  onInspect: (id: string) => void;
  onNavigate: (id: string) => void;
  onNavigateDeleted: (id: string) => void;
}) {
  return (
    <div className="dev-console__entity">
      <span className={`dev-console__entity-role dev-console__entity-role--${reference.role}`}>
        {reference.role === "source" ? "SOURCE" : "RELATED"}
      </span>
      <code>{reference.id}</code>
      {!workspaceAvailable ? (
        <strong className="dev-console__unavailable">WORKSPACE UNAVAILABLE</strong>
      ) : state === "missing" ? (
        <strong className="dev-console__missing">MISSING</strong>
      ) : state === "deleted" ? (
        <>
          <strong className="dev-console__deleted">TRASH</strong>
          <button type="button" onClick={() => onNavigateDeleted(reference.id)}>Open Trash</button>
        </>
      ) : (
        <span className="dev-console__entity-actions">
          <button type="button" onClick={() => onNavigate(reference.id)}>Navigate</button>
          <button type="button" onClick={() => onInspect(reference.id)}>Inspect</button>
          <button type="button" onClick={() => onInspect(reference.id)}>Find references</button>
        </span>
      )}
    </div>
  );
}

function FindingEntities({
  finding,
  nodes,
  deletedNodeIds,
  workspaceAvailable,
  onInspect,
  onNavigate,
  onNavigateDeleted,
}: {
  finding: IntegrityFindingSummary;
  nodes: readonly NodeItem[];
  deletedNodeIds: readonly string[];
  workspaceAvailable: boolean;
  onInspect: (id: string) => void;
  onNavigate: (id: string) => void;
  onNavigateDeleted: (id: string) => void;
}) {
  const activeNodeIds = new Set(nodes.map(({ id }) => id));
  const trashNodeIds = new Set(deletedNodeIds);
  const entities = new Map<string, DiagnosticEntityReference>();
  if (finding.nodeId) entities.set(finding.nodeId, { id: finding.nodeId, role: "source" });
  finding.evidence?.relatedNodeIds?.forEach((id) => {
    if (!entities.has(id)) entities.set(id, { id, role: "related" });
  });
  if (!entities.size) return null;
  return (
    <div className="dev-console__entities">
      {[...entities.values()].map((reference) => (
        <EntityActions
          key={`${reference.role}-${reference.id}`}
          reference={reference}
          state={activeNodeIds.has(reference.id) ? "active" : trashNodeIds.has(reference.id) ? "deleted" : "missing"}
          workspaceAvailable={workspaceAvailable}
          onInspect={onInspect}
          onNavigate={onNavigate}
          onNavigateDeleted={onNavigateDeleted}
        />
      ))}
    </div>
  );
}

function IntegrityFindingDetails({
  event,
  nodes,
  deletedNodeIds,
  workspaceAvailable,
  onInspect,
  onNavigate,
  onNavigateDeleted,
}: {
  event: DiagnosticEvent;
  nodes: readonly NodeItem[];
  deletedNodeIds: readonly string[];
  workspaceAvailable: boolean;
  onInspect: (id: string) => void;
  onNavigate: (id: string) => void;
  onNavigateDeleted: (id: string) => void;
}) {
  const result = getIntegritySummary(event);
  if (!result) return null;
  return (
    <div className="dev-console__findings">
      {result.findings.map((finding, index) => (
        <details className="dev-console__finding" key={`${finding.rule}-${finding.nodeId ?? "workspace"}-${index}`}>
          <summary>
            <span>{finding.severity}</span>
            <code>{finding.rule}</code>
            {finding.nodeId && <span>Node {finding.nodeId}</span>}
          </summary>
          <p>{finding.message}</p>
          <dl>
            <dt>Expected</dt><dd>{finding.expected}</dd>
            <dt>Actual</dt><dd>{finding.actual}</dd>
            {finding.operation && <><dt>Operation</dt><dd>{finding.operation}</dd></>}
            {finding.evidence?.collection && <><dt>Collection</dt><dd>{finding.evidence.collection}</dd></>}
            {finding.evidence?.index !== undefined && <><dt>Index</dt><dd>{finding.evidence.index}</dd></>}
            {finding.evidence?.relationRole && <><dt>Relation</dt><dd>{finding.evidence.relationRole}</dd></>}
          </dl>
          <FindingEntities
            finding={finding}
            nodes={nodes}
            deletedNodeIds={deletedNodeIds}
            workspaceAvailable={workspaceAvailable}
            onInspect={onInspect}
            onNavigate={onNavigate}
            onNavigateDeleted={onNavigateDeleted}
          />
          <details className="dev-console__technical">
            <summary>Raw finding</summary>
            <pre>{JSON.stringify(finding, null, 2)}</pre>
          </details>
        </details>
      ))}
      {!result.findings.length && <p className="dev-console__empty">No integrity findings.</p>}
    </div>
  );
}

function EventRow({
  event,
  nodes,
  deletedNodeIds,
  workspaceAvailable,
  debugMode,
  onInspect,
  onNavigate,
  onNavigateDeleted,
  onFollow,
}: {
  event: DiagnosticEvent;
  nodes: readonly NodeItem[];
  deletedNodeIds: readonly string[];
  workspaceAvailable: boolean;
  debugMode: boolean;
  onInspect: (id: string) => void;
  onNavigate: (id: string) => void;
  onNavigateDeleted: (id: string) => void;
  onFollow: (filter: Exclude<TraceFilter, null>) => void;
}) {
  const category = getPresentedCategory(event.category);
  const integrity = getIntegritySummary(event);
  const entities = resolveDiagnosticEntityReferences(event, nodes, deletedNodeIds);
  const integrityMark = integrity?.status === "PASS" ? "✓" : integrity?.status === "WARNING" ? "⚠" : integrity ? "✕" : null;
  return (
    <article className={`dev-console__event dev-console__event--${event.level.toLowerCase()}`}>
      <details>
        <summary className="dev-console__event-summary">
          <time>{formatTime(event.timestamp)}</time>
          <strong>{category}</strong>
          <span className="dev-console__event-message">
            {integrityMark && integrity && <span className={`dev-console__integrity-mark dev-console__integrity-mark--${integrity.status.toLowerCase()}`}>{integrityMark} </span>}
            {getHumanEventMessage(event)}
          </span>
          <span className="dev-console__event-level">{event.level}</span>
          {integrity && <small>{formatIntegrityCounts(event)}</small>}
        </summary>
        <div className="dev-console__event-details">
          {event.operation && <p><b>Operation</b> {event.operation}</p>}
          {event.operationId && <p><b>Operation trace</b> <code>{event.operationId}</code></p>}
          {event.traceId && <p><b>Trace</b> <code>{event.traceId}</code></p>}
          {(event.operationId || event.traceId) ? (
            <button
              type="button"
              onClick={() => onFollow(event.operationId
                ? { kind: "operation", id: event.operationId }
                : { kind: "trace", id: event.traceId! })}
            >
              Follow {event.operationId ? "operation" : "trace"}
            </button>
          ) : (
            <p className="dev-console__unavailable">Operation trace unavailable for this event.</p>
          )}
          {entities.length > 0 && (
            <div className="dev-console__entities">
              {entities.map((reference) => (
                <EntityActions
                  key={`${reference.role}-${reference.id}`}
                  reference={reference}
                  state={reference.state}
                  workspaceAvailable={workspaceAvailable}
                  onInspect={onInspect}
                  onNavigate={onNavigate}
                  onNavigateDeleted={onNavigateDeleted}
                />
              ))}
            </div>
          )}
          {event.resourceId && <p><b>Resource</b> <code>{event.resourceId}</code></p>}
          <IntegrityFindingDetails
            event={event}
            nodes={nodes}
            deletedNodeIds={deletedNodeIds}
            workspaceAvailable={workspaceAvailable}
            onInspect={onInspect}
            onNavigate={onNavigate}
            onNavigateDeleted={onNavigateDeleted}
          />
          {debugMode && (
            <details className="dev-console__technical">
              <summary>Technical event</summary>
              <pre>{JSON.stringify(event, null, 2)}</pre>
            </details>
          )}
        </div>
      </details>
    </article>
  );
}

function EventEntry({
  entry,
  debugMode,
  nodes,
  deletedNodeIds,
  workspaceAvailable,
  onInspect,
  onNavigate,
  onNavigateDeleted,
  onFollow,
}: {
  entry: DiagnosticDisplayEntry;
  debugMode: boolean;
  nodes: readonly NodeItem[];
  deletedNodeIds: readonly string[];
  workspaceAvailable: boolean;
  onInspect: (id: string) => void;
  onNavigate: (id: string) => void;
  onNavigateDeleted: (id: string) => void;
  onFollow: (filter: Exclude<TraceFilter, null>) => void;
}) {
  if (entry.kind === "event") {
    return <EventRow event={entry.events[0]} nodes={nodes} deletedNodeIds={deletedNodeIds} workspaceAvailable={workspaceAvailable} debugMode={debugMode} onInspect={onInspect} onNavigate={onNavigate} onNavigateDeleted={onNavigateDeleted} onFollow={onFollow} />;
  }
  const isOperation = entry.kind === "operation";
  const id = isOperation ? entry.operationId : entry.traceId;
  return (
    <details className="dev-console__operation" open>
      <summary>
        <span>{isOperation ? "OPERATION" : "TRACE"}</span>
        <strong>{entry.events.find((event) => event.operation)?.operation ?? "Correlated events"}</strong>
        <code>{id}</code>
        <small>{entry.events.length} events</small>
      </summary>
      <div className="dev-console__operation-toolbar">
        <button type="button" onClick={() => onFollow({ kind: isOperation ? "operation" : "trace", id })}>
          Follow {isOperation ? "operation" : "trace"}
        </button>
      </div>
      <div className="dev-console__operation-events">
        {entry.events.map((event, index) => (
          <EventRow
            key={`${entry.key}-${event.timestamp}-${index}`}
            event={event}
            nodes={nodes}
            deletedNodeIds={deletedNodeIds}
            workspaceAvailable={workspaceAvailable}
            debugMode={debugMode}
            onInspect={onInspect}
            onNavigate={onNavigate}
            onNavigateDeleted={onNavigateDeleted}
            onFollow={onFollow}
          />
        ))}
      </div>
    </details>
  );
}

function Overview({
  events,
  nodes,
  deletedNodeIds,
  workspaceAvailable,
  onInspect,
  onNavigate,
  onNavigateDeleted,
}: {
  events: readonly DiagnosticEvent[];
  nodes: readonly NodeItem[];
  deletedNodeIds: readonly string[];
  workspaceAvailable: boolean;
  onInspect: (id: string) => void;
  onNavigate: (id: string) => void;
  onNavigateDeleted: (id: string) => void;
}) {
  const latestIntegrity = getLatestIntegritySummary(events);
  const touched = summarizeDiagnosticHistory(events);
  const activeNodeIds = new Set(nodes.map(({ id }) => id));
  const trashNodeIds = new Set(deletedNodeIds);
  const operationCount = new Set(events.flatMap((event) =>
    event.operationId ? [`operation:${event.operationId}`] : event.traceId ? [`trace:${event.traceId}`] : [],
  )).size;

  return (
    <div className="dev-console__overview">
      <section className="dev-console__overview-card">
        <h2>Integrity</h2>
        {latestIntegrity ? (
          <>
            <strong className={`dev-console__overview-status dev-console__overview-status--${latestIntegrity.summary.status.toLowerCase()}`}>
              {latestIntegrity.summary.status}
            </strong>
            <p>{formatIntegrityCounts(latestIntegrity.event)} · {formatTime(latestIntegrity.event.timestamp)}</p>
            {latestIntegrity.summary.findings.map((finding, index) => (
              <details className="dev-console__finding" key={`${finding.rule}-${finding.nodeId ?? "workspace"}-${index}`}>
                <summary><span>{finding.severity}</span><code>{finding.rule}</code></summary>
                <p>{finding.message}</p>
                <FindingEntities finding={finding} nodes={nodes} deletedNodeIds={deletedNodeIds} workspaceAvailable={workspaceAvailable} onInspect={onInspect} onNavigate={onNavigate} onNavigateDeleted={onNavigateDeleted} />
              </details>
            ))}
          </>
        ) : (
          <p>No Integrity check is present in the current diagnostic history.</p>
        )}
      </section>

      <section className="dev-console__overview-card">
        <h2>What was touched?</h2>
        <p className="dev-console__scope">Entities explicitly identified by retained diagnostic events only.</p>
        <div className="dev-console__metrics">
          <span><b>{touched.nodes.length}</b> node references</span>
          <span><b>{touched.resourceIds.length}</b> resource references</span>
          <span><b>{touched.relationFindings}</b> relation findings</span>
          <span><b>{touched.workspaceEvents}</b> workspace/editor events</span>
          <span><b>{touched.persistenceEvents}</b> persistence events</span>
          <span><b>{operationCount}</b> correlated operation/trace groups</span>
        </div>
        {touched.nodes.length > 0 ? (
          <div className="dev-console__entities">
            {touched.nodes.map((reference) => (
              <EntityActions
                key={`${reference.role}-${reference.id}`}
                reference={reference}
                state={activeNodeIds.has(reference.id) ? "active" : trashNodeIds.has(reference.id) ? "deleted" : "missing"}
                workspaceAvailable={workspaceAvailable}
                onInspect={onInspect}
                onNavigate={onNavigate}
                onNavigateDeleted={onNavigateDeleted}
              />
            ))}
          </div>
        ) : (
          <p>No node IDs were recorded in the retained events.</p>
        )}
        {touched.resourceIds.length > 0 && (
          <ul>{touched.resourceIds.map((id) => <li key={id}><code>{id}</code></li>)}</ul>
        )}
      </section>

      <section className="dev-console__overview-card">
        <h2>History coverage</h2>
        <p>Current diagnostic history: session memory, up to {MAX_DIAGNOSTIC_EVENTS} events.</p>
        <p>Session operation history: {operationCount} correlated operation/trace groups represented by retained events.</p>
        <p>Persistent diagnostic history: unavailable. This view does not reconstruct older operations.</p>
        <p>Uncorrelated events remain separate; no time-based correlation is inferred.</p>
      </section>
    </div>
  );
}

export default function DevelopmentConsole({
  nodes,
  deletedNodeIds,
  workspaceAvailable,
  onInspectNode,
  onNavigateNode,
  onNavigateDeletedNode,
  focusNodeId,
  openRequest,
  onClearNodeFocus,
  isOpen,
  onOpenChange,
}: DevelopmentConsoleProps) {
  const events = useSyncExternalStore(subscribeDiagnosticEvents, getDiagnosticEvents, getDiagnosticEvents);
  const paused = useSyncExternalStore(
    subscribeDiagnosticEvents,
    isDiagnosticTrackingPaused,
    isDiagnosticTrackingPaused,
  );
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isOpen !== undefined ? isOpen : internalOpen;
  const setOpen = (next: boolean | ((curr: boolean) => boolean)) => {
    const nextVal = typeof next === "function" ? next(open) : next;
    if (isOpen === undefined) {
      setInternalOpen(nextVal);
    }
    onOpenChange?.(nextVal);
  };
  const [mode, setMode] = useState<ConsoleMode>("human");
  const [view, setView] = useState<ConsoleView>("events");
  const [category, setCategory] = useState<PresentedCategory | "ALL">("ALL");
  const [level, setLevel] = useState<(typeof levels)[number] | "ALL">("ALL");
  const [traceFilter, setTraceFilter] = useState<TraceFilter>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  useEffect(() => {
    if (!focusNodeId) return;
    setOpen(true);
    setView("events");
    setTraceFilter(null);
  }, [focusNodeId, openRequest]);

  const visibleEvents = useMemo(() => {
    let filtered = filterDiagnosticEvents(events, {
      debugMode: mode === "debug",
      levels: level === "ALL" ? undefined : [level],
      categories: category === "ALL" ? undefined : [category],
    });
    if (focusNodeId) {
      filtered = filtered.filter((event) =>
        getDiagnosticEntityReferences(event).some(({ id }) => id === focusNodeId),
      );
    }
    if (traceFilter) {
      filtered = filtered.filter((event) => traceFilter.kind === "operation"
        ? event.operationId === traceFilter.id
        : !event.operationId && event.traceId === traceFilter.id);
    }
    return filtered;
  }, [events, mode, level, category, focusNodeId, traceFilter]);
  const entries = useMemo(() => groupDiagnosticEvents(visibleEvents), [visibleEvents]);

  const copyVisible = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(visibleEvents, null, 2));
      setCopyError(null);
    } catch (error) {
      setCopyError(`Could not copy diagnostics: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <aside className="dev-console dev-console--open" aria-label="H.I.S. Future development console">
      <section className="dev-console__panel">
          <header className="dev-console__header">
            <div>
              <strong>H.I.S. Future</strong>
              <span><i className="dev-console__running-dot" /> RUNNING</span>
              <small>Development • {isDesktopRuntime() ? "Tauri" : "Browser"}</small>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Minimize diagnostics">—</button>
          </header>
          <div className="dev-console__toolbar">
            <div className="dev-console__modes" role="group" aria-label="Console view">
              <button type="button" aria-pressed={view === "events"} onClick={() => setView("events")}>Events</button>
              <button type="button" aria-pressed={view === "overview"} onClick={() => setView("overview")}>Overview</button>
            </div>
            {view === "events" && (
              <>
                <div className="dev-console__modes" role="group" aria-label="Detail mode">
                  <button type="button" aria-pressed={mode === "human"} onClick={() => setMode("human")}>Human</button>
                  <button type="button" aria-pressed={mode === "debug"} onClick={() => setMode("debug")}>Debug</button>
                </div>
                <label>Category
                  <select value={category} onChange={(event) => setCategory(event.target.value as PresentedCategory | "ALL")}>
                    <option value="ALL">All</option>
                    {DIAGNOSTIC_CATEGORIES.map((value) => <option key={value} value={value}>{value}</option>)}
                    <option value="UNCLASSIFIED">Unclassified</option>
                  </select>
                </label>
                <label>Level
                  <select value={level} onChange={(event) => setLevel(event.target.value as (typeof levels)[number] | "ALL")}>
                    <option value="ALL">All</option>
                    {levels.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
              </>
            )}
            <button type="button" onClick={() => pauseDiagnosticTracking(!paused)} aria-pressed={paused}>
              {paused ? "Resume" : "Pause"}
            </button>
            <button type="button" onClick={() => { clearDiagnosticEvents(); setCopyError(null); setTraceFilter(null); }}>Clear</button>
            {view === "events" && (
              <>
                <button type="button" onClick={() => void copyVisible()}>Copy events</button>
              </>
            )}
            <span className="dev-console__event-count">{visibleEvents.length}/{events.length}</span>
          </div>
          {(focusNodeId || traceFilter) && (
            <div className="dev-console__active-filter">
              {focusNodeId && <span>Node filter: <code>{focusNodeId}</code></span>}
              {traceFilter && <span>{traceFilter.kind}: <code>{traceFilter.id}</code></span>}
              <button type="button" onClick={() => { setTraceFilter(null); onClearNodeFocus(); }}>Clear filters</button>
            </div>
          )}
          {copyError && <p className="dev-console__copy-error" role="alert">{copyError}</p>}
          <div className="dev-console__list" aria-live="polite">
            {view === "overview" ? (
              <Overview events={events} nodes={nodes} deletedNodeIds={deletedNodeIds} workspaceAvailable={workspaceAvailable} onInspect={onInspectNode} onNavigate={onNavigateNode} onNavigateDeleted={onNavigateDeletedNode} />
            ) : entries.length ? (
              entries.map((entry) => (
                <EventEntry
                  key={entry.key}
                  entry={entry}
                  debugMode={mode === "debug"}
                  nodes={nodes}
                  deletedNodeIds={deletedNodeIds}
                  workspaceAvailable={workspaceAvailable}
                  onInspect={onInspectNode}
                  onNavigate={onNavigateNode}
                  onNavigateDeleted={onNavigateDeletedNode}
                  onFollow={setTraceFilter}
                />
              ))
            ) : (
              <p className="dev-console__empty">{paused ? "Tracking paused." : "No events match the current filters."}</p>
            )}
          </div>
        </section>
    </aside>
  );
}
