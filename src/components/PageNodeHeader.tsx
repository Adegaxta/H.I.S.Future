import { useEffect, useRef, useState } from "react";
import type { NodeItem } from "../types/nodes";
import { getNodeDefinition, getNodeDisplayLabel } from "../defs/nodeTypes";
import { getImageResourceInfo } from "../utils/imageResource";
import { DEFAULT_PAGE_META, getPageMeta, setPageMeta, type PageMeta } from "../utils/pageMeta";

interface PageNodeHeaderProps {
  node: NodeItem;
  nodes: NodeItem[];
  onContentChange: (id: string, content: string) => void;
  onImageFileUpload: (file: File) => Promise<string | null>;
}

type ImageChoice = "iconNodeId" | "coverNodeId";

export default function PageNodeHeader({
  node,
  nodes,
  onContentChange,
  onImageFileUpload,
}: PageNodeHeaderProps) {
  const [meta, setMeta] = useState<PageMeta>(() => getPageMeta(node.content));
  const [choice, setChoice] = useState<ImageChoice | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [headerPositionOpen, setHeaderPositionOpen] = useState(false);
  const [textPositionOpen, setTextPositionOpen] = useState(false);
  const undoRef = useRef<PageMeta[]>([]);
  const redoRef = useRef<PageMeta[]>([]);
  const metaRef = useRef(meta);
  const settingsRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const next = getPageMeta(node.content);
    setMeta(next);
    metaRef.current = next;
  }, [node.content]);

  // El historial de undo/redo es por página: al cambiar de nodo no debe arrastrarse a otro.
  useEffect(() => {
    undoRef.current = [];
    redoRef.current = [];
  }, [node.id]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !["z", "y"].includes(event.key.toLowerCase())) return;
      if ((event.target as HTMLElement | null)?.closest(".editor-content")) return;
      const history = event.key.toLowerCase() === "z" && !event.shiftKey ? undoRef : redoRef;
      const target = history.current.pop();
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      const current = metaRef.current;
      const opposite = event.key.toLowerCase() === "z" && !event.shiftKey ? redoRef : undoRef;
      opposite.current.push(current);
      metaRef.current = target;
      setMeta(target);
      onContentChange(node.id, setPageMeta(node.content, target));
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [node.content, node.id, onContentChange]);

  useEffect(() => {
    if (!settingsOpen) return;
    const closeSettings = (event: PointerEvent) => {
      if (!settingsRef.current?.contains(event.target as Node)) {
        setSettingsOpen(false);
        setHeaderPositionOpen(false);
        setTextPositionOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSettingsOpen(false);
        setHeaderPositionOpen(false);
        setTextPositionOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeSettings);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeSettings);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [settingsOpen]);

  const imageNodes = nodes.filter((item) => item.type === "imagen");
  const icon = meta.iconNodeId ? nodes.find((item) => item.id === meta.iconNodeId) : null;
  const cover = meta.coverNodeId ? nodes.find((item) => item.id === meta.coverNodeId) : null;
  const iconResource = icon ? getImageResourceInfo(icon.content, icon.name) : null;
  const coverResource = cover ? getImageResourceInfo(cover.content, cover.name) : null;

  const updateMeta = (next: PageMeta) => {
    if (JSON.stringify(next) === JSON.stringify(metaRef.current)) return;
    undoRef.current.push(metaRef.current);
    redoRef.current = [];
    metaRef.current = next;
    setMeta(next);
    onContentChange(node.id, setPageMeta(node.content, next));
  };

  const chooseImage = (id: string) => {
    updateMeta({ ...meta, [choice || "iconNodeId"]: id });
    setChoice(null);
  };

  const uploadImage = async (file: File) => {
    const id = await onImageFileUpload(file);
    if (id) chooseImage(id);
  };

  const clearImage = () => {
    if (!choice) return;
    updateMeta({ ...meta, [choice]: null });
    setChoice(null);
  };

  const hasCustomSettings = meta.blockWidth !== DEFAULT_PAGE_META.blockWidth ||
    meta.headerPosition !== DEFAULT_PAGE_META.headerPosition ||
    meta.textPosition !== DEFAULT_PAGE_META.textPosition;

  return (
    <>
      <div className="page-node-header">
        {coverResource && (
          <div
            className="page-node-header__cover has-image"
            style={{ backgroundImage: `url(${coverResource.src})` }}
            aria-hidden="true"
          />
        )}
        <div className="page-node-header__content">
          <div className={`page-node-header__block page-node-header__block--${meta.headerPosition}`}>
            <div className={`page-node-header__title-row${iconResource ? " has-icon" : ""}`}>
            {iconResource && <img className="page-node-header__icon" src={iconResource.src} alt="" />}
            <div className="page-node-header__title-content">
              <div className="page-node-header__type-row">
                <div className="editor-page__type" style={{ color: getNodeDefinition("pagina").color }}>
                  {getNodeDisplayLabel("pagina")}
                </div>
                <div className="page-node-header__actions">
                  <button type="button" onClick={() => setChoice("iconNodeId")} title="Elegir icono">Icono</button>
                  <button type="button" onClick={() => setChoice("coverNodeId")} title="Elegir portada">Portada</button>
                  <button
                    type="button"
                    onClick={() => updateMeta({ ...meta, hideDescription: !meta.hideDescription })}
                    title="Mostrar u ocultar descripción"
                  >
                    {meta.hideDescription ? "Mostrar descripción" : "Ocultar descripción"}
                  </button>
                  <span className="page-node-settings-anchor" ref={settingsRef}>
                    <button type="button" onClick={() => { setSettingsOpen((open) => !open); setHeaderPositionOpen(false); setTextPositionOpen(false); }} title="Más opciones">...</button>
                    {settingsOpen && (
                      <div className="page-node-settings">
                        {hasCustomSettings && (
                      <button type="button" onMouseEnter={() => { setHeaderPositionOpen(false); setTextPositionOpen(false); }} onClick={() => { updateMeta({ ...meta, ...DEFAULT_PAGE_META, description: meta.description, iconNodeId: meta.iconNodeId, coverNodeId: meta.coverNodeId }); setSettingsOpen(false); }}>
                            Restablecer a diseño predeterminado
                          </button>
                        )}
                        <label onMouseEnter={() => { setHeaderPositionOpen(false); setTextPositionOpen(false); }}>
                          Ancho de bloques de Nodo Página
                          <input type="range" min="100" max="200" value={meta.blockWidth} onChange={(event) => updateMeta({ ...meta, blockWidth: Number(event.target.value) })} />
                          <span>{meta.blockWidth}%</span>
                        </label>
                        <div className="page-node-settings__position">
                          <button type="button" onMouseEnter={() => { setHeaderPositionOpen(true); setTextPositionOpen(false); }}>Posición de Cabecera</button>
                          {headerPositionOpen && (
                            <div className="page-node-settings__position-menu">
                              {(["left", "center", "right"] as const).map((position) => (
                                <button type="button" key={position} onClick={() => { updateMeta({ ...meta, headerPosition: position }); setHeaderPositionOpen(false); setSettingsOpen(false); }}>
                                  {position === "left" ? "Izquierda" : position === "center" ? "Centro" : "Derecha"}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="page-node-settings__position">
                          <button type="button" onMouseEnter={() => { setTextPositionOpen(true); setHeaderPositionOpen(false); }}>Posición de Bloques de Texto</button>
                          {textPositionOpen && (
                            <div className="page-node-settings__position-menu">
                              {(["left", "center", "right"] as const).map((position) => (
                                <button type="button" key={position} onClick={() => { updateMeta({ ...meta, textPosition: position }); setTextPositionOpen(false); setSettingsOpen(false); }}>
                                  {position === "left" ? "Izquierda" : position === "center" ? "Centro" : "Derecha"}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </span>
                </div>
              </div>
              <h1 className="editor-page__title">{node.name}</h1>
              {!meta.hideDescription && (
                <textarea
                  className="page-node-header__description"
                  value={meta.description}
                  onChange={(event) => setMeta({ ...meta, description: event.target.value })}
                  onBlur={() => onContentChange(node.id, setPageMeta(node.content, meta))}
                  placeholder="Añadir descripción..."
                  aria-label="Descripción de la página"
                  rows={1}
                />
              )}
            </div>
            </div>
          </div>
        </div>
      </div>

      {choice && (
        <div className="page-image-picker" role="dialog" aria-modal="true" aria-label="Elegir imagen">
          <div className="page-image-picker__panel">
            <div className="page-image-picker__header">
              <strong>{choice === "coverNodeId" ? "Elegir portada" : "Elegir icono"}</strong>
              <button type="button" onClick={() => setChoice(null)} aria-label="Cerrar">X</button>
            </div>
            <div className="page-image-picker__gallery">
              {imageNodes.map((imageNode) => {
                const resource = getImageResourceInfo(imageNode.content, imageNode.name);
                if (!resource) return null;
                return (
                  <button type="button" key={imageNode.id} onClick={() => chooseImage(imageNode.id)} title={imageNode.name}>
                    <img src={resource.src} alt={imageNode.name} />
                    <span>{imageNode.name}</span>
                  </button>
                );
              })}
            </div>
            <label className="page-image-picker__upload">
              Cargar imagen externa
              <input type="file" accept="image/*" onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadImage(file);
                event.currentTarget.value = "";
              }} />
            </label>
            <button type="button" className="page-image-picker__delete" onClick={clearImage}>
              Borrar imagen de {choice === "coverNodeId" ? "portada" : "icono"}
            </button>
            {imageNodes.length === 0 && <div className="page-image-picker__empty">No hay Nodos - Imagen disponibles.</div>}
          </div>
        </div>
      )}
    </>
  );
}