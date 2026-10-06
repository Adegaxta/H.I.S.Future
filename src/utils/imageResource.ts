import { stringifyHtmlMetadata } from "./htmlMetadata";

export interface ImageResourceInfo {
  storage: "inline" | "external";
  src: string;
  fileName: string;
  fileSize: number | null;
  hash: string | null;
  extension: string;
  description: string;
  provenance: ImageProvenance | null;
}

export interface ProjectImageResourceInfo {
  storage: "project-resource";
  version: 2;
  resourceId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  extension: string;
  hash: string;
  description: string;
  provenance: ImageProvenance | null;
}

export type ImageResourceDescriptor = ImageResourceInfo | ProjectImageResourceInfo;

const IMAGE_RESOURCE_PREFIX = "<!--hisfuture-image-resource:";
const IMAGE_RESOURCE_SUFFIX = "-->";

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
    storage: src.startsWith("data:image/") ? "inline" : "external",
    src,
    fileName,
    fileSize: Number.isFinite(parsedSize) && parsedSize >= 0 ? parsedSize : null,
    hash: image.dataset.imageHash || null,
    extension,
    description: image.dataset.imageDescription || "",
    provenance: parseImageProvenance(image.dataset.imageProvenance),
  };
}

function safeResourceExtension(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.toLowerCase() === "jpeg" || value.toLowerCase() === "jfif"
    ? "jpg"
    : value.toLowerCase();
  return /^[a-z0-9]{2,5}$/.test(normalized) ? normalized : null;
}

export function getProjectImageResourceInfo(content: string): ProjectImageResourceInfo | null {
  const start = content.indexOf(IMAGE_RESOURCE_PREFIX);
  if (start < 0) return null;
  const end = content.indexOf(IMAGE_RESOURCE_SUFFIX, start + IMAGE_RESOURCE_PREFIX.length);
  if (end < 0) return null;
  try {
    const parsed = JSON.parse(content.slice(start + IMAGE_RESOURCE_PREFIX.length, end)) as Partial<ProjectImageResourceInfo>;
    const extension = safeResourceExtension(parsed.extension);
    if (
      parsed.version !== 2 ||
      typeof parsed.resourceId !== "string" ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(parsed.resourceId) ||
      typeof parsed.fileName !== "string" ||
      typeof parsed.fileSize !== "number" ||
      !Number.isFinite(parsed.fileSize) || parsed.fileSize < 0 ||
      typeof parsed.mimeType !== "string" || !parsed.mimeType.startsWith("image/") ||
      typeof parsed.hash !== "string" || !/^[a-f0-9]{64}$/i.test(parsed.hash) ||
      !extension
    ) return null;
    return {
      storage: "project-resource",
      version: 2,
      resourceId: parsed.resourceId,
      fileName: parsed.fileName,
      fileSize: parsed.fileSize,
      mimeType: parsed.mimeType,
      extension,
      hash: parsed.hash.toLowerCase(),
      description: typeof parsed.description === "string" ? parsed.description : "",
      provenance: parseImageProvenance(parsed.provenance ? JSON.stringify(parsed.provenance) : undefined),
    };
  } catch {
    return null;
  }
}

export function getImageResourceDescriptor(content: string, fallbackName: string): ImageResourceDescriptor | null {
  return getProjectImageResourceInfo(content) ?? getImageResourceInfo(content, fallbackName);
}

export function createProjectImageContent(resource: Omit<ProjectImageResourceInfo, "storage" | "version">): string {
  const metadata: Omit<ProjectImageResourceInfo, "storage"> = { version: 2, ...resource };
  return `${IMAGE_RESOURCE_PREFIX}${stringifyHtmlMetadata(metadata)}${IMAGE_RESOURCE_SUFFIX}<p><br></p>`;
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
