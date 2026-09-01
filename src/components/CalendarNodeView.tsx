import { useState } from "react";
import type { NodeItem } from "../types/nodes";
import {
  formatTempoTime,
  formatTime,
  getCalendarMeta,
  getTempoDescription,
  getTempoMeta,
  localIsoDate,
  setCalendarMeta,
  type CalendarView,
  type TempoMeta,
  type TimeFormat,
} from "../utils/temporalMeta";
import HisTip from "./HisTip";
import TempoQuickEditor from "./TempoQuickEditor";

interface CalendarNodeViewProps {
  node: NodeItem;
  nodes: NodeItem[];
  deletedNodes: NodeItem[];
  timeFormat: TimeFormat;
  onContentChange: (id: string, content: string) => void;
  onOpenTempo: (id: string) => void;
  onCreateTempo: (date: string, startTime?: string) => string;
  onMoveTempo: (id: string, meta: TempoMeta) => void;
  onRenameTempo: (id: string, name: string) => void;
  setExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  onOpenDeletedNode: (id: string) => void;
  onOpenNodeView: (id: string, x: number, y: number) => void;
  onImageFilePaste?: (file: File, parentId?: string | null) => Promise<string | null> | string | null;
  onSlashCommand?: (tag: string) => boolean;
}

interface TempoEntry {
  node: NodeItem;
  meta: TempoMeta;
  description: string;
}

const WEEK_HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const WEEK_HOUR_HEIGHT = 48;
const dateFromIso = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
};
const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};
const startOfWeek = (date: Date) => addDays(date, -((date.getDay() + 6) % 7));
const visibleMonthDates = (date: Date) => {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
};
const monthIndex = (date: Date) => date.getFullYear() * 12 + date.getMonth();
const minutesFromTime = (value: string) => {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
};
const timeFromMinutes = (value: number) => {
  const safe = Math.max(0, Math.min(1439, value));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
};
const calendarHeading = (date: Date) => {
  const value = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(date);
  return value.charAt(0).toUpperCase() + value.slice(1);
};
const adjacentMonthLabel = (date: Date) => {
  const month = date.toLocaleDateString("es-ES", { month: "short" }).replace(".", "");
  return `${month.charAt(0).toUpperCase()}${month.slice(1)} ${date.getDate()}`;
};

function TempoSummary({ tempo, timeFormat, compact = false, onOpen }: {
  tempo: TempoEntry;
  timeFormat: TimeFormat;
  compact?: boolean;
  onOpen: () => void;
}) {
  const time = formatTempoTime(tempo.meta, timeFormat);
  return (
    <button
      type="button"
      className={`calendar-tempo${compact ? " calendar-tempo--compact" : ""}`}
      onClick={(event) => { event.stopPropagation(); onOpen(); }}
      aria-label={`${tempo.node.name}${time ? ` - ${time}` : ""}`}
    >
      <div className="calendar-tempo__title">
        {!time && <i className="calendar-node__tempo-dot" aria-hidden="true" />}
        <span>{tempo.node.name}</span>
        {compact && time && <><b> - </b><time>{time}</time></>}
      </div>
      {!compact && time && <time>{time}</time>}
      {tempo.description && <small>{tempo.description}</small>}
    </button>
  );
}

