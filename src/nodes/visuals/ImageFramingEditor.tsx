import { useRef, useState } from "react";
import { useLocale } from "../../i18n/LocaleContext";
import { DEFAULT_IMAGE_PRESENTATION, imagePresentationGeometry, MAX_IMAGE_ZOOM, type ImagePresentation } from "../../utils/imagePresentation";
import "./imagePresentation.css";

export function ImageFramingEditor({ src, aspectRatio, initial, onApply, onCancel }: { src: string; aspectRatio: number; initial?: ImagePresentation; onApply: (value: ImagePresentation) => void; onCancel: () => void }) {
  const { t } = useLocale();
  const [draft, setDraft] = useState(initial ?? DEFAULT_IMAGE_PRESENTATION);
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const drag = useRef<{ id: number; x: number; y: number; start: ImagePresentation; width: number; height: number; ratio: number } | null>(null);
  const ratio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
  // Geometry in normalized frame units; modal pixels never enter persistence.
  const g = natural.width ? imagePresentationGeometry(natural.width, natural.height, ratio, 1, draft) : null;
  return <div className="his-image-framing">
    <p>{t("imageFraming.instructions")}</p>
    <div className="his-image-framing__stage">
      <div className="his-image-framing__frame" style={{ aspectRatio: ratio, width: `min(100%, ${Math.min(340, 320 * ratio)}px)` }} role="img" aria-label={t("imageFraming.preview")} onPointerDown={(e) => {
        if (!g || e.button !== 0) return;
        e.preventDefault(); e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId);
        const rect = e.currentTarget.getBoundingClientRect();
        drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, start: g.presentation, width: rect.width, height: rect.height, ratio };
      }} onPointerMove={(e) => {
        const d = drag.current; if (!d || e.pointerId !== d.id) return;
        const start = imagePresentationGeometry(natural.width, natural.height, d.ratio, 1, d.start);
        setDraft(imagePresentationGeometry(natural.width, natural.height, d.ratio, 1, { ...d.start, centerX: d.start.centerX - (e.clientX - d.x) / d.width * d.ratio / start.width, centerY: d.start.centerY - (e.clientY - d.y) / d.height / start.height }).presentation);
      }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}>
        <img src={src} alt="" draggable={false} onLoad={(e) => setNatural({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })} style={g ? { width: `${g.width / ratio * 100}%`, height: `${g.height * 100}%`, left: `${g.left / ratio * 100}%`, top: `${g.top * 100}%` } : { width: "100%" }} />
        <span className="his-image-framing__mask" aria-hidden="true" />
      </div>
    </div>
    <label className="his-image-framing__zoom"><span>−</span><input type="range" min="1" max={MAX_IMAGE_ZOOM} step="0.01" aria-label={t("imageFraming.zoom")} value={draft.zoom} disabled={!g} onChange={(e) => setDraft(imagePresentationGeometry(natural.width, natural.height, ratio, 1, { ...draft, zoom: Number(e.target.value) }).presentation)} /><span>+</span></label>
    <div className="his-image-framing__actions"><button type="button" onClick={onCancel}>{t("common.actions.cancel")}</button><button type="button" disabled={!g} onClick={() => g && onApply(g.presentation)}>{t("imageFraming.apply")}</button></div>
  </div>;
}
