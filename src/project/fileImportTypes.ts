import type { BaseNodeType } from "../defs/nodeTypes";
import type { TranslationKey } from "../i18n/translations";
import type { NodeItem } from "../types/nodes";

export type FileStorageStrategy = "inline" | "project-resource";

export class FileNodeImportError extends Error {
  constructor(public readonly translationKey: TranslationKey) {
    super(translationKey);
  }
}

export interface FileNodeImporterContext {
  nodes: NodeItem[];
  createNode: (name: string, type: BaseNodeType, parentId: string | null, content?: string) => string;
}

export type PreparedFileNode =
  | { existing: NodeItem }
  | { draft: { name: string; type: BaseNodeType; content: string }; rollback?: () => Promise<void> };

export interface FileImportDefinition {
  kind: string;
  nodeType: BaseNodeType;
  storage: FileStorageStrategy;
  extensions: readonly string[];
  exactMimeTypes?: readonly string[];
  mimePrefixes?: readonly string[];
}

export interface FileImportModule {
  definition: FileImportDefinition;
  prepare(file: File, context: FileNodeImporterContext): Promise<PreparedFileNode>;
}