export default function CalendarNodeView({
  node, nodes, deletedNodes, timeFormat, onContentChange, onOpenTempo,
  onCreateTempo, onMoveTempo, onRenameTempo, setExpanded,
  onOpenDeletedNode, onOpenNodeView, onImageFilePaste, onSlashCommand,
}: CalendarNodeViewProps) {
  const meta = getCalendarMeta(node.content);
  const currentDate = dateFromIso(meta.currentDate);
  const [query, setQuery] = useState("");
  const [quickTempoId, setQuickTempoId] = useState<string | null>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase("es");
  const allTempos: TempoEntry[] = nodes
    .filter((item) => item.type === "tempo" && item.parentId === node.id)
    .map((item) => ({ node: item, meta: getTempoMeta(item.content), description: getTempoDescription(item.content) }));
  const tempos = normalizedQuery
    ? allTempos.filter((tempo) => `${tempo.node.name} ${tempo.description}`.toLocaleLowerCase("es").includes(normalizedQuery))
    : allTempos;
  const quickTempo = quickTempoId ? nodes.find((item) => item.id === quickTempoId && item.type === "tempo") : null;
  const updateMeta = (next: typeof meta) => onContentChange(node.id, setCalendarMeta(node.content, next));
  const selectView = (view: CalendarView, date = currentDate) => updateMeta({ view, currentDate: localIsoDate(date) });
  const move = (direction: -1 | 1) => {
    const next = new Date(currentDate);
    if (meta.view === "month") next.setMonth(next.getMonth() + direction);
    else next.setDate(next.getDate() + direction * (meta.view === "week" ? 7 : 1));
    updateMeta({ ...meta, currentDate: localIsoDate(next) });
  };
  const moveTimedTempo = (tempo: TempoEntry, date: string, hour: number) => {
    const nextStart = timeFromMinutes(hour * 60);
    let nextEnd: string | null = null;
    if (tempo.meta.startTime && tempo.meta.endTime) {
      const duration = Math.max(1, minutesFromTime(tempo.meta.endTime) - minutesFromTime(tempo.meta.startTime));
      nextEnd = timeFromMinutes(hour * 60 + duration);
    }
    onMoveTempo(tempo.node.id, { ...tempo.meta, date, startTime: nextStart, endTime: nextEnd });
  };
  const createAndEdit = (date: string, startTime?: string) => {
    setQuickTempoId(onCreateTempo(date, startTime));
  };

  const renderMonth = () => (
    <>
      <div className="calendar-node__weekdays" aria-hidden="true">
        {(["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const).map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="calendar-node__grid calendar-node__grid--month">
        {visibleMonthDates(currentDate).map((date) => {
          const isoDate = localIsoDate(date);
          const dayTempos = tempos.filter((tempo) => tempo.meta.date === isoDate);
          const outsideMonth = date.getMonth() !== currentDate.getMonth();
          const isFirstNextMonth = outsideMonth && date.getDate() === 1 && monthIndex(date) > monthIndex(currentDate);
          return (
            <article
              key={isoDate}
              className={`calendar-node__day${outsideMonth ? " is-outside" : ""}${isoDate === localIsoDate() ? " is-today" : ""}`}
              onClick={() => isFirstNextMonth ? selectView("month", date) : selectView("day", date)}
            >
              <div className="calendar-node__day-label">
                <span>{isFirstNextMonth ? adjacentMonthLabel(date) : date.getDate()}</span>
                <button type="button" onClick={(event) => { event.stopPropagation(); createAndEdit(isoDate); }} aria-label={`Crear Tempo el ${isoDate}`}>+</button>
              </div>
              <div className="calendar-node__tempos">
                {dayTempos.map((tempo) => <TempoSummary key={tempo.node.id} tempo={tempo} timeFormat={timeFormat} compact onOpen={() => setQuickTempoId(tempo.node.id)} />)}
              </div>
            </article>
          );
        })}
      </div>
      <HisTip>Más adelante podrás cambiar cómo navegan los días adyacentes.</HisTip>
    </>
  );

  const renderWeek = () => {
    const weekDates = Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(currentDate), index));
    return (
      <div className="calendar-week">
        <div className="calendar-week__headers">
          <span />
          {weekDates.map((date) => <strong key={localIsoDate(date)}>{date.toLocaleDateString("es-ES", { weekday: "short", day: "numeric" })}</strong>)}
        </div>
        <div className="calendar-week__all-day">
          <span>Todo el día</span>
          {weekDates.map((date) => {
            const isoDate = localIsoDate(date);
            return (
              <div key={isoDate}>
                {tempos.filter((tempo) => tempo.meta.date === isoDate && !tempo.meta.startTime && !tempo.meta.endTime)
                  .map((tempo) => <TempoSummary key={tempo.node.id} tempo={tempo} timeFormat={timeFormat} compact onOpen={() => setQuickTempoId(tempo.node.id)} />)}
                <button type="button" className="calendar-week__all-day-add" onClick={() => createAndEdit(isoDate)}>+</button>
              </div>
            );
          })}
        </div>
        <div className="calendar-week__timeline">
          <div className="calendar-week__hours">
            {WEEK_HOURS.map((hour) => <span key={hour}>{formatTime(`${String(hour).padStart(2, "0")}:00`, timeFormat).replace(":00", "")}</span>)}
          </div>
          {weekDates.map((date) => {
            const isoDate = localIsoDate(date);
            const timed = tempos.filter((tempo) => tempo.meta.date === isoDate && tempo.meta.startTime);
            return (
              <div className="calendar-week__column" key={isoDate}>
                {WEEK_HOURS.map((hour) => (
                  <div className="calendar-week__slot" key={hour} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
                    event.preventDefault();
                    const dragged = allTempos.find((tempo) => tempo.node.id === event.dataTransfer.getData("application/x-his-tempo"));
                    if (dragged) moveTimedTempo(dragged, isoDate, hour);
                  }}>
                    <button type="button" onClick={() => createAndEdit(isoDate, `${String(hour).padStart(2, "0")}:00`)}>+</button>
                  </div>
                ))}
                {timed.map((tempo) => {
                  const start = minutesFromTime(tempo.meta.startTime!);
                  const end = tempo.meta.endTime ? minutesFromTime(tempo.meta.endTime) : start + 60;
                  return (
                    <div key={tempo.node.id} className="calendar-week__tempo" draggable
                      onDragStart={(event) => event.dataTransfer.setData("application/x-his-tempo", tempo.node.id)}
                      onClick={() => setQuickTempoId(tempo.node.id)}
                      style={{ top: start / 60 * WEEK_HOUR_HEIGHT, height: Math.max(24, (end - start) / 60 * WEEK_HOUR_HEIGHT) }}>
                      <strong>{tempo.node.name}</strong>
                      <time>{formatTempoTime(tempo.meta, timeFormat)}</time>
                      {tempo.description && <small>{tempo.description}</small>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderDay = () => {
    const isoDate = localIsoDate(currentDate);
    const dayTempos = tempos.filter((tempo) => tempo.meta.date === isoDate);
    return (
      <div className="calendar-day-view">
        <button type="button" className="calendar-day-view__add" onClick={() => createAndEdit(isoDate)}>+ Crear Tempo</button>
        {dayTempos.length ? dayTempos.map((tempo) => <TempoSummary key={tempo.node.id} tempo={tempo} timeFormat={timeFormat} onOpen={() => setQuickTempoId(tempo.node.id)} />) : <p>Sin Tempos para este día.</p>}
      </div>
    );
  };

  return (
    <section className={`calendar-node calendar-node--${meta.view}`}>
      <header className="calendar-node__header">
        <div className="calendar-node__navigation">
          <button type="button" onClick={() => move(-1)} aria-label="Periodo anterior">‹</button>
          <button type="button" onClick={() => updateMeta({ ...meta, currentDate: localIsoDate() })}>Hoy</button>
          <button type="button" onClick={() => move(1)} aria-label="Periodo siguiente">›</button>
        </div>
        <div className="calendar-node__identity"><h1>{calendarHeading(currentDate)}</h1><p>{node.name}</p></div>
        <label className="calendar-node__search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar" aria-label="Buscar Tempos" /></label>
        <div className="calendar-node__views" aria-label="Escala del calendario">
          <button type="button" disabled title="Vista Año preparada para una futura iteración">Año</button>
          {(["month", "week", "day"] as const).map((view) => (
            <button type="button" key={view} className={meta.view === view ? "is-active" : ""} onClick={() => selectView(view)}>{view === "month" ? "Mes" : view === "week" ? "Semana" : "Día"}</button>
          ))}
        </div>
      </header>
      {meta.view === "month" ? renderMonth() : meta.view === "week" ? renderWeek() : renderDay()}
      {quickTempo && <TempoQuickEditor
        tempo={quickTempo} nodes={nodes} deletedNodes={deletedNodes} timeFormat={timeFormat}
        onClose={() => setQuickTempoId(null)} onOpenFull={(id) => { setQuickTempoId(null); onOpenTempo(id); }}
        onRename={onRenameTempo} onContentChange={onContentChange} setExpanded={setExpanded}
        onOpenDeletedNode={onOpenDeletedNode} onOpenNodeView={onOpenNodeView}
        onImageFilePaste={onImageFilePaste} onSlashCommand={onSlashCommand}
      />}
    </section>
  );
}
