import { useEffect, useState } from "react";
import type { NodeItem } from "../types/nodes";
import { getNodeDefinition, getNodeDisplayLabel } from "../defs/nodeTypes";
import { getImageResourceInfo } from "../utils/imageResource";
import { getPageMeta, setPageMeta, type PageMeta } from "../utils/pageMeta";

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

  useEffect(() => setMeta(getPageMeta(node.content)), [node.content]);

  const imageNodes = nodes.filter((item) => item.type === "imagen");
  const icon = meta.iconNodeId ? nodes.find((item) => item.id === meta.iconNodeId) : null;
  const cover = meta.coverNodeId ? nodes.find((item) => item.id === meta.coverNodeId) : null;
  const iconResource = icon ? getImageResourceInfo(icon.content, icon.name) : null;
  const coverResource = cover ? getImageResourceInfo(cover.content, cover.name) : null;

  const updateMeta = (next: PageMeta) => {
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

  return (
    <>
      <div className="page-node-header">
        <div className="page-node-header__content">
          {coverResource && (
            <div
              className="page-node-header__cover has-image"
              style={{ backgroundImage: `url(${coverResource.src})` }}
              aria-hidden="true"
            />
          )}
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
            {imageNodes.length === 0 && <div className="page-image-picker__empty">No hay Nodos - Imagen disponibles.</div>}
          </div>
        </div>
      )}
    </>
  );
}