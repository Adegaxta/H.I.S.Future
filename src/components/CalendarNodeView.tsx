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
import HisContextMenu from "./HisContextMenu";
import HisTip from "./HisTip";
import TempoInspector from "./TempoInspector";

interface CalendarNodeViewProps {
  node: NodeItem;
  nodes: NodeItem[];
  deletedNodes: NodeItem[];
  timeFormat: TimeFormat;
  onContentChange: (id: string, content: string) => void;
  onCreateTempo: (date: string, startTime?: string) => string;
  onMoveTempo: (id: string, meta: TempoMeta) => void;
  onRenameTempo: (id: string, name: string) => void;
  onDeleteTempo: (id: string) => void;
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

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const HOUR_HEIGHT = 48;
const WEEK_TIP_KEY = "hisfuture.tip.week-tempo-opens-day";

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
  const start = startOfWeek(new Date(date.getFullYear(), date.getMonth(), 1));
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
const hourTime = (hour: number) => `${String(hour).padStart(2, "0")}:00`;
const hourLabel = (hour: number, format: TimeFormat) => formatTime(hourTime(hour), format).replace(":00", "");
const calendarHeading = (date: Date) => {
  const value = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(date);
  return value.charAt(0).toUpperCase() + value.slice(1);
};
const adjacentMonthLabel = (date: Date) => {
  const month = date.toLocaleDateString("es-ES", { month: "short" }).replace(".", "");
  return `${month.charAt(0).toUpperCase()}${month.slice(1)} ${date.getDate()}`;
};

function TempoSummary({ tempo, timeFormat, compact = false, onOpen, onContextMenu }: {
  tempo: TempoEntry;
  timeFormat: TimeFormat;
  compact?: boolean;
  onOpen: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
}) {
  const time = formatTempoTime(tempo.meta, timeFormat);
  return (
    <button type="button" className={`calendar-tempo${compact ? " calendar-tempo--compact" : ""}`}
      onClick={(event) => { event.stopPropagation(); onOpen(); }} onContextMenu={onContextMenu}
      aria-label={`${tempo.node.name}${time ? ` - ${time}` : ""}`}>
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
  node, nodes, deletedNodes, timeFormat, onContentChange, onCreateTempo,
  onMoveTempo, onRenameTempo, onDeleteTempo, setExpanded, onOpenDeletedNode,
  onOpenNodeView, onImageFilePaste, onSlashCommand,
}: CalendarNodeViewProps) {
  const meta = getCalendarMeta(node.content);
  const currentDate = dateFromIso(meta.currentDate);
  const [query, setQuery] = useState("");
  const [selectedTempoId, setSelectedTempoId] = useState<string | null>(null);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [weekTipVisible, setWeekTipVisible] = useState(false);
  const [tempoMenu, setTempoMenu] = useState<{ x: number; y: number; tempoId: string } | null>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase("es");
  const allTempos: TempoEntry[] = nodes
    .filter((item) => item.type === "tempo" && item.parentId === node.id)
    .map((item) => ({ node: item, meta: getTempoMeta(item.content), description: getTempoDescription(item.content) }));
  const tempos = normalizedQuery
    ? allTempos.filter((tempo) => `${tempo.node.name} ${tempo.description}`.toLocaleLowerCase("es").includes(normalizedQuery))
    : allTempos;
  const selectedTempo = selectedTempoId ? nodes.find((item) => item.id === selectedTempoId && item.type === "tempo") : null;

  const updateMeta = (next: typeof meta) => onContentChange(node.id, setCalendarMeta(node.content, next));
  const selectView = (view: CalendarView, date = currentDate) => updateMeta({ view, currentDate: localIsoDate(date) });
  const openDay = (date: Date, tempoId: string | null = null) => {
    setSelectedTempoId(tempoId);
    setSelectedHour(null);
    selectView("day", date);
  };
  const openTempo = (tempo: TempoEntry) => openDay(dateFromIso(tempo.meta.date), tempo.node.id);
  const showTempoMenu = (event: React.MouseEvent, tempoId: string) => {
    event.preventDefault();
    event.stopPropagation();
    setTempoMenu({ x: event.clientX, y: event.clientY, tempoId });
  };
  const removeTempo = (id: string) => {
    if (selectedTempoId === id) setSelectedTempoId(null);
    onDeleteTempo(id);
  };
  const move = (direction: -1 | 1) => {
    const next = new Date(currentDate);
    if (meta.view === "month") next.setMonth(next.getMonth() + direction);
    else next.setDate(next.getDate() + direction * (meta.view === "week" ? 7 : 1));
    updateMeta({ ...meta, currentDate: localIsoDate(next) });
  };
  const moveTimedTempo = (tempo: TempoEntry, date: string, hour: number) => {
    const nextStart = hourTime(hour);
    let nextEnd: string | null = null;
    if (tempo.meta.startTime && tempo.meta.endTime) {
      const duration = Math.max(1, minutesFromTime(tempo.meta.endTime) - minutesFromTime(tempo.meta.startTime));
      nextEnd = timeFromMinutes(hour * 60 + duration);
    }
    onMoveTempo(tempo.node.id, { ...tempo.meta, date, startTime: nextStart, endTime: nextEnd });
  };
  const createFromWeek = (date: Date, startTime?: string) => {
    const id = onCreateTempo(localIsoDate(date), startTime);
    setSelectedTempoId(id);
    setSelectedHour(null);
    setWeekTipVisible(true);
    selectView("day", date);
  };
  const createInDay = (hour: number) => {
    const id = onCreateTempo(localIsoDate(currentDate), hourTime(hour));
    setSelectedTempoId(id);
    setSelectedHour(null);
  };

  const renderMonth = () => (
    <>
      <div className="calendar-node__weekdays" aria-hidden="true">{["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="calendar-node__grid calendar-node__grid--month">
        {visibleMonthDates(currentDate).map((date) => {
          const isoDate = localIsoDate(date);
          const dayTempos = tempos.filter((tempo) => tempo.meta.date === isoDate);
          const outsideMonth = date.getMonth() !== currentDate.getMonth();
          const isFirstNextMonth = outsideMonth && date.getDate() === 1 && monthIndex(date) > monthIndex(currentDate);
          return (
            <article key={isoDate} className={`calendar-node__day${outsideMonth ? " is-outside" : ""}${isoDate === localIsoDate() ? " is-today" : ""}`}
              onClick={() => isFirstNextMonth ? selectView("month", date) : openDay(date)}>
              <div className="calendar-node__day-label"><span>{isFirstNextMonth ? adjacentMonthLabel(date) : date.getDate()}</span></div>
              <div className="calendar-node__tempos">{dayTempos.map((tempo) => <TempoSummary key={tempo.node.id} tempo={tempo} timeFormat={timeFormat} compact
                onOpen={() => openTempo(tempo)} onContextMenu={(event) => showTempoMenu(event, tempo.node.id)} />)}</div>
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
        <div className="calendar-week__headers"><span />{weekDates.map((date) => (
          <button type="button" key={localIsoDate(date)} className={localIsoDate(date) === localIsoDate() ? "is-today" : ""} onClick={() => openDay(date)}>
            <strong>{date.getDate()}</strong><small>{date.toLocaleDateString("es-ES", { weekday: "short" })}</small>
          </button>
        ))}</div>
        <div className="calendar-week__all-day"><span>Todo el día</span>{weekDates.map((date) => {
          const isoDate = localIsoDate(date);
          return <div key={isoDate}>{tempos.filter((tempo) => tempo.meta.date === isoDate && !tempo.meta.startTime && !tempo.meta.endTime)
            .map((tempo) => <TempoSummary key={tempo.node.id} tempo={tempo} timeFormat={timeFormat} compact onOpen={() => openTempo(tempo)} onContextMenu={(event) => showTempoMenu(event, tempo.node.id)} />)}
            <button type="button" className="calendar-week__all-day-add" onClick={() => createFromWeek(date)}>+</button></div>;
        })}</div>
        <div className="calendar-week__timeline">
          <div className="calendar-week__hours">{HOURS.map((hour) => <span key={hour}>{hourLabel(hour, timeFormat)}</span>)}</div>
          {weekDates.map((date) => {
            const isoDate = localIsoDate(date);
            const timed = tempos.filter((tempo) => tempo.meta.date === isoDate && tempo.meta.startTime);
            return <div className="calendar-week__column" key={isoDate}>
              {HOURS.map((hour) => <div className="calendar-week__slot" key={hour} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
                event.preventDefault();
                const dragged = allTempos.find((tempo) => tempo.node.id === event.dataTransfer.getData("application/x-his-tempo"));
                if (dragged) moveTimedTempo(dragged, isoDate, hour);
              }}><button type="button" onClick={() => createFromWeek(date, hourTime(hour))}>+</button></div>)}
              {timed.map((tempo) => {
                const start = minutesFromTime(tempo.meta.startTime!);
                const end = tempo.meta.endTime ? minutesFromTime(tempo.meta.endTime) : start + 60;
                return <div key={tempo.node.id} className="calendar-week__tempo" draggable
                  onDragStart={(event) => event.dataTransfer.setData("application/x-his-tempo", tempo.node.id)}
                  onClick={() => openTempo(tempo)} onContextMenu={(event) => showTempoMenu(event, tempo.node.id)}
                  style={{ top: start / 60 * HOUR_HEIGHT, height: Math.max(24, (end - start) / 60 * HOUR_HEIGHT) }}>
                  <strong>{tempo.node.name}</strong><time>{formatTempoTime(tempo.meta, timeFormat)}</time>{tempo.description && <small>{tempo.description}</small>}
                </div>;
              })}
            </div>;
          })}
        </div>
      </div>
    );
  };

  const renderDay = () => {
    const isoDate = localIsoDate(currentDate);
    const dayTempos = tempos.filter((tempo) => tempo.meta.date === isoDate);
    const timed = dayTempos.filter((tempo) => tempo.meta.startTime);
    const allDay = dayTempos.filter((tempo) => !tempo.meta.startTime && !tempo.meta.endTime);
    return (
      <div className="calendar-day-layout">
        <div className="calendar-day-timeline">
          {allDay.length > 0 && <div className="calendar-day-timeline__all-day"><span>Todo el día</span>{allDay.map((tempo) => <TempoSummary key={tempo.node.id} tempo={tempo} timeFormat={timeFormat} compact onOpen={() => setSelectedTempoId(tempo.node.id)} onContextMenu={(event) => showTempoMenu(event, tempo.node.id)} />)}</div>}
          <div className="calendar-day-timeline__scroll">
            <div className="calendar-day-timeline__hours">{HOURS.map((hour) => <span key={hour}>{hourLabel(hour, timeFormat)}</span>)}</div>
            <div className="calendar-day-timeline__column">
              {HOURS.map((hour) => <button type="button" key={hour} className={`calendar-day-timeline__slot${selectedHour === hour ? " is-selected" : ""}`}
                onClick={() => { setSelectedHour(hour); setSelectedTempoId(null); }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
                  event.preventDefault();
                  const dragged = allTempos.find((tempo) => tempo.node.id === event.dataTransfer.getData("application/x-his-tempo"));
                  if (dragged) moveTimedTempo(dragged, isoDate, hour);
                }}><span>+</span></button>)}
              {timed.map((tempo) => {
                const start = minutesFromTime(tempo.meta.startTime!);
                const end = tempo.meta.endTime ? minutesFromTime(tempo.meta.endTime) : start + 60;
                return <div key={tempo.node.id} className={`calendar-day-timeline__tempo${selectedTempoId === tempo.node.id ? " is-selected" : ""}`} draggable
                  onDragStart={(event) => event.dataTransfer.setData("application/x-his-tempo", tempo.node.id)}
                  onClick={() => { setSelectedTempoId(tempo.node.id); setSelectedHour(null); }} onContextMenu={(event) => showTempoMenu(event, tempo.node.id)}
                  style={{ top: start / 60 * HOUR_HEIGHT, height: Math.max(28, (end - start) / 60 * HOUR_HEIGHT) }}>
                  <strong>{tempo.node.name}</strong><time>{formatTempoTime(tempo.meta, timeFormat)}</time>
                </div>;
              })}
            </div>
          </div>
        </div>
        <aside className="calendar-day-inspector">
          {selectedTempo ? <TempoInspector tempo={selectedTempo} nodes={nodes} deletedNodes={deletedNodes} timeFormat={timeFormat}
            onRename={onRenameTempo} onContentChange={onContentChange} setExpanded={setExpanded}
            onOpenDeletedNode={onOpenDeletedNode} onOpenNodeView={onOpenNodeView}
            onImageFilePaste={onImageFilePaste} onSlashCommand={onSlashCommand} />
            : selectedHour !== null ? <div className="calendar-day-inspector__create"><span>{hourLabel(selectedHour, timeFormat)}</span><button type="button" onClick={() => createInDay(selectedHour)}>+</button><p>Crear un Nodo Tempo en esta hora.</p></div>
              : <div className="calendar-day-inspector__empty">Selecciona una hora o un Tempo para comenzar.</div>}
        </aside>
      </div>
    );
  };

  return (
    <section className={`calendar-node calendar-node--${meta.view}`}>
      <header className="calendar-node__header">
        <div className="calendar-node__navigation"><button type="button" onClick={() => move(-1)}>‹</button><button type="button" onClick={() => updateMeta({ ...meta, currentDate: localIsoDate() })}>Hoy</button><button type="button" onClick={() => move(1)}>›</button></div>
        <div className="calendar-node__identity"><h1>{calendarHeading(currentDate)}</h1><p>{node.name}</p></div>
        <label className="calendar-node__search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar" /></label>
        <div className="calendar-node__views"><button type="button" disabled>Año</button>{(["month", "week", "day"] as const).map((view) => <button type="button" key={view} className={meta.view === view ? "is-active" : ""} onClick={() => selectView(view)}>{view === "month" ? "Mes" : view === "week" ? "Semana" : "Día"}</button>)}</div>
      </header>
      {weekTipVisible && <HisTip storageKey={WEEK_TIP_KEY} className="his-tip--week-flow">Al crear un Tempo desde Semana, HIS abre su Vista Día para configurarlo. Este comportamiento podrá personalizarse más adelante.</HisTip>}
      {meta.view === "month" ? renderMonth() : meta.view === "week" ? renderWeek() : renderDay()}
      {tempoMenu && <HisContextMenu x={tempoMenu.x} y={tempoMenu.y} onClose={() => setTempoMenu(null)} items={[{
        id: "delete-tempo", label: "Eliminar Nodo Tempo", danger: true, onSelect: () => removeTempo(tempoMenu.tempoId),
      }]} />}
    </section>
  );
}
