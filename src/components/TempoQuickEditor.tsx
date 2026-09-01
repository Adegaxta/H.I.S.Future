import { useEffect, useRef, useState } from "react";
import type { NodeItem } from "../types/nodes";
import {
  formatTempoTime,
  getTempoMeta,
  setTempoMeta,
  type TimeFormat,
} from "../utils/temporalMeta";
import RichTextEditor from "./RichTextEditor";

interface TempoQuickEditorProps {
  tempo: NodeItem;
  nodes: NodeItem[];
  deletedNodes: NodeItem[];
  timeFormat: TimeFormat;
  onClose: () => void;
  onOpenFull: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onContentChange: (id: string, content: string) => void;
  setExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  onOpenDeletedNode: (id: string) => void;
  onOpenNodeView: (id: string, x: number, y: number) => void;
  onImageFilePaste?: (file: File, parentId?: string | null) => Promise<string | null> | string | null;
  onSlashCommand?: (tag: string) => boolean;
}

export default function TempoQuickEditor({
  tempo,
  nodes,
  deletedNodes,
  timeFormat,
  onClose,
  onOpenFull,
  onRename,
  onContentChange,
  setExpanded,
  onOpenDeletedNode,
  onOpenNodeView,
  onImageFilePaste,
  onSlashCommand,
}: TempoQuickEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [title, setTitle] = useState(tempo.name);
  const [nodePickerOpen, setNodePickerOpen] = useState(false);
  const [pendingNodeDrop, setPendingNodeDrop] = useState<{ nodeId: string; x: number; y: number } | null>(null);
  const meta = getTempoMeta(tempo.content);
  const formattedTime = formatTempoTime(meta, timeFormat);
  const updateMeta = (next: typeof meta) => onContentChange(tempo.id, setTempoMeta(tempo.content, next));
  useEffect(() => setTitle(tempo.name), [tempo.id, tempo.name]);
  const commitTitle = () => {
    if (title.trim()) onRename(tempo.id, title);
    else setTitle(tempo.name);
  };
  const insertNode = (nodeId: string) => {
    const rect = editorRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPendingNodeDrop({ nodeId, x: rect.left + 12, y: Math.max(rect.top + 12, rect.bottom - 12) });
    setNodePickerOpen(false);
  };

  return (
    <div className="tempo-quick" role="dialog" aria-modal="true" aria-label={`Editar ${tempo.name}`} onPointerDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="tempo-quick__panel">
        <header className="tempo-quick__header">
          <div>
            <input
              className="tempo-quick__title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={commitTitle}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") setTitle(tempo.name);
              }}
              aria-label="Título del Tempo"
            />
            {formattedTime && <div className="tempo-quick__time">{formattedTime}</div>}
          </div>
          <div className="tempo-quick__actions">
            <button type="button" onClick={() => onOpenFull(tempo.id)}>Abrir nodo</button>
            <button type="button" onClick={onClose} aria-label="Cerrar">×</button>
          </div>
        </header>
        <div className="tempo-quick__fields">
          <label>Fecha<input required type="date" value={meta.date} onChange={(event) => event.target.value && updateMeta({ ...meta, date: event.target.value })} /></label>
          <label>Inicio<input type="time" value={meta.startTime ?? ""} onChange={(event) => updateMeta({ ...meta, startTime: event.target.value || null })} /></label>
          <label>Final<input type="time" value={meta.endTime ?? ""} onChange={(event) => updateMeta({ ...meta, endTime: event.target.value || null })} /></label>
        </div>
        <div className="tempo-quick__content-heading">
          <span>Descripción y nodos insertados</span>
          <div className="tempo-quick__insert">
            <button type="button" onClick={() => setNodePickerOpen((open) => !open)} aria-label="Insertar nodo">+</button>
            {nodePickerOpen && (
              <div className="tempo-quick__node-picker">
                {nodes.filter((node) => node.id !== tempo.id).map((node) => (
                  <button type="button" key={node.id} onClick={() => insertNode(node.id)}>{node.name}</button>
                ))}
              </div>
            )}
          </div>
        </div>
        <RichTextEditor
          node={tempo}
          nodes={nodes}
          deletedNodes={deletedNodes}
          editorRef={editorRef}
          onContentChange={onContentChange}
          setSelectedId={(id) => onOpenNodeView(id, 0, 0)}
          setExpanded={setExpanded}
          pendingNodeDrop={pendingNodeDrop}
          onNodeDropHandled={() => setPendingNodeDrop(null)}
          onOpenDeletedNode={onOpenDeletedNode}
          onOpenNodeView={onOpenNodeView}
          onImageFilePaste={onImageFilePaste}
          onSlashCommand={onSlashCommand}
          style={{
            display: "block",
            width: "100%",
            minHeight: 190,
            padding: 12,
            border: "1px solid #2A2E33",
            borderRadius: 4,
            background: "#121417",
            color: "#E8E9EA",
            fontSize: 13,
            fontFamily: "inherit",
            lineHeight: 1.6,
            outline: "none",
          }}
        />
      </section>
    </div>
  );
}
