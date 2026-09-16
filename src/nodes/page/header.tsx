import { lazy, startTransition, Suspense, useEffect, useRef, useState } from "react";
import type { NodeItem } from "../../types/nodes";
import NodeTypeLabel from "../../components/NodeTypeLabel";
import { getImageResourceInfo } from "../../utils/imageResource";
import { DEFAULT_PAGE_META, getPageBlockWidthPercent, getPageMeta, setPageMeta, type PageMeta } from "../../utils/pageMeta";
import { useNodeScopedEditorHistory } from "../../editor/useEditorHistory";
import { isEditableElement } from "../../utils/dom";
import { useLocale } from "../../i18n/LocaleContext";
import UnsplashImagePicker from "../../integrations/unsplash/UnsplashImagePicker";
import type { UnsplashImageSelection } from "../../integrations/unsplash/types";
import imageAsset from "../../assets/third-party/google-material/icons/image.svg";
import coverAsset from "../../assets/third-party/google-material/icons/image_inset.svg";
import descriptionAsset from "../../assets/third-party/google-material/icons/text_ad_off.svg";
import visibilityAsset from "../../assets/third-party/google-material/icons/hide_image.svg";
import sourceAsset from "../../assets/third-party/google-material/icons/hide_source.svg";
import moreAsset from "../../assets/third-party/google-material/icons/more_horiz.svg";
import { openWebUrl } from "../viewPrimitives";
import { NodeVisualRenderer } from "../visuals/NodeVisualRenderer";
import type { EmojiVisualStyle, IconVisualProvider, ResolvedNodeVisual } from "../visuals/types";
import { fileImportAccept } from "../../project/fileImportRegistry";

const EmojiPicker = lazy(() => import("../visuals/EmojiPicker").then((module) => ({ default: module.EmojiPicker })));
const IconPicker = lazy(() => import("../visuals/IconPicker").then((module) => ({ default: module.IconPicker })));
const IMAGE_FILE_ACCEPT = fileImportAccept(["imagen"]);

interface PageNodeHeaderProps {
  mode?: "interactive" | "print";
  node: NodeItem;
  nodes: NodeItem[];
  type?: NodeItem["type"];
  onContentChange: (id: string, content: string) => void;
  onRename: (id: string, name: string) => void;
  onImageFileUpload: (file: File) => Promise<string | null>;
  onUnsplashImageSelect: (selection: UnsplashImageSelection) => Promise<string | null>;
}

type ImageChoice = "iconNodeId" | "coverNodeId";
type ChoiceTab = "local" | "emoji" | "icon" | "unsplash";

