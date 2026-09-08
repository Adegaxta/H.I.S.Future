import { useEffect, useRef, useState } from "react";
import type { NodeItem } from "../../types/nodes";
import { formatTempoTime, getTempoMeta, localIsoDate, setTempoMeta, type IsoWeekday, type TimeFormat } from "../../utils/temporalMeta";
import FutureBadge from "../../components/FutureBadge";
import NodeTypeLabel from "../../components/NodeTypeLabel";
import RichTextEditor from "../../components/RichTextEditor";
import { useLocale } from "../../i18n/LocaleContext";

interface TempoInspectorProps {
  tempo: NodeItem;
  nodes: NodeItem[];
  deletedNodes: NodeItem[];
  timeFormat: TimeFormat;
  variant?: "panel" | "standalone";
  onRename: (id: string, name: string) => void;
  onContentChange: (id: string, content: string) => void;
  setExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  onOpenDeletedNode: (id: string) => void;
  onOpenNodeView: (id: string, x: number, y: number) => void;
  onFileImport?: (file: File, parentId?: string | null) => Promise<NodeItem | null> | NodeItem | null;
  onSlashCommand?: (tag: string) => boolean;
}

const dateFromIso = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
};

const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();

const TEMPO_SUBTYPE_LABELS = {
  daily: "tempo.daily",
  weekly: "tempo.weekly",
  monthly: "tempo.monthly",
  annual: "tempo.annual",
} as const;
const WEEKDAYS: IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7];

