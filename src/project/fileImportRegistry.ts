import { imageFileImportModule } from "../nodes/image/fileImport";
import { pdfFileImportModule } from "../nodes/pdf/fileImport";
import type { BaseNodeType } from "../types/nodes";
import type { FileImportDefinition, FileImportModule } from "./fileImportTypes";

const FILE_IMPORT_MODULES = [imageFileImportModule, pdfFileImportModule] as const;

const extensionOf = (fileName: string) => /\.([^.]+)$/.exec(fileName.toLowerCase())?.[1] ?? "";
const acceptsMime = (definition: FileImportDefinition, mimeType: string) =>
  definition.exactMimeTypes?.includes(mimeType) ||
  definition.mimePrefixes?.some((prefix) => mimeType.startsWith(prefix)) || false;
const acceptsFile = (definition: FileImportDefinition, file: File) =>
  acceptsMime(definition, file.type.toLowerCase()) || definition.extensions.includes(extensionOf(file.name));

export function createFileImportRegistry(modules: readonly FileImportModule[]) {
  const kinds = new Set<string>();
  const nodeTypes = new Set<BaseNodeType>();
  for (const module of modules) {
    if (kinds.has(module.definition.kind)) throw new Error(`Duplicate file import registration: ${module.definition.kind}`);
    if (nodeTypes.has(module.definition.nodeType)) throw new Error(`Duplicate Node resource registration: ${module.definition.nodeType}`);
    kinds.add(module.definition.kind);
    nodeTypes.add(module.definition.nodeType);
  }
  return {
    all: () => [...modules],
    match: (file?: File | null) => file ? modules.find((module) => acceptsFile(module.definition, file)) ?? null : null,
    acceptsDragMime: (mimeType: string) => mimeType === "" || modules.some((module) => acceptsMime(module.definition, mimeType.toLowerCase())),
  };
}

export const FILE_IMPORT_REGISTRY = createFileImportRegistry(FILE_IMPORT_MODULES);

export function fileImportAccept(nodeTypes?: readonly BaseNodeType[]): string {
  return FILE_IMPORT_REGISTRY.all()
    .filter((module) => !nodeTypes || nodeTypes.includes(module.definition.nodeType))
    .flatMap(({ definition }) => [
      ...definition.extensions.map((extension) => `.${extension}`),
      ...(definition.exactMimeTypes ?? []),
      ...(definition.mimePrefixes ?? []).map((prefix) => `${prefix}*`),
    ])
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(",");
}
