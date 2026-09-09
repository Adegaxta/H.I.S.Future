import type { BaseNodeType } from "../defs/nodeTypes";
import type { NodeItem } from "../types/nodes";
import { getChildren } from "../utils/nodeTree";
import { FILE_IMPORT_REGISTRY } from "./fileImportRegistry";
import type { FileNodeImporterContext } from "./fileImportTypes";
import { FileNodeImportError } from "./fileImportTypes";

export { FileNodeImportError } from "./fileImportTypes";

export function getImportableFileKind(file?: File | null): string | null {
  return FILE_IMPORT_REGISTRY.match(file)?.definition.kind ?? null;
}

export const isImportableDragItem = (item: DataTransferItem) =>
  item.kind === "file" && FILE_IMPORT_REGISTRY.acceptsDragMime(item.type);

export function findImportableFile(dataTransfer: DataTransfer): File | null {
  return Array.from(dataTransfer.files).find((file) => FILE_IMPORT_REGISTRY.match(file)) ??
    Array.from(dataTransfer.items)
      .map((item) => item.getAsFile())
      .find((file): file is File => Boolean(file && FILE_IMPORT_REGISTRY.match(file))) ?? null;
}

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
  const module = FILE_IMPORT_REGISTRY.match(file);
  if (!module) throw new FileNodeImportError("fileImport.unsupported");

  const prepared = await module.prepare(file, context);
  if ("existing" in prepared) return prepared.existing;
  try {
    const { name, type, content } = prepared.draft;
    const id = context.createNode(name, type, parentId, content);
    return importedNode(context, id, name, type, parentId, content);
  } catch (error) {
    await prepared.rollback?.().catch(() => undefined);
    console.error(error);
    throw new FileNodeImportError("fileImport.failed");
  }
}
