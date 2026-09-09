import { useEffect, useRef, useState } from "react";
import { PALETTE } from "../../defs/palette";
import type { NodeItem } from "../../types/nodes";
import { localIsoDate, type TempoMeta } from "../../utils/temporalMeta";
import { useLocale } from "../../i18n/LocaleContext";
import { addDays, dateFromIso, dayIndex, isoWeekday } from "./dateMath";

interface WeeklyTempoEntry { node: NodeItem; meta: TempoMeta; }
interface WeeklyDragPreview { id: string; startIndex: number; endIndex: number; duration: number; }
type DragIntent = "pending" | "temporal" | "reorder";
interface DragSession { id: string; originX: number; originY: number; intent: DragIntent; source: "collection" | "surface"; }
interface WeeklyTempoViewProps {
  weekDates: Date[];
  tempos: WeeklyTempoEntry[];
  selectedTempoId: string | null;
  selectedTempoIds: string[];
  onSelectTempo: (id: string, additive: boolean) => void;
  onCreateTempo: (date: Date) => void;
  onMoveTempo: (id: string, meta: TempoMeta) => void;
  onReorderTempos: (orderedIds: string[]) => void;
  onContextMenu: (event: React.MouseEvent, id: string) => void;
  onBack: () => void;
}

const WEEK_DAYS = 7;
const DRAG_INTENT_THRESHOLD = 10;
const DAY_LABEL_WIDTH = 72;
const TEMPO_WIDTH = 58;
const stackedName = (name: string) => Array.from(name).map((character, index) => <i aria-hidden="true" key={`${character}-${index}`}>{character === " " ? "\u00a0" : character}</i>);

