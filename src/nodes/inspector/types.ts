import type { getCalendarMeta, getTempoMeta } from "../../utils/temporalMeta";
import type { getPageMeta } from "../../utils/pageMeta";
import type { getPdfResourceInfo } from "../../utils/pdfResource";
import type { getImageResourceDescriptor } from "../../utils/imageResource";
import type { getNodalMeta } from "../metadata";
import type { NodeItem } from "../../types/nodes";

export interface ByteMetric {
  bytes: number;
  exact: boolean;
  exclusive: boolean;
}

export type ResourceRepresentation = "data-url-base64" | "data-url-percent" | "blob-url" | "external-url" | "internal-reference" | "project-resource" | "inline-svg" | "large-attribute" | "other-url";

export interface InspectedResource {
  id: string;
  type: string;
  representation: ResourceRepresentation;
  mime: string | null;
  storedBytes: number;
  payloadBytes: number | null;
  payloadExact: boolean;
  sourceCharacters: number;
  name: string | null;
  internalId: string | null;
  width: string | null;
  height: string | null;
  location: string;
  fingerprint: string;
  valueStart: number;
  valueEnd: number;
}

export interface DuplicateResourceGroup {
  resourceId: string;
  occurrences: number;
  storedBytesEach: number;
  duplicatedBytes: number;
}

export interface StorageAnalysis {
  total: ByteMetric;
  htmlSourceText: ByteMetric;
  htmlSyntax: ByteMetric;
  hisMetadata: ByteMetric;
  unclassified: ByteMetric;
  visibleText: ByteMetric;
  attributes: ByteMetric;
  urls: ByteMetric;
  dataUrls: ByteMetric;
  base64Source: ByteMetric;
  base64Payload: ByteMetric;
  inlineStyles: ByteMetric;
  inlineSvg: ByteMetric;
  resourceStoredBytes: ByteMetric;
}

export interface MentionInspection {
  targetId: string;
  broken: boolean;
  block: number | null;
  fragment: string;
}

export interface HeadingInspection {
  level: number;
  text: string;
  order: number;
  block: number | null;
}

export interface LinkInspection {
  href: string;
  text: string;
  order: number;
  block: number | null;
}

export type ImageInspectionRole = "content" | "mention-visual" | "block-icon";

export interface ImageInspection {
  alt: string | null;
  title: string | null;
  fileName: string | null;
  resourceId: string | null;
  source: string | null;
  role: ImageInspectionRole;
  order: number;
  block: number | null;
}

export interface TableInspection {
  rows: number;
  columns: number;
  headers: string[];
  textSample: string;
  order: number;
  block: number | null;
}

export interface StructureAnalysis {
  editorBlocks: number;
  rootElements: number;
  domElements: number;
  textNodes: number;
  maxDomDepth: number;
  averageDomDepth: number;
  contentEditableElements: number;
  headings: number;
  paragraphs: number;
  listItems: number;
  lists: number;
  tables: number;
  tableRows: number;
  tableCells: number;
  images: number;
  links: number;
  globes: number;
  pageIndexes: number;
  syncedBlocks: number;
  columns: number;
  columnLayouts: number;
  embeds: number;
  editorUiElements: number;
  transientEditorAttributes: number;
}

export interface InspectionTimings {
  storageAndResourcesMs: number;
  parseHtmlMs: number;
  domAnalysisMs: number;
  relationsMs: number;
  totalMs: number;
}

export interface DiagnosticFact {
  code: "data-url-share" | "duplicate-resource" | "persisted-editor-ui" | "persisted-transient-state" | "persisted-runtime-url" | "storage-vs-text" | "broken-mentions" | "broken-relations";
  value: number;
  secondary?: number;
}

export interface NodeInspection {
  htmlCharacters: number;
  textCharacters: number;
  textCharactersNoSpaces: number;
  words: number;
  estimatedPages: number;
  readingMinutes: number;
  structure: StructureAnalysis;
  storage: StorageAnalysis;
  resources: InspectedResource[];
  topResources: InspectedResource[];
  duplicateGroups: DuplicateResourceGroup[];
  duplicatedResourceBytes: number;
  uniqueResources: number;
  referencedResources: number;
  embeddedResources: number;
  mentions: MentionInspection[];
  uniqueMentions: number;
  repeatedMentions: number;
  brokenMentionIds: string[];
  outgoingRelations: number;
  incomingRelations: number;
  incoming: { sourceId: string; role: string }[];
  brokenRelationIds: string[];
  children: number;
  descendants: number;
  depth: number;
  siblings: number;
  parent: NodeItem | null;
  diagnostics: DiagnosticFact[];
  timings: InspectionTimings;
  performance: Record<string, number> | null;
  pageMeta: ReturnType<typeof getPageMeta> | null;
  pdfResource: ReturnType<typeof getPdfResourceInfo>;
  imageResource: ReturnType<typeof getImageResourceDescriptor>;
  calendarMeta: ReturnType<typeof getCalendarMeta> | null;
  tempoMeta: ReturnType<typeof getTempoMeta> | null;
  nodalMeta: ReturnType<typeof getNodalMeta>;
}
