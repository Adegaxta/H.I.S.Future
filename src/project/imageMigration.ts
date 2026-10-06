import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { NodeItem } from "../types/nodes";
import { asErrorMessage, isDesktopRuntime } from "./runtime";

export interface MigrationReference {
  nodeId: string;
  nodeName: string;
  location: "active" | "trash";
  mentions: number;
  inlineCopies: number;
  blockIds: string[];
  expectedContentHash: string;
}

export interface MigrationImagePlan {
  imageNodeId: string;
  imageNodeName: string;
  location: "active" | "trash";
  fileName: string;
  mimeType: string;
  fileSize: number;
  base64Characters: number;
  calculatedHash: string;
  existingHash: string | null;
  targetResourceId: string;
  targetExtension: string;
  reusesResource: boolean;
  expectedContentHash: string;
  references: MigrationReference[];
}

export interface MigrationIssue {
  imageNodeId: string;
  imageNodeName: string;
  classification: "conflict" | "corrupt" | "unknown";
  reason: string;
  details: string[];
}

export interface ImageMigrationPlan {
  version: 1;
  planId: string;
  images: MigrationImagePlan[];
  alreadyModern: number;
  externalProvider: number;
  ambiguous: MigrationIssue[];
  corrupt: MigrationIssue[];
  unknown: MigrationIssue[];
  affectedPages: number;
  affectedMentions: number;
  estimate: {
    legacyBase64Characters: number;
    legacyBinaryBytes: number;
    estimatedReferenceBytesAfter: number;
  };
}

export interface ImageMigrationProgress {
  phase: "backup" | "resource" | "commit" | "done";
  current: number;
  total: number;
  imageName: string;
}

export interface ImageMigrationResult {
  nodes: NodeItem[];
  deletedNodes: NodeItem[];
  backupPath: string;
  migrated: number;
  alreadyModern: number;
  omitted: number;
  conflicts: number;
  failed: number;
  resourcesCreated: number;
  resourcesReused: number;
  base64CharactersRemoved: number;
  binaryBytes: number;
  backupMs: number;
  resourceMs: number;
  sqliteMs: number;
  totalMs: number;
}

export async function analyzeLegacyImageMigration(): Promise<ImageMigrationPlan> {
  if (!isDesktopRuntime()) throw new Error("La migración segura sólo está disponible en la aplicación de escritorio.");
  try {
    const plan = await invoke<ImageMigrationPlan>("analyze_legacy_image_migration");
    Object.freeze(plan.images);
    return Object.freeze(plan);
  } catch (error) {
    throw new Error(asErrorMessage(error));
  }
}

export async function migrateLegacyImages(plan: ImageMigrationPlan): Promise<ImageMigrationResult> {
  try {
    return await invoke<ImageMigrationResult>("migrate_legacy_images", { plan });
  } catch (error) {
    throw new Error(asErrorMessage(error));
  }
}

export async function cancelLegacyImageMigration(): Promise<void> {
  await invoke("cancel_legacy_image_migration");
}

export function listenImageMigrationProgress(handler: (progress: ImageMigrationProgress) => void): Promise<UnlistenFn> {
  return listen<ImageMigrationProgress>("image-migration-progress", (event) => handler(event.payload));
}
