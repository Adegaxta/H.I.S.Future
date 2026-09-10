import { useEffect, useRef, useState } from "react";
import type { NodeItem } from "../../types/nodes";
import NodeTypeLabel from "../../components/NodeTypeLabel";
import { getImageResourceInfo } from "../../utils/imageResource";
import { DEFAULT_PAGE_META, getPageBlockWidthPercent, getPageMeta, setPageMeta, type PageMeta } from "../../utils/pageMeta";
import { useNodeScopedEditorHistory } from "../../editor/useEditorHistory";
import { isEditableElement } from "../../utils/dom";
import { useLocale } from "../../i18n/LocaleContext";
import UnsplashImagePicker from "../../integrations/unsplash/UnsplashImagePicker";
import type { UnsplashImageSelection } from "../../integrations/unsplash/types";

interface PageNodeHeaderProps {
  node: NodeItem;
  nodes: NodeItem[];
  onContentChange: (id: string, content: string) => void;
  onRename: (id: string, name: string) => void;
  onImageFileUpload: (file: File) => Promise<string | null>;
  onUnsplashImageSelect: (selection: UnsplashImageSelection) => Promise<string | null>;
}

type ImageChoice = "iconNodeId" | "coverNodeId";

export default function PageNodeHeader({
  node,
  nodes,
  onContentChange,
  onRename,
  onImageFileUpload,
  onUnsplashImageSelect,
}: PageNodeHeaderProps) {
  const { t } = useLocale();
  const [meta, setMeta] = useState<PageMeta>(() => getPageMeta(node.content));
  const [choice, setChoice] = useState<ImageChoice | null>(null);
  const [choiceTab, setChoiceTab] = useState<"local" | "unsplash">("local");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [headerPositionOpen, setHeaderPositionOpen] = useState(false);
  const [textPositionOpen, setTextPositionOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(node.name);
  const history = useNodeScopedEditorHistory<PageMeta>(node.id, 50);
  const metaRef = useRef(meta);
  const descriptionStartRef = useRef<PageMeta | null>(null);
  const settingsRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const next = getPageMeta(node.content);
    setMeta(next);
    metaRef.current = next;
  }, [node.content]);

  useEffect(() => {
    setEditingTitle(false);
    setTitleDraft(node.name);
  }, [node.id, node.name]);

  useEffect(() => {
    setChoice(null);
    setChoiceTab("local");
    setSettingsOpen(false);
    setHeaderPositionOpen(false);
    setTextPositionOpen(false);
    descriptionStartRef.current = null;
  }, [node.id]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !["z", "y"].includes(event.key.toLowerCase())) return;
      if (event.defaultPrevented || event.isComposing || isEditableElement(event.target)) return;

      const isUndo = event.key.toLowerCase() === "z" && !event.shiftKey;
      const current = metaRef.current;
      const next = isUndo ? history.undo(current) : history.redo(current);
      if (next === undefined) return;

      event.preventDefault();
      event.stopPropagation();
      metaRef.current = next;
      setMeta(next);
      onContentChange(node.id, setPageMeta(node.content, next));
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [history, node.content, node.id, onContentChange]);

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
    history.push(metaRef.current);
    metaRef.current = next;
    setMeta(next);
    onContentChange(node.id, setPageMeta(node.content, next));
  };

  const chooseImage = (id: string) => {
    updateMeta({ ...meta, [choice || "iconNodeId"]: id });
    setChoice(null);
  };

  const chooseUnsplashImage = async (selection: UnsplashImageSelection) => {
    const id = await onUnsplashImageSelect(selection);
    if (id) chooseImage(id);
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

  const commitTitle = () => {
    const nextName = titleDraft.trim();
    if (nextName && nextName !== node.name) onRename(node.id, nextName);
    else setTitleDraft(node.name);
    setEditingTitle(false);
  };

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
                <NodeTypeLabel type="pagina" node={node} />
                <div className="page-node-header__actions">
                  <button type="button" onClick={() => setChoice("iconNodeId")} title={t("page.chooseIcon")}>{t("page.icon")}</button>
                  <button type="button" onClick={() => setChoice("coverNodeId")} title={t("page.chooseCover")}>{t("page.cover")}</button>
                  <button
                    type="button"
                    onClick={() => updateMeta({ ...meta, hideDescription: !meta.hideDescription })}
                    title={t("page.toggleDescription")}
                  >
                    {t(meta.hideDescription ? "page.showDescription" : "page.hideDescription")}
                  </button>
                  <span className="page-node-settings-anchor" ref={settingsRef}>
                    <button type="button" onClick={() => { setSettingsOpen((open) => !open); setHeaderPositionOpen(false); setTextPositionOpen(false); }} title={t("page.moreOptions")}>...</button>
                    {settingsOpen && (
                      <div className="page-node-settings">
                        {hasCustomSettings && (
                      <button type="button" onMouseEnter={() => { setHeaderPositionOpen(false); setTextPositionOpen(false); }} onClick={() => { updateMeta({ ...meta, ...DEFAULT_PAGE_META, description: meta.description, iconNodeId: meta.iconNodeId, coverNodeId: meta.coverNodeId }); setSettingsOpen(false); }}>
                            {t("page.resetLayout")}
                          </button>
                        )}
                        <label onMouseEnter={() => { setHeaderPositionOpen(false); setTextPositionOpen(false); }}>
                          {t("page.blockWidth")}
                          <input type="range" min="100" max="200" value={meta.blockWidth} onChange={(event) => updateMeta({ ...meta, blockWidth: Number(event.target.value) })} />
                          <span>{getPageBlockWidthPercent(meta)}%</span>
                        </label>
                        <div className="page-node-settings__position">
                          <button type="button" onMouseEnter={() => { setHeaderPositionOpen(true); setTextPositionOpen(false); }}>{t("page.headerPosition")}</button>
                          {headerPositionOpen && (
                            <div className="page-node-settings__position-menu">
                              {(["left", "center", "right"] as const).map((position) => (
                                <button type="button" key={position} onClick={() => { updateMeta({ ...meta, headerPosition: position }); setHeaderPositionOpen(false); setSettingsOpen(false); }}>
                                  {t(`page.position.${position}`)}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="page-node-settings__position">
                          <button type="button" onMouseEnter={() => { setTextPositionOpen(true); setHeaderPositionOpen(false); }}>{t("page.textPosition")}</button>
                          {textPositionOpen && (
                            <div className="page-node-settings__position-menu">
                              {(["left", "center", "right"] as const).map((position) => (
                                <button type="button" key={position} onClick={() => { updateMeta({ ...meta, textPosition: position }); setTextPositionOpen(false); setSettingsOpen(false); }}>
                                  {t(`page.position.${position}`)}
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
              {editingTitle ? (
                <input
                  className="editor-page__title page-node-header__title-input"
                  autoFocus
                  value={titleDraft}
                  aria-label={t("page.name")}
                  onChange={(event) => setTitleDraft(event.target.value)}
                  onFocus={(event) => event.currentTarget.select()}
                  onBlur={commitTitle}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      event.currentTarget.blur();
                    }
                    if (event.key === "Escape") {
                      setTitleDraft(node.name);
                      setEditingTitle(false);
                    }
                  }}
                />
              ) : (
                <h1
                  className="editor-page__title page-node-header__editable-title"
                  title={t("page.renameHint")}
                  onClick={() => setEditingTitle(true)}
                >
                  {node.name}
                </h1>
              )}
              {!meta.hideDescription && (
                <textarea
                  className="page-node-header__description"
                  value={meta.description}
                  onFocus={() => { descriptionStartRef.current = metaRef.current; }}
                  onChange={(event) => {
                    const next = { ...metaRef.current, description: event.target.value };
                    metaRef.current = next;
                    setMeta(next);
                  }}
                  onBlur={() => {
                    const start = descriptionStartRef.current;
                    const current = metaRef.current;
                    if (start && start.description !== current.description) history.push(start);
                    descriptionStartRef.current = null;
                    onContentChange(node.id, setPageMeta(node.content, current));
                  }}
                  placeholder={t("page.description.placeholder")}
                  aria-label={t("page.description")}
                  rows={1}
                />
              )}
            </div>
            </div>
          </div>
        </div>
      </div>

      {choice && (
        <div className="page-image-picker" role="dialog" aria-modal="true" aria-label={t("page.chooseImage")}>
          <div className="page-image-picker__panel">
            <div className="page-image-picker__header">
              <strong>{t(choice === "coverNodeId" ? "page.chooseCover" : "page.chooseIcon")}</strong>
              <button type="button" onClick={() => setChoice(null)} aria-label={t("common.actions.close")}>X</button>
            </div>
            <div className="page-image-picker__tabs" role="tablist">
              <button type="button" className={choiceTab === "local" ? "is-active" : ""} onClick={() => setChoiceTab("local")}>{t("page.localImages")}</button>
              <button type="button" className={choiceTab === "unsplash" ? "is-active" : ""} onClick={() => setChoiceTab("unsplash")}>{t("page.unsplash.tab")}</button>
            </div>
            {choiceTab === "local" ? (
              <>
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
                  {t("page.uploadImage")}
                  <input type="file" accept="image/*" onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadImage(file);
                    event.currentTarget.value = "";
                  }} />
                </label>
                {imageNodes.length === 0 && <div className="page-image-picker__empty">{t("page.noImages")}</div>}
              </>
            ) : (
              <UnsplashImagePicker onSelect={chooseUnsplashImage} />
            )}
            <button type="button" className="page-image-picker__delete" onClick={clearImage}>
              {t(choice === "coverNodeId" ? "page.removeCover" : "page.removeIcon")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
