/** Focal point in original image coordinates; zoom is relative to cover. */
export interface ImagePresentation { centerX: number; centerY: number; zoom: number }
export const DEFAULT_IMAGE_PRESENTATION: ImagePresentation = { centerX: 0.5, centerY: 0.5, zoom: 1 };
export const MAX_IMAGE_ZOOM = 5;
export function parseImagePresentation(value: unknown): ImagePresentation | undefined {
  if (!value || typeof value !== "object") return undefined;
  const p = value as ImagePresentation;
  if (![p.centerX, p.centerY, p.zoom].every((n) => typeof n === "number" && Number.isFinite(n))) return undefined;
  return { centerX: Math.max(0, Math.min(1, p.centerX)), centerY: Math.max(0, Math.min(1, p.centerY)), zoom: Math.max(1, Math.min(MAX_IMAGE_ZOOM, p.zoom)) };
}
export function readSerializedImagePresentation(raw: string | undefined): ImagePresentation | undefined {
  try { return parseImagePresentation(JSON.parse(raw || "null")); } catch { return undefined; }
}
export function imagePresentationGeometry(imageWidth: number, imageHeight: number, frameWidth: number, frameHeight: number, input = DEFAULT_IMAGE_PRESENTATION) {
  const p = parseImagePresentation(input) ?? DEFAULT_IMAGE_PRESENTATION;
  const scale = Math.max(frameWidth / imageWidth, frameHeight / imageHeight) * p.zoom;
  const width = imageWidth * scale, height = imageHeight * scale;
  const centerX = Math.max(frameWidth / (2 * width), Math.min(1 - frameWidth / (2 * width), p.centerX));
  const centerY = Math.max(frameHeight / (2 * height), Math.min(1 - frameHeight / (2 * height), p.centerY));
  return { width, height, left: frameWidth / 2 - centerX * width, top: frameHeight / 2 - centerY * height, presentation: { centerX, centerY, zoom: p.zoom } };
}
