import { useEffect, useRef, useState } from "react";
import type { NodeItem } from "../types/nodes";
import { formatTempoTime, getTempoMeta, localIsoDate, setTempoMeta, type TimeFormat } from "../utils/temporalMeta";
import RichTextEditor from "./RichTextEditor";

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
  onImageFilePaste?: (file: File, parentId?: string | null) => Promise<string | null> | string | null;
  onSlashCommand?: (tag: string) => boolean;
}

const dateFromIso = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
};

const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();

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
  onImageFilePaste,
  onSlashCommand,
}: TempoInspectorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [title, setTitle] = useState(tempo.name);
  const meta = getTempoMeta(tempo.content);
  const parts = dateFromIso(meta.date);
  const formattedTime = formatTempoTime(meta, timeFormat);

  useEffect(() => setTitle(tempo.name), [tempo.id, tempo.name]);
  const updateMeta = (next: typeof meta) => onContentChange(tempo.id, setTempoMeta(tempo.content, next));
  const updateDate = (next: Partial<typeof parts>) => {
    const year = Math.max(1, next.year ?? parts.year);
    const month = Math.min(12, Math.max(1, next.month ?? parts.month));
    const day = Math.min(daysInMonth(year, month), Math.max(1, next.day ?? parts.day));
    updateMeta({ ...meta, date: localIsoDate(new Date(year, month - 1, day)) });
  };
  const commitTitle = () => {
    if (title.trim()) onRename(tempo.id, title);
    else setTitle(tempo.name);
  };

  return (
    <section className={`tempo-inspector tempo-inspector--${variant}`}>
      <div className="tempo-inspector__properties">
        <div className="tempo-inspector__eyebrow">NODO TEMPO</div>
        <input className="tempo-inspector__title" value={title} onChange={(event) => setTitle(event.target.value)} onBlur={commitTitle} onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") setTitle(tempo.name);
        }} aria-label="Título del Tempo" />
        {formattedTime && <div className="tempo-inspector__summary">{formattedTime}</div>}
        <div className="tempo-inspector__date-fields">
          <label>Día<input type="number" min="1" max={daysInMonth(parts.year, parts.month)} value={parts.day} onChange={(event) => updateDate({ day: Number(event.target.value) })} /></label>
          <label>Mes<select value={parts.month} onChange={(event) => updateDate({ month: Number(event.target.value) })}>
            {Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{new Date(2026, index, 1).toLocaleDateString("es-ES", { month: "short" })}</option>)}
          </select></label>
          <label>Año<input type="number" min="1" value={parts.year} onChange={(event) => updateDate({ year: Number(event.target.value) })} /></label>
        </div>
        <div className="tempo-inspector__time-fields">
          <label>Hora inicial<input type="time" value={meta.startTime ?? ""} onChange={(event) => updateMeta({ ...meta, startTime: event.target.value || null })} /></label>
          <label>Hora final<input type="time" value={meta.endTime ?? ""} onChange={(event) => updateMeta({ ...meta, endTime: event.target.value || null })} /></label>
        </div>
      </div>
      <div className="tempo-inspector__content">
        <div className="tempo-inspector__content-label">Descripción / contenido</div>
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
            onImageFilePaste={onImageFilePaste}
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
    </section>
  );
}
