import { useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import type { NodeItem } from "../types/nodes";
import {
  getImageResourceInfo,
  hashImageFile,
  createImageContent,
  compressImageSource,
} from "../utils/imageResource";
import { isDesktopRuntime } from "../project/runtime";

interface ImageNodeViewProps {
  node: NodeItem;
  onContentChange: (id: string, content: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onUseAsProjectCover?: (nodeId: string) => void;
}

export default function ImageNodeView({
  node,
  onContentChange,
  onRename,
  onDelete,
  onUseAsProjectCover,
}: ImageNodeViewProps) {
  const resource = getImageResourceInfo(node.content, node.name);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(node.name);
  const [editingDescription, setEditingDescription] = useState(resource?.description || "");
  const renameTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setEditingName(node.name);
  }, [node.name]);

  useEffect(() => () => {
    if (renameTimeoutRef.current) clearTimeout(renameTimeoutRef.current);
  }, []);

  useEffect(() => {
    if (resource) {
      setEditingDescription(resource.description);
    }
  }, [resource?.hash]);

  useEffect(() => {
    if (!resource) {
      setDimensions(null);
      return;
    }
    const image = new Image();
    image.onload = () => setDimensions({ width: image.naturalWidth, height: image.naturalHeight });
    image.src = resource.src;
  }, [resource?.src]);

  const handleNameChange = (newName: string) => {
    setEditingName(newName);
    if (renameTimeoutRef.current) clearTimeout(renameTimeoutRef.current);
    renameTimeoutRef.current = setTimeout(() => {
      if (newName.trim() && newName.trim() !== node.name) {
        onRename(node.id, newName.trim());
      }
    }, 500);
  };

  const handleNameBlur = () => {
    if (renameTimeoutRef.current) clearTimeout(renameTimeoutRef.current);
    const trimmed = editingName.trim();
    if (trimmed && trimmed !== node.name) {
      onRename(node.id, trimmed);
    } else {
      setEditingName(node.name);
    }
  };

  if (!resource) {
    return <div className="image-node-view__empty">No se encontró una imagen válida en este nodo.</div>;
  }

  const replaceImage = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setMessage("El archivo seleccionado no es una imagen compatible.");
      return;
    }
    const hash = await hashImageFile(file);
    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result !== "string") return;
      const compressed = await compressImageSource(reader.result);
      onContentChange(
        node.id,
        createImageContent(compressed, file.name, file.size, hash, editingDescription)
      );
      setMessage("Imagen actualizada.");
    };
    reader.readAsDataURL(file);
  };

  const copyImage = async () => {
    try {
      if (!navigator.clipboard) {
        throw new Error("El portapapeles no está disponible.");
      }
      const response = await fetch(resource.src);
      const blob = await response.blob();
      if (navigator.clipboard.write && typeof ClipboardItem !== "undefined") {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ [blob.type]: blob })
          ]);
          setMessage("Imagen copiada al portapapeles.");
          return;
        } catch {
          // Si falla el MIME type, intentar fallback
        }
      }
      if (navigator.clipboard.writeText && resource.src.startsWith("data:")) {
        await navigator.clipboard.writeText(resource.src);
        setMessage("Referencia de imagen copiada.");
      } else {
        throw new Error("Copiar imágenes no está soportado en tu entorno.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo copiar la imagen.");
    }
  };

  const downloadImage = async () => {
    try {
      if (isDesktopRuntime() && resource.src.startsWith("data:")) {
        const path = await save({
          defaultPath: resource.fileName,
          title: "Guardar imagen",
          filters: resource.extension
            ? [{ name: resource.extension, extensions: [resource.extension.toLowerCase()] }]
            : undefined,
        });
        if (!path) return;
        const base64 = resource.src.split(",", 2)[1];
        const binary = atob(base64);
        await invoke("save_image_file", {
          path,
          data: Array.from(binary, (character) => character.charCodeAt(0)),
        });
      } else {
        const link = document.createElement("a");
        link.href = resource.src;
        link.download = resource.fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      setMessage("Imagen descargada.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo descargar la imagen.");
    }
  };

  return (
    <div className="image-node-view">
      <div className="image-node-view__preview">
        <img src={resource.src} alt={resource.fileName} />
      </div>
      <div className="image-node-view__panel">
        <input
          className="image-node-view__title"
          value={editingName}
          onChange={(event) => handleNameChange(event.target.value)}
          onBlur={handleNameBlur}
          onKeyDown={(event) => {
            if (event.key === "Enter") handleNameBlur();
          }}
          aria-label="Nombre de la imagen"
        />
        <textarea
          className="image-node-view__description"
          value={editingDescription}
          onChange={(event) => setEditingDescription(event.target.value)}
          onBlur={() => {
            if (editingDescription !== (resource?.description || "")) {
              const updated = createImageContent(
                resource?.src || "",
                resource?.fileName || node.name,
                resource?.fileSize || 0,
                resource?.hash || "",
                editingDescription
              );
              onContentChange(node.id, updated);
            }
          }}
          placeholder="Añade una descripción..."
          aria-label="Descripción de la imagen"
          rows={2}
        />
        <div className="image-node-view__actions">
          <button
            type="button"
            className="image-node-view__button"
            onClick={() => void downloadImage()}
          >
            Descargar
          </button>
          <button type="button" className="image-node-view__button" onClick={() => void copyImage()}>
            Copiar
          </button>
          <label className="image-node-view__button">
            Cambiar
            <input
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void replaceImage(file);
                event.currentTarget.value = "";
              }}
            />
          </label>
          <button type="button" className="image-node-view__button is-danger" onClick={() => onDelete(node.id)}>
            Borrar
          </button>
        </div>

        <div
          style={{
            height: "1px",
            background: "rgba(255,255,255,0.14)",
            margin: "10px 0 12px",
          }}
        />

        <button
          type="button"
          className="image-node-view__button"
          onClick={() => onUseAsProjectCover?.(node.id)}
        >
          Usar como portada
        </button>

        {message && <div className="image-node-view__message">{message}</div>}
        <dl className="image-node-view__metadata">
          <dt>Extensión</dt>
          <dd>{resource.extension || "No disponible"}</dd>
          <dt>Tamaño</dt>
          <dd>{resource.fileSize === null ? "No disponible" : `${resource.fileSize.toLocaleString()} bytes`}</dd>
          <dt>Dimensiones</dt>
          <dd>{dimensions ? `${dimensions.width} × ${dimensions.height}px` : "No disponible"}</dd>
        </dl>
      </div>
    </div>
  );
}
