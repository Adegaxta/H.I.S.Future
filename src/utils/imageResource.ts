export interface ImageResourceInfo {
  src: string;
  fileName: string;
  fileSize: number | null;
  hash: string | null;
  extension: string;
  description: string;
}

export function getImageMimeType(src: string): string | null {
  if (!src.startsWith("data:")) return null;
  const separator = src.indexOf(",");
  if (separator < 0) return null;
  const metadata = src.slice(5, separator).split(";", 1)[0].trim().toLowerCase();
  return metadata || null;
}

export function getDataUrlByteSize(src: string): number | null {
  if (!src.startsWith("data:")) return null;
  const separator = src.indexOf(",");
  if (separator < 0) return null;
  const metadata = src.slice(5, separator);
  const data = src.slice(separator + 1);
  if (/;base64/i.test(metadata)) {
    const normalized = data.replace(/\s/g, "");
    const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
    return Math.max(0, Math.floor(normalized.length * 3 / 4) - padding);
  }
  try {
    return new TextEncoder().encode(decodeURIComponent(data)).byteLength;
  } catch {
    return null;
  }
}

export function getImageResourceInfo(content: string, fallbackName: string): ImageResourceInfo | null {
  const image = new DOMParser()
    .parseFromString(content, "text/html")
    .querySelector<HTMLImageElement>("img");
  if (!image) return null;
  const src = image.getAttribute("src");
  if (!src) return null;
  const fileName = image.dataset.imageFileName || fallbackName;
  const extension = fileName.includes(".")
    ? fileName.slice(fileName.lastIndexOf(".") + 1).toUpperCase()
    : "";
  const parsedSize = Number(image.dataset.imageSize);
  return {
    src,
    fileName,
    fileSize: Number.isFinite(parsedSize) && parsedSize >= 0 ? parsedSize : null,
    hash: image.dataset.imageHash || null,
    extension,
    description: image.dataset.imageDescription || "",
  };
}

export function createImageContent(
  src: string,
  fileName: string,
  fileSize: number,
  hash: string,
  description: string = "",
): string {
  const image = document.createElement("img");
  image.src = src;
  image.alt = fileName;
  image.dataset.imageFileName = fileName;
  image.dataset.imageSize = String(fileSize);
  image.dataset.imageHash = hash;
  image.dataset.imageDescription = description;
  return `<p>${image.outerHTML}</p>`;
}

export async function hashImageFile(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