export default function PageNodeHeader({
  mode = "interactive",
  node,
  nodes,
  type = "pagina",
  onContentChange,
  onRename,
  onImageFileUpload,
  onUnsplashImageSelect,
}: PageNodeHeaderProps) {
  const { t } = useLocale();
  const [meta, setMeta] = useState<PageMeta>(() => getPageMeta(node.content));
  const [choice, setChoice] = useState<ImageChoice | null>(null);
  const [choiceTab, setChoiceTab] = useState<ChoiceTab>("local");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [headerPositionOpen, setHeaderPositionOpen] = useState(false);
  const [textPositionOpen, setTextPositionOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(node.name);
  const history = useNodeScopedEditorHistory<PageMeta>(node.id, 50);
  const metaRef = useRef(meta);
  const descriptionStartRef = useRef<PageMeta | null>(null);
  const blockWidthStartRef = useRef<PageMeta | null>(null);
  const settingsRef = useRef<HTMLSpanElement>(null);
  const visibilityRef = useRef<HTMLSpanElement>(null);

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
    setVisibilityOpen(false);
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
    if (!settingsOpen && !visibilityOpen) return;
    const closeSettings = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!settingsRef.current?.contains(target) && !visibilityRef.current?.contains(target)) {
        setSettingsOpen(false);
        setVisibilityOpen(false);
        setHeaderPositionOpen(false);
        setTextPositionOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSettingsOpen(false);
        setVisibilityOpen(false);
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
  }, [settingsOpen, visibilityOpen]);

  const imageNodes = nodes.filter((item) => item.type === "imagen");
  const icon = meta.iconNodeId ? nodes.find((item) => item.id === meta.iconNodeId) : null;
  const cover = meta.coverNodeId ? nodes.find((item) => item.id === meta.coverNodeId) : null;
  const iconResource = icon ? getImageResourceInfo(icon.content, icon.name) : null;
  const coverResource = cover ? getImageResourceInfo(cover.content, cover.name) : null;
  const iconVisual: ResolvedNodeVisual | null = meta.iconVisual?.kind === "image"
    ? (iconResource ? { kind: "image", src: iconResource.src } : null)
    : meta.iconVisual;

  const updateMeta = (next: PageMeta) => {
    if (JSON.stringify(next) === JSON.stringify(metaRef.current)) return;
    history.push(metaRef.current);
    metaRef.current = next;
    setMeta(next);
    startTransition(() => onContentChange(node.id, setPageMeta(node.content, next)));
  };

  const chooseImage = (id: string, source?: "local" | "unsplash") => {
    if (choice === "iconNodeId") {
      const selectedNode = nodes.find((item) => item.id === id);
      const selectedResource = selectedNode ? getImageResourceInfo(selectedNode.content, selectedNode.name) : null;
      const imageSource = source ?? (selectedResource?.provenance?.provider === "unsplash" ? "unsplash" : "local");
      updateMeta({ ...metaRef.current, iconNodeId: id, iconVisual: { kind: "image", nodeId: id, source: imageSource } });
    } else {
      updateMeta({ ...metaRef.current, coverNodeId: id });
    }
    setChoice(null);
  };

  const chooseEmoji = (value: string, style: EmojiVisualStyle) => {
    updateMeta({ ...metaRef.current, iconNodeId: null, iconVisual: { kind: "emoji", value, style } });
    setChoice(null);
  };

  const chooseIcon = (provider: IconVisualProvider, name: string) => {
    updateMeta({ ...metaRef.current, iconNodeId: null, iconVisual: { kind: "icon", provider, name } });
    setChoice(null);
  };

  const chooseUnsplashImage = async (selection: UnsplashImageSelection) => {
    const id = await onUnsplashImageSelect(selection);
    if (id) chooseImage(id, "unsplash");
  };

  const uploadImage = async (file: File) => {
    const id = await onImageFileUpload(file);
    if (id) chooseImage(id, "local");
  };

  const clearImage = () => {
    if (!choice) return;
    updateMeta(choice === "iconNodeId"
      ? { ...metaRef.current, iconNodeId: null, iconVisual: null }
      : { ...metaRef.current, coverNodeId: null });
    setChoice(null);
  };

  const previewBlockWidth = (value: number, input: HTMLInputElement) => {
    if (!blockWidthStartRef.current) blockWidthStartRef.current = metaRef.current;
    const next = { ...metaRef.current, blockWidth: value };
    metaRef.current = next;
    setMeta(next);
    const editor = input.closest(".page-node-editor-surface")?.querySelector<HTMLElement>(".page-node-editor");
    if (editor) editor.style.width = `${getPageBlockWidthPercent(next)}%`;
  };

  const commitBlockWidth = () => {
    const start = blockWidthStartRef.current;
    blockWidthStartRef.current = null;
    const current = metaRef.current;
    if (!start || start.blockWidth === current.blockWidth) return;
    history.push(start);
    startTransition(() => onContentChange(node.id, setPageMeta(node.content, current)));
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
        {coverResource && !meta.hideCover && (
          <div
            className="page-node-header__cover has-image"
            style={{ backgroundImage: `url(${coverResource.src})` }}
          >
            {coverResource.provenance?.provider === "unsplash" && (
              <div className="page-node-header__cover-attribution">
                <span>{t("page.unsplash.photoBy")}</span>
                <button type="button" onClick={() => void openWebUrl(coverResource.provenance?.creatorUrl || "")}>{coverResource.provenance.creatorName}</button>
                <span>{t("page.unsplash.on")}</span>
                <button type="button" onClick={() => void openWebUrl(coverResource.provenance?.resourceUrl || "")}>{t("image.unsplash")}</button>
              </div>
            )}
          </div>
        )}
        <div className="page-node-header__content">
          <div className={`page-node-header__block page-node-header__block--${meta.headerPosition}`}>
            <div className={`page-node-header__title-row${iconVisual && !meta.hideIcon ? " has-icon" : ""}`}>
            {iconVisual && !meta.hideIcon && <NodeVisualRenderer visual={iconVisual} className="page-node-header__icon" />}
            <div className="page-node-header__title-content">
              <div className="page-node-header__type-row">
                {!meta.hideSource && <NodeTypeLabel type={type} node={node} />}
                  {mode === "interactive" && <div className="page-node-header__actions">
                  <span className="page-node-header__separator" aria-hidden="true" />
                  <button type="button" className="page-node-header__icon-button" onClick={() => { setChoiceTab("local"); setChoice("iconNodeId"); }} title={t("page.chooseIcon")} aria-label={t("page.chooseIcon")}><img src={imageAsset} alt="" /></button>
                  <button type="button" className="page-node-header__icon-button" onClick={() => { setChoiceTab("local"); setChoice("coverNodeId"); }} title={t("page.chooseCover")} aria-label={t("page.chooseCover")}><img src={coverAsset} alt="" /></button>
                  <button
                    type="button"
                    className={`page-node-header__icon-button${meta.hideDescription ? " is-active" : ""}`}
                    onClick={() => updateMeta({ ...metaRef.current, hideDescription: !metaRef.current.hideDescription })}
                    title={t("page.toggleDescription")}
                    aria-label={t("page.toggleDescription")}
                  >
                    <img src={descriptionAsset} alt="" />
                  </button>
                  <span className="page-node-header__separator" aria-hidden="true" />
                  <span className="page-node-settings-anchor" ref={visibilityRef}>
                    <button type="button" className={`page-node-header__icon-button${visibilityOpen ? " is-active" : ""}`} onClick={() => { setVisibilityOpen((open) => !open); setSettingsOpen(false); }} title={t("page.visibilityOptions")} aria-label={t("page.visibilityOptions")}><img src={visibilityAsset} alt="" /></button>
                    {visibilityOpen && (
                      <div className="page-node-visibility-menu" role="menu">
                        <button type="button" onClick={() => updateMeta({ ...metaRef.current, hideIcon: !metaRef.current.hideIcon })}>
                          <img src={imageAsset} alt="" />{t(meta.hideIcon ? "page.showIcon" : "page.hideIcon")}
                        </button>
                        <button type="button" onClick={() => updateMeta({ ...metaRef.current, hideCover: !metaRef.current.hideCover })}>
                          <img src={coverAsset} alt="" />{t(meta.hideCover ? "page.showCover" : "page.hideCover")}
                        </button>
                      </div>
                    )}
                  </span>
                  <button type="button" className={`page-node-header__icon-button${meta.hideSource ? " is-active" : ""}`} onClick={() => updateMeta({ ...metaRef.current, hideSource: !metaRef.current.hideSource })} title={t(meta.hideSource ? "page.showSource" : "page.hideSource")} aria-label={t(meta.hideSource ? "page.showSource" : "page.hideSource")}><img src={sourceAsset} alt="" /></button>
                  <span className="page-node-settings-anchor" ref={settingsRef}>
                    <button type="button" className={`page-node-header__icon-button${settingsOpen ? " is-active" : ""}`} onClick={() => { setSettingsOpen((open) => !open); setVisibilityOpen(false); setHeaderPositionOpen(false); setTextPositionOpen(false); }} title={t("page.moreOptions")} aria-label={t("page.moreOptions")}><img src={moreAsset} alt="" /></button>
                    {settingsOpen && (
                      <div className="page-node-settings">
                        {hasCustomSettings && (
                      <button type="button" onMouseEnter={() => { setHeaderPositionOpen(false); setTextPositionOpen(false); }} onClick={() => { updateMeta({ ...meta, ...DEFAULT_PAGE_META, description: meta.description, iconNodeId: meta.iconNodeId, iconVisual: meta.iconVisual, coverNodeId: meta.coverNodeId }); setSettingsOpen(false); }}>
                            {t("page.resetLayout")}
                          </button>
                        )}
                        <label onMouseEnter={() => { setHeaderPositionOpen(false); setTextPositionOpen(false); }}>
                          {t("page.blockWidth")}
                          <input
                            type="range"
                            min="100"
                            max="200"
                            value={meta.blockWidth}
                            onPointerDown={() => { blockWidthStartRef.current = metaRef.current; }}
                            onChange={(event) => previewBlockWidth(Number(event.target.value), event.currentTarget)}
                            onPointerUp={commitBlockWidth}
                            onKeyUp={(event) => {
                              if (["ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(event.key)) commitBlockWidth();
                            }}
                            onBlur={commitBlockWidth}
                          />
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
                </div>}
              </div>
              {mode === "print" ? <h1 className="editor-page__title page-node-header__title-input">{node.name}</h1> : editingTitle ? (
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
              {mode === "print" ? (!meta.hideDescription && meta.description ? <div className="page-node-header__description">{meta.description}</div> : null) : !meta.hideDescription && (
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
              {choice === "iconNodeId" && <button type="button" className={choiceTab === "emoji" ? "is-active" : ""} onClick={() => setChoiceTab("emoji")}>{t("page.emojis.tab")}</button>}
              {choice === "iconNodeId" && <button type="button" className={choiceTab === "icon" ? "is-active" : ""} onClick={() => setChoiceTab("icon")}>{t("page.icons.tab")}</button>}
              <button type="button" className={choiceTab === "unsplash" ? "is-active" : ""} onClick={() => setChoiceTab("unsplash")}>{t("page.unsplash.tab")}</button>
            </div>
            {choiceTab === "local" ? (
              <>
                <div className="page-image-picker__gallery">
                  <label className="page-image-picker__upload-card">
                    <span aria-hidden="true">+</span>
                    <strong>{t("page.uploadImage")}</strong>
                    <input type="file" accept={IMAGE_FILE_ACCEPT} onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadImage(file);
                      event.currentTarget.value = "";
                    }} />
                  </label>
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
                {imageNodes.length === 0 && <div className="page-image-picker__empty">{t("page.noImages")}</div>}
              </>
            ) : choiceTab === "emoji" ? (
              <Suspense fallback={<div className="page-image-picker__empty">{t("page.visuals.loading")}</div>}><EmojiPicker onSelect={chooseEmoji} /></Suspense>
            ) : choiceTab === "icon" ? (
              <Suspense fallback={<div className="page-image-picker__empty">{t("page.visuals.loading")}</div>}><IconPicker onSelect={chooseIcon} /></Suspense>
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
