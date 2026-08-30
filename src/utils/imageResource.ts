export interface ImageResourceInfo {
  src: string;
  fileName: string;
  fileSize: number | null;
  hash: string | null;
  extension: string;
  description: string;
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

export async function compressImageSource(
  src: string,
  options: {
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
  } = {},
): Promise<string> {
  const {
    maxWidth = 1600,
    maxHeight = 1600,
    quality = 0.72,
  } = options;

  if (!src.startsWith("data:image/")) return src;

  const mime = src.slice(5, src.indexOf(";", 5) >= 0 ? src.indexOf(";", 5) : src.length) || "image/png";
  if (mime === "image/svg+xml" || mime === "image/gif") return src;

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo cargar la imagen para comprimirla."));
    img.src = src;
  });

  const ratio = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
  const width = Math.max(1, Math.round(image.naturalWidth * ratio));
  const height = Math.max(1, Math.round(image.naturalHeight * ratio));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) return src;

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", quality);
  });

  if (!blob) return src;

  const compressed = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : src);
    reader.onerror = () => resolve(src);
    reader.readAsDataURL(blob);
  });

  if (compressed.length >= src.length) return src;
  return compressed;
}

export async function hashImageFile(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
