import { useEffect, useRef, useState } from "react";
import type { NodeItem } from "../types/nodes";

type ActionMode = "link" | "folder" | "template" | "export" | "confirm";
export type ExportFormat = "pdf" | "markdown";
export interface PdfExportSettings {
  pageSize: "a3" | "a4" | "letter";
  orientation: "portrait" | "landscape";
  scale: number;
  includeTitle: boolean;
  includeIcon: boolean;
  includeCover: boolean;
  includeImages: boolean;
}
interface Props {
  mode: ActionMode;
  nodes?: NodeItem[];
  templates?: Array<{ name: string; type: string; content: string }>;
  onClose: () => void;
  onSelect: (id: string) => void;
  onCreateFolder: (name: string) => void;
  onSelectTemplate: (template: { name: string; type: string; content: string }) => void;
  onExport: (format: ExportFormat, settings: PdfExportSettings) => void;
  confirmation?: string;
  onConfirm?: () => void;
}
export const DEFAULT_PDF_SETTINGS: PdfExportSettings = { pageSize: "a4", orientation: "portrait", scale: 1, includeTitle: true, includeIcon: true, includeCover: true, includeImages: true };
export default function NodeActionDialog({ mode, nodes = [], templates = [], onClose, onSelect, onCreateFolder, onSelectTemplate, onExport, confirmation, onConfirm }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState("");
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [settings, setSettings] = useState(DEFAULT_PDF_SETTINGS);
  useEffect(() => { dialogRef.current?.showModal(); return () => dialogRef.current?.close(); }, []);
  const filteredNodes = nodes.filter((node) => node.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const filteredTemplates = templates.filter((template) => template.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const title = mode === "link" ? "Crear enlace en otro Nodo" : mode === "folder" ? "Añadir a carpeta" : mode === "template" ? "Cargar plantilla" : mode === "confirm" ? "Cargar plantilla" : "Exportar Nodo";
  const submit = () => {
    if ((mode === "link" || mode === "folder") && selectedId) onSelect(selectedId);
    else if (mode === "folder" && folderName.trim()) onCreateFolder(folderName.trim());
    else if (mode === "template") { const template = templates.find((item) => item.name === selectedId); if (template) onSelectTemplate(template); }
    else if (mode === "export") onExport(format, settings);
    else if (mode === "confirm") onConfirm?.();
  };
  return <dialog ref={dialogRef} className="lore-add-dialog node-action-dialog" onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} aria-labelledby="node-action-title">
    <div className="lore-add-dialog__content">
      <header><h2 id="node-action-title">{title}</h2><button type="button" onClick={onClose} aria-label="Cerrar">×</button></header>
      {mode === "confirm" && <p>{confirmation}</p>}
      {mode !== "export" && mode !== "confirm" && <input autoFocus aria-label="Buscar" placeholder={mode === "folder" ? "Buscar carpeta..." : mode === "template" ? "Buscar plantilla..." : "Buscar Nodo..."} value={query} onChange={(event) => setQuery(event.target.value)} />}
      {(mode === "link" || mode === "folder") && <div className="lore-add-dialog__list node-action-dialog__list">{filteredNodes.map((node) => <button type="button" className={selectedId === node.id ? "is-selected" : ""} key={node.id} onClick={() => setSelectedId(node.id)}><span>{node.name}</span><small>{node.type}</small></button>)}{!filteredNodes.length && <p>No hay resultados coincidentes.</p>}</div>}
      {mode === "folder" && <><button type="button" className="node-action-dialog__new" onClick={() => { setSelectedId(null); setFolderName(""); }}>+ Nueva carpeta</button>{!selectedId && <input autoFocus aria-label="Nombre de carpeta" placeholder="Nombre de la nueva carpeta" value={folderName} onChange={(event) => setFolderName(event.target.value)} />}</>}
      {mode === "template" && <div className="lore-add-dialog__list node-action-dialog__list">{filteredTemplates.map((template) => <button type="button" className={selectedId === template.name ? "is-selected" : ""} key={template.name} onClick={() => setSelectedId(template.name)}><span>{template.name}</span><small>{template.type}</small></button>)}{!filteredTemplates.length && <p>No hay plantillas compatibles.</p>}</div>}
      {mode === "export" && <><div className="node-action-dialog__formats"><button type="button" aria-pressed={format === "pdf"} onClick={() => setFormat("pdf")}>PDF</button><button type="button" aria-pressed={format === "markdown"} onClick={() => setFormat("markdown")}>Markdown</button></div>{format === "pdf" && <div className="node-action-dialog__options"><label>Tamaño de página<select value={settings.pageSize} onChange={(event) => setSettings({ ...settings, pageSize: event.target.value as PdfExportSettings["pageSize"] })}><option value="a3">A3</option><option value="a4">A4</option><option value="letter">Letter</option></select></label><label>Orientación<select value={settings.orientation} onChange={(event) => setSettings({ ...settings, orientation: event.target.value as PdfExportSettings["orientation"] })}><option value="portrait">Vertical</option><option value="landscape">Horizontal</option></select></label><label>Escala<input type="number" min="50" max="200" step="10" value={settings.scale * 100} onChange={(event) => setSettings({ ...settings, scale: Math.max(0.5, Math.min(2, Number(event.target.value) / 100 || 1)) })} />%</label>{(["includeTitle", "includeIcon", "includeCover", "includeImages"] as const).map((key) => <label key={key}><input type="checkbox" checked={settings[key]} onChange={(event) => setSettings({ ...settings, [key]: event.target.checked })} />{key === "includeTitle" ? "Título" : key === "includeIcon" ? "Icono" : key === "includeCover" ? "Portada" : "Imágenes"}</label>)}</div>}</>}
      <div className="lore-add-dialog__actions"><button type="button" onClick={onClose}>Cancelar</button><button type="button" disabled={mode === "link" || mode === "template" ? !selectedId : mode === "folder" ? !selectedId && !folderName.trim() : false} onClick={submit}>{mode === "export" ? "Exportar" : mode === "template" ? "Cargar" : mode === "folder" ? "Añadir" : mode === "confirm" ? "Cargar" : "Crear enlace"}</button></div>
    </div>
  </dialog>;
}