export default function TempoInspector({
  tempo,
  nodes,
  deletedNodes,
  timeFormat,
  variant = "panel",
  onRename,
  onContentChange,
  setExpanded,
  onOpenDeletedNode,
  onOpenNodeView,
  onFileImport,
  onSlashCommand,
}: TempoInspectorProps) {
  const { locale, t } = useLocale();
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [title, setTitle] = useState(tempo.name);
  const [editorExpanded, setEditorExpanded] = useState(false);
  const meta = getTempoMeta(tempo.content);
  const parts = dateFromIso(meta.date);
  const formattedTime = formatTempoTime(meta, timeFormat);
  const localizedWeekdays = WEEKDAYS.map((day, index) => {
    const name = new Intl.DateTimeFormat(locale, { weekday: "long" }).format(new Date(2026, 7, 3 + index));
    return { day, label: name.charAt(0).toUpperCase(), name };
  });

  useEffect(() => setTitle(tempo.name), [tempo.id, tempo.name]);
  useEffect(() => {
    if (!editorExpanded) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setEditorExpanded(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [editorExpanded]);
  const updateMeta = (next: typeof meta) => onContentChange(tempo.id, setTempoMeta(tempo.content, next));
  const updateDate = (next: Partial<typeof parts>) => {
    const year = Math.max(1, next.year ?? parts.year);
    const month = Math.min(12, Math.max(1, next.month ?? parts.month));
    const day = Math.min(daysInMonth(year, month), Math.max(1, next.day ?? parts.day));
    const date = localIsoDate(new Date(year, month - 1, day));
    updateMeta({ ...meta, date, endDate: meta.endDate && meta.endDate < date ? date : meta.endDate });
  };
  const commitTitle = () => {
    if (title.trim()) onRename(tempo.id, title);
    else setTitle(tempo.name);
  };
  const updateEndDate = (value: string) => {
    if (!value) return updateMeta({ ...meta, endDate: null });
    updateMeta({ ...meta, endDate: value < meta.date ? meta.date : value });
  };
  const updateStartDate = (value: string) => {
    if (!value) return;
    updateMeta({ ...meta, date: value, endDate: meta.endDate && meta.endDate < value ? value : meta.endDate });
  };
  const toggleWeekday = (day: IsoWeekday) => {
    const current = meta.activeWeekdays ?? WEEKDAYS;
    const next = current.includes(day) ? current.filter((value) => value !== day) : [...current, day].sort((a, b) => a - b);
    updateMeta({ ...meta, activeWeekdays: next.length === WEEKDAYS.length ? null : next });
  };

  return (
    <section className={`tempo-inspector tempo-inspector--${variant}`}>
      <div className="tempo-inspector__properties">
        <NodeTypeLabel type="tempo" />
        <input className="tempo-inspector__title" value={title} onChange={(event) => setTitle(event.target.value)} onBlur={commitTitle} onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") setTitle(tempo.name);
        }} aria-label={t("tempo.title")} />
        <div className="tempo-inspector__subtype">
          <span>{t("tempo.unit")}</span>
          <div className="tempo-inspector__subtype-value">
            {t(TEMPO_SUBTYPE_LABELS[meta.subtype])}
            {(meta.subtype === "monthly" || meta.subtype === "annual") && <FutureBadge />}
          </div>
        </div>
        {formattedTime && <div className="tempo-inspector__summary">{formattedTime}</div>}
        {meta.subtype === "weekly" ? <div className="tempo-inspector__range-date-fields">
          <label>{t("tempo.start")}<input type="date" value={meta.date} onChange={(event) => updateStartDate(event.target.value)} /></label>
          <label>{t("tempo.end")}<input type="date" value={meta.endDate ?? ""} min={meta.date} onChange={(event) => updateEndDate(event.target.value)} /></label>
        </div> : <div className="tempo-inspector__date-fields">
          <label>{t("tempo.day")}<input type="number" min="1" max={daysInMonth(parts.year, parts.month)} value={parts.day} onChange={(event) => updateDate({ day: Number(event.target.value) })} /></label>
          <label>{t("tempo.month")}<select value={parts.month} onChange={(event) => updateDate({ month: Number(event.target.value) })}>
            {Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{new Date(2026, index, 1).toLocaleDateString(locale, { month: "short" })}</option>)}
          </select></label>
          <label>{t("tempo.year")}<input type="number" min="1" value={parts.year} onChange={(event) => updateDate({ year: Number(event.target.value) })} /></label>
        </div>}
        <div className="tempo-inspector__time-fields">
          <label>{t("tempo.startTime")}<input type="time" value={meta.startTime ?? ""} onChange={(event) => updateMeta({ ...meta, startTime: event.target.value || null })} /></label>
          <label>{t("tempo.endTime")}<input type="time" value={meta.endTime ?? ""} onChange={(event) => updateMeta({ ...meta, endTime: event.target.value || null })} /></label>
        </div>
        <div className="tempo-inspector__active-weekdays">
          <span>{t("tempo.weekdays")}</span>
          <div role="group" aria-label={t("tempo.weekdays")}>{localizedWeekdays.map(({ day, label, name }) => {
            const active = meta.activeWeekdays === null || meta.activeWeekdays.includes(day);
            return <button type="button" key={day} className={active ? "is-active" : ""} aria-pressed={active} aria-label={t("tempo.weekdayState", { name, state: t(active ? "tempo.active" : "tempo.inactive") })} title={name} onClick={() => toggleWeekday(day)}>{active ? label : "·"}</button>;
          })}</div>
        </div>
        <label className="tempo-inspector__color"><span>{t("tempo.color")}</span><span className="tempo-inspector__color-swatch" style={{ backgroundColor: meta.color }}><input type="color" value={meta.color} aria-label={t("tempo.color")} onChange={(event) => updateMeta({ ...meta, color: event.target.value })} /></span></label>
      </div>
      <div className={`tempo-inspector__content${editorExpanded ? " is-expanded" : ""}`} role={editorExpanded ? "dialog" : undefined} aria-modal={editorExpanded ? "true" : undefined} aria-label={editorExpanded ? t("tempo.expandedEditor") : undefined}>
        <div className="tempo-inspector__content-header">
          <div className="tempo-inspector__content-label">{t("tempo.content")}</div>
          <button type="button" className="tempo-inspector__expand" aria-label={editorExpanded ? t("nodal.close") : t("tempo.expand")} title={editorExpanded ? t("nodal.close") : t("tempo.expand")} onClick={() => setEditorExpanded((current) => !current)}>{editorExpanded ? "×" : "↗"}</button>
        </div>
        <div className="tempo-inspector__editor-scroll">
          <RichTextEditor
            node={tempo}
            nodes={nodes}
            deletedNodes={deletedNodes}
            editorRef={editorRef}
            onContentChange={onContentChange}
            setSelectedId={(id) => onOpenNodeView(id, 0, 0)}
            setExpanded={setExpanded}
            pendingNodeDrop={null}
            onNodeDropHandled={() => undefined}
            onOpenDeletedNode={onOpenDeletedNode}
            onOpenNodeView={onOpenNodeView}
            onFileImport={onFileImport}
            onSlashCommand={onSlashCommand}
            style={{
              display: "block",
              width: "100%",
              minHeight: 180,
              padding: 10,
              border: "none",
              background: "transparent",
              color: "#E8E9EA",
              fontSize: 13,
              fontFamily: "inherit",
              lineHeight: 1.6,
              outline: "none",
            }}
          />
        </div>
      </div>
      {editorExpanded && <button type="button" className="tempo-inspector__editor-backdrop" aria-label={t("tempo.closeExpandedEditor")} onClick={() => setEditorExpanded(false)} />}
    </section>
  );
}
