import { lazy, Suspense, useState } from "react";
import { ImageFramingEditor } from "../visuals/ImageFramingEditor";
import type { ImagePresentation } from "../../utils/imagePresentation";
import { useLocale } from "../../i18n/LocaleContext";
import UnsplashImagePicker from "../../integrations/unsplash/UnsplashImagePicker";
import type { UnsplashImageSelection } from "../../integrations/unsplash/types";
import type { NodeItem } from "../../types/nodes";
import { useResolvedImageSource } from "../../utils/imageRuntimeResolver";
import { fileImportAccept } from "../../project/fileImportRegistry";
import type { EmojiVisualStyle, IconVisualProvider } from "../visuals/types";

const EmojiPicker = lazy(() => import("../visuals/EmojiPicker").then((module) => ({ default: module.EmojiPicker })));
const IconPicker = lazy(() => import("../visuals/IconPicker").then((module) => ({ default: module.IconPicker })));
const IMAGE_FILE_ACCEPT = fileImportAccept(["imagen"]);
type IconTab = "local" | "emoji" | "icon" | "unsplash";

function ImageThumbnail({ node, onSelect }: { node: NodeItem; onSelect: () => void }) {
  const resolved = useResolvedImageSource(node);
  return resolved.src ? <button type="button" onClick={onSelect} title={node.name}><img src={resolved.src} alt={node.name} /><span>{node.name}</span></button> : null;
}

interface IconCapabilityPickerProps {
  nodes: NodeItem[];
  tab: IconTab;
  onTabChange: (tab: IconTab) => void;
  onImageSelect: (id: string, presentation?: ImagePresentation, source?: "local" | "unsplash") => void;
  onImageUpload: (file: File) => Promise<string | null>;
  onUnsplashSelect: (selection: UnsplashImageSelection) => Promise<string | null>;
  aspectRatio?: number;
  currentImageId?: string | null;
  currentPresentation?: ImagePresentation;
  initialImageId?: string | null;
  allowSemanticIcons?: boolean;
  onEmojiSelect: (value: string, style: EmojiVisualStyle) => void;
  onIconSelect: (provider: IconVisualProvider, name: string) => void;
  onClear: () => void;
  clearLabel: string;
}

export function IconCapabilityPicker({
  nodes,
  tab,
  onTabChange,
  onImageSelect,
  onImageUpload,
  onUnsplashSelect,
  onEmojiSelect,
  onIconSelect,
  onClear,
  clearLabel,
  aspectRatio = 1, currentImageId, currentPresentation, initialImageId, allowSemanticIcons = true,
}: IconCapabilityPickerProps) {
  const { t } = useLocale();
  const [pending, setPending] = useState<{ id: string; source?: "local" | "unsplash" } | null>(() => initialImageId ? { id: initialImageId } : null);
  const pendingNode = nodes.find((n) => n.id === pending?.id && n.type === "imagen");
  const resolved = useResolvedImageSource(pendingNode);
  const imageNodes = nodes.filter((item) => item.type === "imagen");
  if (pending) return resolved.src ? <ImageFramingEditor key={pending.id} src={resolved.src} aspectRatio={aspectRatio} initial={pending.id === currentImageId ? currentPresentation : undefined} onCancel={() => setPending(null)} onApply={(presentation) => onImageSelect(pending.id, presentation, pending.source)} /> : <div className="page-image-picker__empty">{resolved.error?.message ?? t("imageFraming.loading")}<button type="button" onClick={() => setPending(null)}>{t("common.actions.cancel")}</button></div>;
  return (
    <>
      <div className="page-image-picker__tabs" role="tablist">
        <button type="button" className={tab === "local" ? "is-active" : ""} onClick={() => onTabChange("local")}>{t("page.localImages")}</button>
        {allowSemanticIcons && <button type="button" className={tab === "emoji" ? "is-active" : ""} onClick={() => onTabChange("emoji")}>{t("page.emojis.tab")}</button>}
        {allowSemanticIcons && <button type="button" className={tab === "icon" ? "is-active" : ""} onClick={() => onTabChange("icon")}>{t("page.icons.tab")}</button>}
        <button type="button" className={tab === "unsplash" ? "is-active" : ""} onClick={() => onTabChange("unsplash")}>{t("page.unsplash.tab")}</button>
      </div>
      {tab === "local" ? (
        <>
          <div className="page-image-picker__gallery">
            <label className="page-image-picker__upload-card">
              <span aria-hidden="true">+</span>
              <strong>{t("page.uploadImage")}</strong>
              <input type="file" accept={IMAGE_FILE_ACCEPT} onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void onImageUpload(file).then((id) => { if (id) setPending({ id, source: "local" }); });
                event.currentTarget.value = "";
              }} />
            </label>
            {imageNodes.map((imageNode) => <ImageThumbnail key={imageNode.id} node={imageNode} onSelect={() => setPending({ id: imageNode.id })} />)}
          </div>
          {imageNodes.length === 0 && <div className="page-image-picker__empty">{t("page.noImages")}</div>}
        </>
      ) : tab === "emoji" ? (
        <Suspense fallback={<div className="page-image-picker__empty">{t("page.visuals.loading")}</div>}><EmojiPicker onSelect={onEmojiSelect} /></Suspense>
      ) : tab === "icon" ? (
        <Suspense fallback={<div className="page-image-picker__empty">{t("page.visuals.loading")}</div>}><IconPicker onSelect={onIconSelect} /></Suspense>
      ) : (
        <UnsplashImagePicker onSelect={(selection) => { void onUnsplashSelect(selection).then((id) => { if (id) setPending({ id, source: "unsplash" }); }); }} />
      )}
      <button type="button" className="page-image-picker__delete" onClick={onClear}>{clearLabel}</button>
    </>
  );
}
