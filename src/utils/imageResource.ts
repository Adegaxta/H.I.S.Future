export interface ImageResourceInfo {
  src: string;
  fileName: string;
  fileSize: number | null;
  hash: string | null;
  extension: string;
  description: string;
  provenance: ImageProvenance | null;
}

export interface ImageProvenance {
  provider: string;
  resourceId: string;
  resourceUrl: string;
  providerUrl: string;
  creatorName: string;
  creatorUrl: string;
  creatorPortfolioUrl?: string;
  creatorInstagramUrl?: string;
  creatorTwitterUrl?: string;
  downloadLocation?: string;
}

function parseImageProvenance(value: string | undefined): ImageProvenance | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<ImageProvenance>;
    if (!parsed || typeof parsed !== "object" ||
      typeof parsed.provider !== "string" ||
      typeof parsed.resourceId !== "string" ||
      typeof parsed.resourceUrl !== "string" ||
      typeof parsed.providerUrl !== "string" ||
      typeof parsed.creatorName !== "string" ||
      typeof parsed.creatorUrl !== "string") return null;
    return {
      provider: parsed.provider,
      resourceId: parsed.resourceId,
      resourceUrl: parsed.resourceUrl,
      providerUrl: parsed.providerUrl,
      creatorName: parsed.creatorName,
      creatorUrl: parsed.creatorUrl,
      ...(typeof parsed.creatorPortfolioUrl === "string" ? { creatorPortfolioUrl: parsed.creatorPortfolioUrl } : {}),
      ...(typeof parsed.creatorInstagramUrl === "string" ? { creatorInstagramUrl: parsed.creatorInstagramUrl } : {}),
      ...(typeof parsed.creatorTwitterUrl === "string" ? { creatorTwitterUrl: parsed.creatorTwitterUrl } : {}),
      ...(typeof parsed.downloadLocation === "string" ? { downloadLocation: parsed.downloadLocation } : {}),
    };
  } catch {
    return null;
  }
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
    provenance: parseImageProvenance(image.dataset.imageProvenance),
  };
}

export function createImageContent(
  src: string,
  fileName: string,
  fileSize: number | null,
  hash: string | null,
  description: string = "",
  provenance: ImageProvenance | null = null,
): string {
  const image = document.createElement("img");
  image.src = src;
  image.alt = fileName;
  image.dataset.imageFileName = fileName;
  if (fileSize !== null) image.dataset.imageSize = String(fileSize);
  if (hash) image.dataset.imageHash = hash;
  image.dataset.imageDescription = description;
  if (provenance) image.dataset.imageProvenance = JSON.stringify(provenance);
  return `<p>${image.outerHTML}</p>`;
}

export async function hashImageFile(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
