import { useEffect, useRef, useState } from "react";
import type { NodeItem } from "../types/nodes";

type ActionMode = "link" | "folder" | "template" | "export" | "confirm";
export type ExportFormat = "pdf" | "markdown" | "html";

export interface PdfExportSettings {
  pageSize: "a3" | "a4" | "letter";
  orientation: "portrait" | "landscape";
  scale: number;
  theme: "dark" | "light";
  includeTitle: boolean;
  includeIcon: boolean;
  includeCover: boolean;
  includeDescription: boolean;
  includeTags: boolean;
  includeImages: boolean;
  includeFrontmatter?: boolean;
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

export const DEFAULT_PDF_SETTINGS: PdfExportSettings = {
  pageSize: "a4",
  orientation: "portrait",
  scale: 1,
  theme: "dark",
  includeTitle: true,
  includeIcon: true,
  includeCover: true,
  includeDescription: true,
  includeTags: true,
  includeImages: true,
  includeFrontmatter: true,
};

export default function NodeActionDialog({
  mode,
  nodes = [],
  templates = [],
  onClose,
  onSelect,
  onCreateFolder,
  onSelectTemplate,
  onExport,
  confirmation,
  onConfirm,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState("");
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [settings, setSettings] = useState<PdfExportSettings>(DEFAULT_PDF_SETTINGS);

  useEffect(() => {
    dialogRef.current?.showModal();
    return () => dialogRef.current?.close();
  }, []);

  const filteredNodes = nodes.filter((node) =>
    node.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  );
  const filteredTemplates = templates.filter((template) =>
    template.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  );

  const title =
    mode === "link"
      ? "Crear enlace en otro Nodo"
      : mode === "folder"
      ? "Añadir a carpeta"
      : mode === "template"
      ? "Cargar plantilla"
      : mode === "confirm"
      ? "Cargar plantilla"
      : "Exportar Nodo";

  const submit = () => {
    if ((mode === "link" || mode === "folder") && selectedId) onSelect(selectedId);
    else if (mode === "folder" && folderName.trim()) onCreateFolder(folderName.trim());
    else if (mode === "template") {
      const template = templates.find((item) => item.name === selectedId);
      if (template) onSelectTemplate(template);
    } else if (mode === "export") {
      onExport(format, settings);
    } else if (mode === "confirm") {
      onConfirm?.();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="lore-add-dialog node-action-dialog"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      aria-labelledby="node-action-title"
    >
      <div className="lore-add-dialog__content">
        <header>
          <h2 id="node-action-title">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </header>

        {mode === "confirm" && <p>{confirmation}</p>}

        {mode !== "export" && mode !== "confirm" && (
          <input
            autoFocus
            aria-label="Buscar"
            placeholder={
              mode === "folder"
                ? "Buscar carpeta..."
                : mode === "template"
                ? "Buscar plantilla..."
                : "Buscar Nodo..."
            }
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        )}

        {(mode === "link" || mode === "folder") && (
          <div className="lore-add-dialog__list node-action-dialog__list">
            {filteredNodes.map((node) => (
              <button
                type="button"
                className={selectedId === node.id ? "is-selected" : ""}
                key={node.id}
                onClick={() => setSelectedId(node.id)}
              >
                <span>{node.name}</span>
                <small>{node.type}</small>
              </button>
            ))}
            {!filteredNodes.length && <p>No hay resultados coincidentes.</p>}
          </div>
        )}

        {mode === "folder" && (
          <>
            <button
              type="button"
              className="node-action-dialog__new"
              onClick={() => {
                setSelectedId(null);
                setFolderName("");
              }}
            >
              + Nueva carpeta
            </button>
            {!selectedId && (
              <input
                autoFocus
                aria-label="Nombre de carpeta"
                placeholder="Nombre de la nueva carpeta"
                value={folderName}
                onChange={(event) => setFolderName(event.target.value)}
              />
            )}
          </>
        )}

        {mode === "template" && (
          <div className="lore-add-dialog__list node-action-dialog__list">
            {filteredTemplates.map((template) => (
              <button
                type="button"
                className={selectedId === template.name ? "is-selected" : ""}
                key={template.name}
                onClick={() => setSelectedId(template.name)}
              >
                <span>{template.name}</span>
                <small>{template.type}</small>
              </button>
            ))}
            {!filteredTemplates.length && <p>No hay plantillas compatibles.</p>}
          </div>
        )}

        {mode === "export" && (
          <div className="node-export-container">
            <div className="node-action-dialog__formats" role="tablist" aria-label="Formatos de exportación">
              <button
                type="button"
                role="tab"
                aria-selected={format === "pdf"}
                aria-pressed={format === "pdf"}
                onClick={() => setFormat("pdf")}
              >
                PDF (.pdf)
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={format === "markdown"}
                aria-pressed={format === "markdown"}
                onClick={() => setFormat("markdown")}
              >
                Markdown (.md)
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={format === "html"}
                aria-pressed={format === "html"}
                onClick={() => setFormat("html")}
              >
                HTML (.html)
              </button>
            </div>

            {format === "pdf" && (
              <div className="node-action-dialog__options">
                <div className="node-export-section-title">Formato de página</div>
                <div className="node-export-grid">
                  <label>
                    <span>Tamaño de papel</span>
                    <select
                      value={settings.pageSize}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          pageSize: event.target.value as PdfExportSettings["pageSize"],
                        })
                      }
                    >
                      <option value="a4">A4 (Estándar)</option>
                      <option value="a3">A3 (Amplio)</option>
                      <option value="letter">Carta (Letter)</option>
                    </select>
                  </label>

                  <label>
                    <span>Orientación</span>
                    <select
                      value={settings.orientation}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          orientation: event.target.value as PdfExportSettings["orientation"],
                        })
                      }
                    >
                      <option value="portrait">Vertical (Retrato)</option>
                      <option value="landscape">Horizontal (Paisaje)</option>
                    </select>
                  </label>

                  <label>
                    <span>Tema visual</span>
                    <select
                      value={settings.theme}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          theme: event.target.value as PdfExportSettings["theme"],
                        })
                      }
                    >
                      <option value="dark">Tema Oscuro (H.I.S. Nativo)</option>
                      <option value="light">Tema Claro (Papel / Ecológico)</option>
                    </select>
                  </label>

                  <label>
                    <span>Escala</span>
                    <input
                      type="number"
                      min="50"
                      max="200"
                      step="10"
                      value={Math.round(settings.scale * 100)}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          scale: Math.max(0.5, Math.min(2, Number(event.target.value) / 100 || 1)),
                        })
                      }
                    />
                  </label>
                </div>

                <div className="node-export-section-title">Contenido a incluir</div>
                <div className="node-export-checkboxes">
                  <label>
                    <input
                      type="checkbox"
                      checked={settings.includeTitle}
                      onChange={(e) => setSettings({ ...settings, includeTitle: e.target.checked })}
                    />
                    Título del documento
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={settings.includeIcon}
                      onChange={(e) => setSettings({ ...settings, includeIcon: e.target.checked })}
                    />
                    Icono de página
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={settings.includeCover}
                      onChange={(e) => setSettings({ ...settings, includeCover: e.target.checked })}
                    />
                    Portada visual
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={settings.includeDescription}
                      onChange={(e) => setSettings({ ...settings, includeDescription: e.target.checked })}
                    />
                    Descripción / Subtítulo
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={settings.includeTags}
                      onChange={(e) => setSettings({ ...settings, includeTags: e.target.checked })}
                    />
                    Etiquetas (Tags)
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={settings.includeImages}
                      onChange={(e) => setSettings({ ...settings, includeImages: e.target.checked })}
                    />
                    Imágenes del contenido
                  </label>
                </div>
              </div>
            )}

            {format === "markdown" && (
              <div className="node-action-dialog__options">
                <div className="node-export-section-title">Opciones de Markdown</div>
                <div className="node-export-checkboxes">
                  <label>
                    <input
                      type="checkbox"
                      checked={settings.includeTitle}
                      onChange={(e) => setSettings({ ...settings, includeTitle: e.target.checked })}
                    />
                    Título como encabezado (# Título)
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={settings.includeFrontmatter ?? true}
                      onChange={(e) => setSettings({ ...settings, includeFrontmatter: e.target.checked })}
                    />
                    Metadatos YAML Frontmatter (Obsidian / Anytype compatible)
                  </label>
                </div>
                <p className="node-export-note">
                  El Markdown exportado preserva tablas con sintaxis GFM, globos y notas como alertas de bloque (<code>&gt; [!NOTE]</code>), y enlaces limpios.
                </p>
              </div>
            )}

            {format === "html" && (
              <div className="node-action-dialog__options">
                <div className="node-export-section-title">Opciones de HTML</div>
                <div className="node-export-grid">
                  <label>
                    <span>Tema visual</span>
                    <select
                      value={settings.theme}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          theme: event.target.value as PdfExportSettings["theme"],
                        })
                      }
                    >
                      <option value="dark">Tema Oscuro (H.I.S.)</option>
                      <option value="light">Tema Claro (Lectura)</option>
                    </select>
                  </label>
                </div>
                <div className="node-export-checkboxes">
                  <label>
                    <input
                      type="checkbox"
                      checked={settings.includeTitle}
                      onChange={(e) => setSettings({ ...settings, includeTitle: e.target.checked })}
                    />
                    Incluir título y encabezado
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={settings.includeDescription}
                      onChange={(e) => setSettings({ ...settings, includeDescription: e.target.checked })}
                    />
                    Incluir descripción del Nodo
                  </label>
                </div>
                <p className="node-export-note">
                  Genera un archivo HTML autosuficiente con estilos CSS embebidos listo para abrirse en cualquier navegador o compartir.
                </p>
              </div>
            )}
          </div>
        )}

        <div className="lore-add-dialog__actions">
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            disabled={
              mode === "link" || mode === "template"
                ? !selectedId
                : mode === "folder"
                ? !selectedId && !folderName.trim()
                : false
            }
            onClick={submit}
          >
            {mode === "export"
              ? format === "pdf"
                ? "Exportar PDF"
                : format === "markdown"
                ? "Exportar Markdown"
                : "Exportar HTML"
              : mode === "template"
              ? "Cargar"
              : mode === "folder"
              ? "Añadir"
              : mode === "confirm"
              ? "Cargar"
              : "Crear enlace"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
