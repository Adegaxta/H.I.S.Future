import { imagePresentationGeometry, type ImagePresentation } from "./imagePresentation";

/** Square image icons rendered inside documentary HTML (mentions / globe). */
export function applyDomImagePresentation(image: HTMLImageElement, presentation: ImagePresentation | undefined, className?: string): void {
  if (!presentation) return;
  let frame = image.parentElement;
  if (!frame?.classList.contains("his-presented-image")) {
    frame = document.createElement("span");
    frame.className = `his-presented-image ${className ?? image.className}`;
    if (image.dataset.mentionNodeVisual) frame.dataset.mentionNodeVisual = image.dataset.mentionNodeVisual;
    if (image.dataset.noResize) frame.dataset.noResize = image.dataset.noResize;
    image.before(frame); frame.appendChild(image); image.className = "";
  }
  const update = () => {
    if (!image.naturalWidth) return;
    const g = imagePresentationGeometry(image.naturalWidth, image.naturalHeight, 1, 1, presentation);
    Object.assign(image.style, { position: "absolute", width: `${g.width * 100}%`, height: `${g.height * 100}%`, left: `${g.left * 100}%`, top: `${g.top * 100}%`, maxWidth: "none", maxHeight: "none", margin: "0", transform: "none", objectFit: "fill" });
  };
  image.onload = update; update();
}
