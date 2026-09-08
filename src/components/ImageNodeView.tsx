import { useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import type { NodeItem } from "../types/nodes";
import {
  getImageResourceInfo,
  hashImageFile,
  createImageContent,
  getDataUrlByteSize,
  getImageMimeType,
} from "../utils/imageResource";
import { isDesktopRuntime } from "../project/runtime";
import NodeTypeLabel from "./NodeTypeLabel";
import { useLocale } from "../i18n/LocaleContext";

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
  const { t } = useLocale();
  const resource = getImageResourceInfo(node.content, node.name);
  const [inspection, setInspection] = useState<{
    width: number;
    height: number;
    storedSize: number | null;
    mimeType: string | null;
    hasTransparency: boolean | null;
  } | null>(null);
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
      setInspection(null);
      return;
    }
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      let hasTransparency: boolean | null = null;
      if (getImageMimeType(resource.src) === "image/jpeg") {
        hasTransparency = false;
      } else {
        try {
          const maxSampleSize = 256;
          const scale = Math.min(1, maxSampleSize / image.naturalWidth, maxSampleSize / image.naturalHeight);
          const sampleWidth = Math.max(1, Math.round(image.naturalWidth * scale));
          const sampleHeight = Math.max(1, Math.round(image.naturalHeight * scale));
          const canvas = document.createElement("canvas");
          canvas.width = sampleWidth;
          canvas.height = sampleHeight;
          const context = canvas.getContext("2d", { willReadFrequently: true });
          if (context) {
            context.drawImage(image, 0, 0, sampleWidth, sampleHeight);
            const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
            hasTransparency = false;
            for (let index = 3; index < pixels.length; index += 4) {
              if (pixels[index] < 255) {
                hasTransparency = true;
                break;
              }
            }
          }
        } catch {
          hasTransparency = null;
        }
      }
      if (!cancelled) {
        setInspection({
          width: image.naturalWidth,
          height: image.naturalHeight,
          storedSize: getDataUrlByteSize(resource.src),
          mimeType: getImageMimeType(resource.src),
          hasTransparency,
        });
      }
    };
    image.src = resource.src;
    return () => {
      cancelled = true;
    };
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
    return <div className="image-node-view__empty">{t("image.invalid")}</div>;
  }

  const replaceImage = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setMessage(t("image.replace.invalid"));
      return;
    }
    const hash = await hashImageFile(file);
    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result !== "string") return;
      onContentChange(
        node.id,
        createImageContent(reader.result, file.name, file.size, hash, editingDescription)
      );
      setMessage(t("image.replace.success"));
    };
    reader.readAsDataURL(file);
  };

  const copyImage = async () => {
    try {
      if (!navigator.clipboard) {
        throw new Error(t("image.clipboardUnavailable"));
      }
      const response = await fetch(resource.src);
      const blob = await response.blob();
      if (navigator.clipboard.write && typeof ClipboardItem !== "undefined") {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ [blob.type]: blob })
          ]);
          setMessage(t("image.copy.success"));
          return;
        } catch {
          // Si falla el MIME type, intentar fallback
        }
      }
      if (navigator.clipboard.writeText && resource.src.startsWith("data:")) {
        await navigator.clipboard.writeText(resource.src);
        setMessage(t("image.copyReference.success"));
      } else {
        throw new Error(t("image.copyUnsupported"));
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("image.copy.failed"));
    }
  };

  const downloadImage = async () => {
    try {
      if (isDesktopRuntime() && resource.src.startsWith("data:")) {
        const path = await save({
          defaultPath: resource.fileName,
          title: t("image.saveDialog"),
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
      setMessage(t("image.download.success"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("image.download.failed"));
    }
  };

  return (
    <div className="image-node-view">
      <div className="image-node-view__preview">
        <img src={resource.src} alt={resource.fileName} />
      </div>
      <div className="image-node-view__panel">
        <NodeTypeLabel type="imagen" />
        <input
          className="image-node-view__title"
          value={editingName}
          onChange={(event) => handleNameChange(event.target.value)}
          onBlur={handleNameBlur}
          onKeyDown={(event) => {
            if (event.key === "Enter") handleNameBlur();
          }}
          aria-label={t("image.name")}
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
          placeholder={t("image.description.placeholder")}
          aria-label={t("image.description")}
          rows={2}
        />
        <div className="image-node-view__actions">
          <button
            type="button"
            className="image-node-view__button"
            onClick={() => void downloadImage()}
          >
            {t("image.download")}
          </button>
          <button type="button" className="image-node-view__button" onClick={() => void copyImage()}>
            {t("image.copy")}
          </button>
          <label className="image-node-view__button">
            {t("image.change")}
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
            {t("image.delete")}
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
          {t("image.useAsCover")}
        </button>

        {message && <div className="image-node-view__message">{message}</div>}
        <dl className="image-node-view__metadata">
          <dt>{t("image.file")}</dt>
          <dd>{resource.fileName}</dd>
          <dt>{t("image.extension")}</dt>
          <dd>{resource.extension || t("image.unavailable")}</dd>
          <dt>{t("image.format")}</dt>
          <dd>{inspection?.mimeType || t("image.unavailable")}</dd>
          <dt>{t("image.originalSize")}</dt>
          <dd>{resource.fileSize === null ? t("image.unavailable") : `${resource.fileSize.toLocaleString()} bytes`}</dd>
          <dt>{t("image.storedSize")}</dt>
          <dd>{inspection?.storedSize === null || inspection?.storedSize === undefined ? t("image.unavailable") : `${inspection.storedSize.toLocaleString()} bytes`}</dd>
          <dt>{t("image.reduction")}</dt>
          <dd>{resource.fileSize && inspection?.storedSize !== null && inspection?.storedSize !== undefined && inspection.storedSize < resource.fileSize ? `${Math.round((1 - inspection.storedSize / resource.fileSize) * 100)}%` : t("image.noReduction")}</dd>
          <dt>{t("image.dimensions")}</dt>
          <dd>{inspection ? `${inspection.width} × ${inspection.height}px` : t("image.unavailable")}</dd>
          <dt>{t("image.aspectRatio")}</dt>
          <dd>{inspection ? `${(inspection.width / inspection.height).toFixed(2)}:1` : t("image.unavailable")}</dd>
          <dt>{t("image.transparency")}</dt>
          <dd>{inspection?.hasTransparency === true ? t("common.yes") : inspection?.hasTransparency === false ? t("common.no") : t("image.unavailable")}</dd>
          <dt>{t("image.hash")}</dt>
          <dd title={resource.hash || undefined}>{resource.hash || t("image.unavailable")}</dd>
        </dl>
      </div>
    </div>
  );
}
