import { useEffect, useState, useRef, useCallback } from "react";
import type { NodeItem } from "../types/nodes";
import { openWebUrl } from "../nodes/viewPrimitives";
import { useLocale } from "../i18n/LocaleContext";
import { useResolvedImageSource } from "../utils/imageRuntimeResolver";

export interface ImagePreviewModalProps {
  src: string;
  alt?: string;
  node?: NodeItem | null;
  onClose: () => void;
  onNavigateToNode?: (nodeId: string) => void;
}

export function ImagePreviewModal({
  src,
  alt,
  node,
  onClose,
  onNavigateToNode,
}: ImagePreviewModalProps) {
  const { t } = useLocale();
  const [isZoomed, setIsZoomed] = useState(false);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const resolved = useResolvedImageSource(node);
  const effectiveSrc = resolved.src || src;
  const overlayRef = useRef<HTMLDivElement | null>(null);

  // Auto-focus overlay for immediate keyboard navigation
  useEffect(() => {
    overlayRef.current?.focus();
  }, []);

  // Listen for Escape key
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [onClose]);

  // Lock background scroll while modal is visible
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  const handleBackdropClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }, [onClose]);

  const handleImageClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    setIsZoomed((current) => !current);
  };

  const handleOpenOriginal = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!effectiveSrc) return;
    if (/^https?:\/\//i.test(effectiveSrc)) {
      await openWebUrl(effectiveSrc);
    } else {
      window.open(effectiveSrc, "_blank", "noopener,noreferrer");
    }
  };

  const handleNavigateNode = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!node || !onNavigateToNode) return;
    onClose();
    onNavigateToNode(node.id);
  };

  const imageName = node?.name || alt || t("editor.image.title");

  return (
    <div
      ref={overlayRef}
      className="discord-image-preview-overlay"
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={t("editor.image.previewTitle")}
      onClick={handleBackdropClick}
    >
      {/* Top right close button with Esc indicator badge */}
      <div className="discord-image-preview-close-wrap" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="discord-image-preview-close-btn"
          title={t("editor.image.closePreview")}
          aria-label={t("editor.image.closePreview")}
          onClick={onClose}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <span className="discord-image-preview-esc-badge">ESC</span>
      </div>

      {/* Main stage with image */}
      <div
        className={`discord-image-preview-stage${isZoomed ? " is-zoomed" : ""}`}
        onClick={handleBackdropClick}
      >
        <img
          src={effectiveSrc}
          alt={imageName}
          className="discord-image-preview-img"
          onClick={handleImageClick}
          onLoad={(e) => {
            const img = e.currentTarget;
            setDimensions({ width: img.naturalWidth, height: img.naturalHeight });
          }}
          title={isZoomed ? t("editor.image.zoomOut") : t("editor.image.zoomIn")}
        />
      </div>

      {/* Discord-style floating bottom bar */}
      <div className="discord-image-preview-bar" onClick={(e) => e.stopPropagation()}>
        {/* Node / Image Title */}
        <span className="discord-image-preview-title" title={imageName}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8, flexShrink: 0 }}>
            <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
          </svg>
          {imageName}
        </span>

        {/* Natural dimensions */}
        {dimensions && (
          <span className="discord-image-preview-dimensions">
            {dimensions.width} × {dimensions.height} px
          </span>
        )}

        <span className="discord-image-preview-dot">•</span>

        {/* Open original link */}
        <button
          type="button"
          className="discord-image-preview-link"
          onClick={handleOpenOriginal}
          title={t("editor.image.openOriginal")}
        >
          <span>{t("editor.image.openOriginal")}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </button>

        {/* Navigate to Node button */}
        {node && onNavigateToNode && (
          <>
            <span className="discord-image-preview-dot">•</span>
            <button
              type="button"
              className="discord-image-preview-node-btn"
              onClick={handleNavigateNode}
              title={t("editor.image.goToNode")}
            >
              <span>{t("editor.image.goToNode")}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
