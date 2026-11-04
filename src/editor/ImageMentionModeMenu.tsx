import { useEffect, useRef, useState } from "react";
import type { NodeItem } from "../types/nodes";
import { useLocale } from "../i18n/LocaleContext";
import { useDismissibleLayer } from "../hooks/useDismissibleLayer";
import { useResolvedImageSource } from "../utils/imageRuntimeResolver";

export interface ImageMentionModeMenuProps {
  position: { top: number; left: number; caretTop?: number; caretBottom?: number };
  node?: NodeItem | null;
  nodes?: NodeItem[];
  activeMode?: "inserted" | "full";
  onModeChange?: (mode: "inserted" | "full") => void;
  onSelect: (mode: "inserted" | "full") => void;
  onCancel: () => void;
}

export function ImageMentionModeMenu({
  position,
  node,
  activeMode: activeModeProp,
  onModeChange,
  onSelect,
  onCancel,
}: ImageMentionModeMenuProps) {
  const { t } = useLocale();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [localActiveMode, setLocalActiveMode] = useState<"inserted" | "full">("inserted");
  const effectiveMode = activeModeProp ?? localActiveMode;
  const { src: imageSrc } = useResolvedImageSource(node);

  useDismissibleLayer(containerRef, onCancel);

  const handleModeChange = (next: "inserted" | "full") => {
    setLocalActiveMode(next);
    onModeChange?.(next);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        handleModeChange(effectiveMode === "inserted" ? "full" : "inserted");
      } else if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        onSelect(effectiveMode);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [effectiveMode, onSelect]);

  const menuWidth = 240;
  const cardWidth = 210;
  const gap = 8;
  const isLeft = position.left + menuWidth + gap + cardWidth > window.innerWidth - 8;
  const minLeft = isLeft ? cardWidth + gap + 8 : 8;
  const maxLeft = isLeft ? window.innerWidth - menuWidth - 8 : window.innerWidth - menuWidth - gap - cardWidth - 8;
  const placedLeft = Math.max(minLeft, Math.min(position.left, Math.max(minLeft, maxLeft)));

  const menuHeight = 220;
  const caretTop = position.caretTop ?? (position.top - 24);
  const caretBottom = position.caretBottom ?? position.top;

  let placedTop: number;
  if (caretBottom + menuHeight + 8 <= window.innerHeight) {
    placedTop = caretBottom + 8;
  } else if (caretTop - menuHeight - 8 >= 8) {
    placedTop = caretTop - menuHeight - 8;
  } else {
    placedTop = caretBottom + 8 <= window.innerHeight ? caretBottom + 8 : Math.max(8, caretTop - menuHeight - 8);
  }
  const isBottom = placedTop + menuHeight > window.innerHeight - 8;

  const nodeName = node?.name || t("editor.image.title");

  return (
    <div
      ref={containerRef}
      className="his-context-menu image-mention-mode-menu"
      data-picker="true"
      role="menu"
      aria-label={t("editor.image.type")}
      style={{
        position: "fixed",
        top: placedTop,
        left: placedLeft,
      }}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div className="his-context-menu__label">
        {t("editor.image.type")}
      </div>

      <div className="his-context-menu__group">
        <button
          type="button"
          role="menuitem"
          className={`image-mention-mode-item${effectiveMode === "inserted" ? " is-active" : ""}`}
          onMouseEnter={() => handleModeChange("inserted")}
          onMouseDown={(event) => {
            event.preventDefault();
            onSelect("inserted");
          }}
          onClick={() => onSelect("inserted")}
        >
          <span className="image-mention-mode-item__icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2.5 4.5h13M2.5 9h4m5 0h4M2.5 13.5h13" />
              <rect x="7.5" y="7.5" width="4.5" height="3" rx="0.6" fill="currentColor" fillOpacity="0.2" />
            </svg>
          </span>
          <span className="image-mention-mode-item__content">
            <strong>{t("editor.image.inserted")}</strong>
            <small>{t("editor.image.insertedHint")}</small>
          </span>
        </button>

        <button
          type="button"
          role="menuitem"
          className={`image-mention-mode-item${effectiveMode === "full" ? " is-active" : ""}`}
          onMouseEnter={() => handleModeChange("full")}
          onMouseDown={(event) => {
            event.preventDefault();
            onSelect("full");
          }}
          onClick={() => onSelect("full")}
        >
          <span className="image-mention-mode-item__icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2.5" y="3" width="13" height="12" rx="2" />
              <circle cx="6" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
              <path d="M15.5 11.5l-3.5-3.5L4 15" />
            </svg>
          </span>
          <span className="image-mention-mode-item__content">
            <strong>{t("editor.image.full")}</strong>
            <small>{t("editor.image.fullHint")}</small>
          </span>
        </button>
      </div>

      <div className="his-context-menu__group">
        <button
          type="button"
          className="image-mention-mode-item image-mention-mode-item--cancel"
          onMouseDown={(event) => {
            event.preventDefault();
            onCancel();
          }}
          onClick={onCancel}
        >
          {t("common.actions.cancel")}
        </button>
      </div>

      <aside className={`image-mode-preview-card${isLeft ? " is-left" : ""}${isBottom ? " is-bottom" : ""}`} role="tooltip">
        <div className="image-mode-preview-card__screen">
          {effectiveMode === "inserted" ? (
            <div className="image-mode-preview__inline-sample">
              <span className="image-mode-preview__text-dim">...texto </span>
              <span className="image-mode-preview__inline-pill">
                {imageSrc ? (
                  <img src={imageSrc} alt="" className="image-mode-preview__pill-thumb" />
                ) : (
                  <span className="sidebar-icon node-type-icon node-type-icon--imagen" style={{ width: 13, height: 13, flex: "0 0 13px" }} />
                )}
                <span className="image-mode-preview__pill-name">{nodeName}</span>
              </span>
              <span className="image-mode-preview__text-dim"> texto...</span>
            </div>
          ) : (
            <div className="image-mode-preview__full-sample">
              {imageSrc ? (
                <img src={imageSrc} alt="" className="image-mode-preview__full-thumb" />
              ) : (
                <div className="image-mode-preview__full-placeholder">
                  <span className="sidebar-icon node-type-icon node-type-icon--imagen" style={{ width: 36, height: 36 }} />
                </div>
              )}
            </div>
          )}
        </div>
        <strong className="image-mode-preview-card__title">
          {effectiveMode === "inserted" ? t("editor.image.inserted") : t("editor.image.full")}
        </strong>
        <p className="image-mode-preview-card__desc">
          {effectiveMode === "inserted" ? t("editor.image.helpInserted") : t("editor.image.helpFull")}
        </p>
      </aside>
    </div>
  );
}
