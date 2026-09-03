import type { BaseNodeType } from "../defs/nodeTypes";
import type { TranslationKey } from "../i18n/translations";
import type { NodeItem } from "../types/nodes";
import { getChildren } from "../utils/nodeTree";
import {
  compressImageSource,
  createImageContent,
  getImageResourceInfo,
  hashImageFile,
} from "../utils/imageResource";
import { createPdfContent } from "../utils/pdfResource";
import { getDocument } from "../pdf/pdfjs";
import { deleteProjectResource, storeProjectResource } from "./resourceRepository";

export type ImportableFileKind = "image" | "pdf";

export class FileNodeImportError extends Error {
  constructor(public readonly translationKey: TranslationKey) {
    super(translationKey);
  }
}

const IMAGE_EXTENSIONS = [
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg",
  ".ico", ".avif", ".heic", ".heif", ".jfif",
];

export function getImportableFileKind(file?: File | null): ImportableFileKind | null {
  if (!file) return null;
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (file.type.startsWith("image/") || IMAGE_EXTENSIONS.some((extension) => name.endsWith(extension))) {
    return "image";
  }
  return null;
}

export const isImportableDragItem = (item: DataTransferItem) =>
  item.kind === "file" && (
    item.type === "" || item.type === "application/pdf" || item.type.startsWith("image/")
  );

export function findImportableFile(dataTransfer: DataTransfer): File | null {
  return Array.from(dataTransfer.files).find((file) => getImportableFileKind(file)) ??
    Array.from(dataTransfer.items)
      .map((item) => item.getAsFile())
      .find((file): file is File => Boolean(file && getImportableFileKind(file))) ??
    null;
}

interface FileNodeImporterContext {
  nodes: NodeItem[];
  createNode: (
    name: string,
    type: BaseNodeType,
    parentId: string | null,
    content?: string,
  ) => string;
}

const hashBytes = async (data: Uint8Array) => {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const importedNode = (
  context: FileNodeImporterContext,
  id: string,
  fileName: string,
  type: BaseNodeType,
  parentId: string | null,
  content: string,
): NodeItem => ({
  id,
  name: fileName.trim(),
  type,
  parentId,
  order: getChildren(context.nodes, parentId).length,
  content,
});

export async function importFileAsNode(
  file: File,
  parentId: string | null,
  context: FileNodeImporterContext,
): Promise<NodeItem> {
  const kind = getImportableFileKind(file);
  if (!kind) throw new FileNodeImportError("fileImport.unsupported");

  if (kind === "image") {
    const hash = await hashImageFile(file);
    const existing = context.nodes.find(
      (node) => node.type === "imagen" && (
        getImageResourceInfo(node.content, node.name)?.hash === hash ||
        getImageResourceInfo(node.content, node.name)?.fileName === file.name
      ),
    );
    if (existing) return existing;
    const source = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new FileNodeImportError("fileImport.failed"));
      reader.onerror = () => reject(new FileNodeImportError("fileImport.failed"));
      reader.readAsDataURL(file);
    });
    const content = createImageContent(
      await compressImageSource(source),
      file.name,
      file.size,
      hash,
      "",
    );
    const id = context.createNode(file.name, "imagen", parentId, content);
    return importedNode(context, id, file.name, "imagen", parentId, content);
  }

  const data = new Uint8Array(await file.arrayBuffer());
  let loadingTask: ReturnType<typeof getDocument> | null = null;
  try {
    loadingTask = getDocument({ data: data.slice() });
    await loadingTask.promise;
    await loadingTask.destroy();
  } catch (error) {
    if (loadingTask) await loadingTask.destroy().catch(() => undefined);
    console.error(error);
    throw new FileNodeImportError("fileImport.pdfInvalid");
  }

  const resourceId = crypto.randomUUID();
  const content = createPdfContent({
    resourceId,
    fileName: file.name,
    fileSize: file.size,
    hash: await hashBytes(data),
  });
  await storeProjectResource("pdf", resourceId, data);
  try {
    const id = context.createNode(file.name, "pdf", parentId, content);
    return importedNode(context, id, file.name, "pdf", parentId, content);
  } catch (error) {
    await deleteProjectResource("pdf", resourceId).catch(() => undefined);
    console.error(error);
    throw new FileNodeImportError("fileImport.failed");
  }
}