export default function WeeklyTempoView({ weekDates, tempos, selectedTempoId, selectedTempoIds, onSelectTempo, onCreateTempo, onMoveTempo, onReorderTempos, onContextMenu, onBack }: WeeklyTempoViewProps) {
  const { locale, t } = useLocale();
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const dragSessionRef = useRef<DragSession | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragIntent, setDragIntent] = useState<DragIntent | null>(null);
  const [dragPreview, setDragPreview] = useState<WeeklyDragPreview | null>(null);
  const [reorderPreviewIds, setReorderPreviewIds] = useState<string[] | null>(null);
  const [resize, setResize] = useState<{ id: string; edge: "start" | "end" } | null>(null);
  const weekStart = weekDates[0];
  const weekEnd = weekDates[6];
  const displayedTempos = reorderPreviewIds
    ? reorderPreviewIds.map((id) => tempos.find((entry) => entry.node.id === id)).filter((entry): entry is WeeklyTempoEntry => Boolean(entry))
    : tempos;
  const surfaceWidth = DAY_LABEL_WIDTH + displayedTempos.length * TEMPO_WIDTH;
  const surfaceColumns = `${DAY_LABEL_WIDTH}px ${displayedTempos.map(() => `${TEMPO_WIDTH}px`).join(" ")} minmax(0, 1fr)`;

  const dayIndexAtPointer = (clientY: number) => {
    const tracks = Array.from(surfaceRef.current?.querySelectorAll<HTMLElement>("[data-week-day-index]") ?? []);
    if (tracks.length === 0) return 0;
    const match = tracks.find((track) => {
      const rect = track.getBoundingClientRect();
      return clientY >= rect.top && clientY < rect.bottom;
    });
    if (match) return Number(match.dataset.weekDayIndex);
    return clientY < tracks[0].getBoundingClientRect().top ? 0 : WEEK_DAYS - 1;
  };
  const getRange = (entry: WeeklyTempoEntry) => {
    const start = dateFromIso(entry.meta.date);
    const storedEnd = entry.meta.endDate ? dateFromIso(entry.meta.endDate) : addDays(start, 6);
    return { start, end: storedEnd < start ? start : storedEnd };
  };
  const updateFromPointer = (event: PointerEvent) => {
    if (!resize || !surfaceRef.current) return;
    const entry = tempos.find((item) => item.node.id === resize.id);
    if (!entry) return;
    const index = dayIndexAtPointer(event.clientY);
    const target = weekDates[index];
    const { start, end } = getRange(entry);
    const nextStart = resize.edge === "start" ? (target <= end ? target : end) : start;
    const nextEnd = resize.edge === "end" ? (target >= start ? target : start) : end;
    onMoveTempo(entry.node.id, { ...entry.meta, date: localIsoDate(nextStart), endDate: localIsoDate(nextEnd) });
  };
  useEffect(() => {
    if (!resize) return undefined;
    const stop = () => setResize(null);
    window.addEventListener("pointermove", updateFromPointer);
    window.addEventListener("pointerup", stop, { once: true });
    return () => { window.removeEventListener("pointermove", updateFromPointer); window.removeEventListener("pointerup", stop); };
  }, [resize, tempos, weekDates]);

  const beginDrag = (event: React.DragEvent, id: string, source: DragSession["source"]) => {
    const intent = source === "collection" ? "temporal" : "pending";
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-his-weekly-tempo", id);
    dragSessionRef.current = { id, originX: event.clientX, originY: event.clientY, intent, source };
    setDraggingId(id);
    setDragIntent(intent);
  };
  const clearDrag = () => {
    dragSessionRef.current = null;
    setDraggingId(null);
    setDragIntent(null);
    setDragPreview(null);
    setReorderPreviewIds(null);
  };
  const resolveDragIntent = (event: React.DragEvent): DragIntent => {
    const session = dragSessionRef.current;
    if (!session || session.intent !== "pending") return session?.intent ?? "pending";
    const deltaX = event.clientX - session.originX;
    const deltaY = event.clientY - session.originY;
    if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < DRAG_INTENT_THRESHOLD) return "pending";
    session.intent = Math.abs(deltaX) > Math.abs(deltaY) ? "reorder" : "temporal";
    setDragIntent(session.intent);
    return session.intent;
  };
  const updateReorderPreview = (clientX: number, id: string) => {
    const remaining = displayedTempos.filter((entry) => entry.node.id !== id);
    let targetIndex = remaining.length;
    for (let index = 0; index < remaining.length; index += 1) {
      const element = surfaceRef.current?.querySelector<HTMLElement>(`[data-weekly-tempo-id="${remaining[index].node.id}"]`);
      if (element) {
        const rect = element.getBoundingClientRect();
        if (clientX < rect.left + rect.width / 2) {
          targetIndex = index;
          break;
        }
      }
    }
    const next = remaining.map((entry) => entry.node.id);
    next.splice(targetIndex, 0, id);
    setReorderPreviewIds((current) => current && current.length === next.length && current.every((value, index) => value === next[index]) ? current : next);
  };
  const updateDragPreview = (event: React.DragEvent) => {
    const session = dragSessionRef.current;
    if (!session) return;
    const entry = tempos.find((item) => item.node.id === session.id);
    if (!entry) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const intent = resolveDragIntent(event);
    if (intent === "pending") return;
    if (intent === "reorder") {
      setDragPreview(null);
      updateReorderPreview(event.clientX, entry.node.id);
      return;
    }
    setReorderPreviewIds(null);
    const { start, end } = getRange(entry);
    const duration = Math.max(1, dayIndex(end, start) + 1);
    const pointerIndex = dayIndexAtPointer(event.clientY);
    const latestStartInWeek = Math.max(0, WEEK_DAYS - duration);
    const startIndex = Math.min(pointerIndex, latestStartInWeek);
    const endIndex = Math.min(WEEK_DAYS - 1, startIndex + duration - 1);
    setDragPreview((current) => current?.id === entry.node.id && current.startIndex === startIndex && current.endIndex === endIndex
      ? current
      : { id: entry.node.id, startIndex, endIndex, duration });
  };
  const finishDrop = (event: React.DragEvent) => {
    event.preventDefault();
    if (dragSessionRef.current?.intent === "reorder" && reorderPreviewIds) {
      onReorderTempos(reorderPreviewIds);
      return clearDrag();
    }
    if (!dragPreview) return clearDrag();
    const entry = tempos.find((item) => item.node.id === dragPreview.id);
    if (!entry) return clearDrag();
    const nextStart = weekDates[dragPreview.startIndex];
    onMoveTempo(entry.node.id, {
      ...entry.meta,
      date: localIsoDate(nextStart),
      endDate: localIsoDate(addDays(nextStart, dragPreview.duration - 1)),
    });
    clearDrag();
  };

  return <section className="weekly-tempo-view" style={{ "--weekly-tempo-accent": PALETTE.pagina } as React.CSSProperties}>
    <header className="weekly-tempo-view__header">
      <div><button type="button" className="weekly-tempo-view__back" onClick={onBack} aria-label={t("calendar.weekly.backLabel")}>{t("calendar.weekly.back")}</button><h2>{t("calendar.weekly.title")}</h2></div>
      <button type="button" className="weekly-tempo-view__create" onClick={() => onCreateTempo(weekStart)} aria-label={t("calendar.weekly.create")} title={t("calendar.weekly.create")}>+</button>
    </header>
    <div className="weekly-tempo-view__list" aria-label={t("calendar.weekly.list")}>
      {displayedTempos.map((entry) => <button type="button" key={entry.node.id} className={`weekly-tempo-chip${selectedTempoIds.includes(entry.node.id) ? " is-selected" : ""}${selectedTempoId === entry.node.id ? " is-primary" : ""}`} draggable
        onDragStart={(event) => beginDrag(event, entry.node.id, "collection")} onDragEnd={clearDrag}
        onClick={(event) => onSelectTempo(entry.node.id, event.ctrlKey || event.metaKey)}
        onContextMenu={(event) => onContextMenu(event, entry.node.id)}>
        <i style={{ backgroundColor: entry.meta.color }} aria-hidden="true" />{entry.node.name}
      </button>)}
      {tempos.length === 0 && <span className="weekly-tempo-view__empty">{t("calendar.weekly.empty")}</span>}
    </div>
    <div className="weekly-tempo-surface-scroll" onWheel={(event) => {
      const viewport = event.currentTarget;
      if (viewport.scrollWidth <= viewport.clientWidth || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      event.preventDefault();
      viewport.scrollLeft += event.deltaY;
    }}>
      <div className="weekly-tempo-surface" ref={surfaceRef} onDragOver={updateDragPreview} onDrop={finishDrop} style={{ gridTemplateColumns: surfaceColumns, width: `max(100%, ${surfaceWidth}px)` }}>
        {weekDates.map((date, weekDayIndex) => <div className="weekly-tempo-day" key={localIsoDate(date)}>
          <span className="weekly-tempo-day__label" style={{ gridRow: weekDayIndex + 1 }}>{date.toLocaleDateString(locale, { weekday: "short" }).replace(".", "")} {date.getDate()}</span>
          <span className="weekly-tempo-day__track" data-week-day-index={weekDayIndex} style={{ gridRow: weekDayIndex + 1 }} aria-hidden="true" />
        </div>)}
        {dragIntent === "reorder" && draggingId && <div className="weekly-tempo-reorder-preview" aria-hidden="true" style={{ gridColumn: displayedTempos.findIndex((entry) => entry.node.id === draggingId) + 2, gridRow: "1 / -1" }} />}
        {displayedTempos.map((entry, tempoIndex) => {
          const { start, end } = getRange(entry);
          const hasExplicitRange = entry.meta.endDate !== null;
          const visibleStart = start < weekStart ? weekStart : start;
          const visibleEnd = end > weekEnd ? weekEnd : end;
          const rowStart = Math.max(0, Math.min(WEEK_DAYS - 1, dayIndex(visibleStart, weekStart)));
          const rowEnd = Math.max(rowStart, Math.min(WEEK_DAYS - 1, dayIndex(visibleEnd, weekStart)));
          const rowSpan = rowEnd - rowStart + 1;
          const segmentStates = Array.from({ length: rowSpan }, (_, index) => {
            const weekday = isoWeekday(weekDates[rowStart + index]);
            return entry.meta.activeWeekdays === null || entry.meta.activeWeekdays.includes(weekday);
          });
          return <div key={entry.node.id} data-weekly-tempo-id={entry.node.id} className={`weekly-tempo-bar${hasExplicitRange ? "" : " is-implicit"}${selectedTempoIds.includes(entry.node.id) ? " is-selected" : ""}${selectedTempoId === entry.node.id ? " is-primary" : ""}${draggingId === entry.node.id ? " is-dragging" : ""}`} draggable
            onDragStart={(event) => beginDrag(event, entry.node.id, "surface")} onDragEnd={clearDrag}
            onClick={(event) => onSelectTempo(entry.node.id, event.ctrlKey || event.metaKey)}
            onContextMenu={(event) => onContextMenu(event, entry.node.id)}
            style={{ gridColumn: tempoIndex + 2, gridRow: `${rowStart + 1} / span ${rowSpan}`, "--weekly-tempo-color": entry.meta.color } as React.CSSProperties}>
            {hasExplicitRange && <div className="weekly-tempo-bar__segments" aria-hidden="true">{segmentStates.map((active, index) => {
              const previousActive = index === 0 || segmentStates[index - 1];
              const nextActive = index === segmentStates.length - 1 || segmentStates[index + 1];
              return <i key={index} className={`${active ? "is-active" : "is-filtered"}${!active && previousActive ? " starts-filtered-run" : ""}${!active && nextActive ? " ends-filtered-run" : ""}`} />;
            })}</div>}
            <span className="weekly-tempo-bar__name" aria-label={entry.node.name}>{stackedName(entry.node.name)}</span>
            <button type="button" className="weekly-tempo-bar__handle weekly-tempo-bar__handle--start" aria-label={t("calendar.weekly.resizeStart")} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); setResize({ id: entry.node.id, edge: "start" }); }} />
            <button type="button" className="weekly-tempo-bar__handle weekly-tempo-bar__handle--end" aria-label={t("calendar.weekly.resizeEnd")} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); setResize({ id: entry.node.id, edge: "end" }); }} />
          </div>;
        })}
        {dragPreview && (() => {
          const entry = tempos.find((tempo) => tempo.node.id === dragPreview.id);
          if (!entry) return null;
          const tempoIndex = displayedTempos.findIndex((tempo) => tempo.node.id === entry.node.id);
          return <div className="weekly-tempo-drop-preview" aria-hidden="true" style={{
            gridColumn: tempoIndex + 2,
            gridRow: `${dragPreview.startIndex + 1} / span ${dragPreview.endIndex - dragPreview.startIndex + 1}`,
            borderColor: entry.meta.color,
            backgroundColor: `${entry.meta.color}24`,
          }} />;
        })()}
      </div>
    </div>
  </section>;
}
