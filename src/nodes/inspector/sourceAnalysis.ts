import { equalRanges, fastFingerprintRange, utf8ByteLengthRange } from "./bytes";
import type { ByteMetric, DuplicateResourceGroup, InspectedResource, ResourceRepresentation, StorageAnalysis } from "./types";

interface AttributeSpan { name: string; start: number; end: number; valueStart: number; valueEnd: number }
export interface SourceAnalysisResult {
  storage: Omit<StorageAnalysis, "visibleText">;
  resources: InspectedResource[];
  duplicateGroups: DuplicateResourceGroup[];
  duplicatedResourceBytes: number;
  parseableHtml: string;
}

const exact = (bytes: number, exclusive: boolean): ByteMetric => ({ bytes, exact: true, exclusive });
const RESOURCE_ATTRIBUTES = new Set(["src", "href", "poster", "data"]);
const EMBED_TAGS = new Set(["img", "video", "audio", "source", "iframe", "embed", "object"]);

function isSpace(code: number) { return code === 9 || code === 10 || code === 12 || code === 13 || code === 32; }
function smallValue(source: string, start: number, end: number, limit = 240): string | null {
  return end - start <= limit ? source.slice(start, end) : null;
}
function findTagEnd(source: string, start: number): number {
  let quote = 0;
  for (let index = start + 1; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    if (quote) { if (code === quote) quote = 0; }
    else if (code === 34 || code === 39) quote = code;
    else if (code === 62) return index + 1;
  }
  return source.length;
}
function parseAttributes(source: string, start: number, end: number): AttributeSpan[] {
  const attributes: AttributeSpan[] = [];
  let index = start;
  while (index < end) {
    while (index < end && (isSpace(source.charCodeAt(index)) || source.charCodeAt(index) === 47)) index += 1;
    if (index >= end || source.charCodeAt(index) === 62) break;
    const attributeStart = index;
    while (index < end && !isSpace(source.charCodeAt(index)) && ![47, 61, 62].includes(source.charCodeAt(index))) index += 1;
    const name = source.slice(attributeStart, index).toLowerCase();
    while (index < end && isSpace(source.charCodeAt(index))) index += 1;
    let valueStart = index;
    let valueEnd = index;
    if (source.charCodeAt(index) === 61) {
      index += 1;
      while (index < end && isSpace(source.charCodeAt(index))) index += 1;
      const quote = source.charCodeAt(index);
      if (quote === 34 || quote === 39) {
        index += 1;
        valueStart = index;
        while (index < end && source.charCodeAt(index) !== quote) index += 1;
        valueEnd = index;
        if (index < end) index += 1;
      } else {
        valueStart = index;
        while (index < end && !isSpace(source.charCodeAt(index)) && ![47, 62].includes(source.charCodeAt(index))) index += 1;
        valueEnd = index;
      }
    }
    if (name) attributes.push({ name, start: attributeStart, end: index, valueStart, valueEnd });
    else index += 1;
  }
  return attributes;
}
function rangeStartsWith(source: string, start: number, end: number, prefix: string): boolean {
  if (end - start < prefix.length) return false;
  for (let index = 0; index < prefix.length; index += 1) {
    if (source[start + index].toLowerCase() !== prefix[index]) return false;
  }
  return true;
}
function dataUrlDetails(source: string, start: number, end: number) {
  let comma = start;
  while (comma < end && source.charCodeAt(comma) !== 44) comma += 1;
  const headerEnd = Math.min(comma, start + 300);
  const header = source.slice(start + 5, headerEnd);
  const separator = header.indexOf(";");
  const mime = (separator >= 0 ? header.slice(0, separator) : header) || "text/plain";
  const base64 = /(?:^|;)base64(?:;|$)/i.test(header);
  const payloadStart = comma < end ? comma + 1 : end;
  if (base64) {
    let characters = 0;
    let padding = 0;
    let valid = true;
    for (let index = payloadStart; index < end; index += 1) {
      const code = source.charCodeAt(index);
      if (isSpace(code)) continue;
      characters += 1;
      if (!((code >= 65 && code <= 90) || (code >= 97 && code <= 122) || (code >= 48 && code <= 57) || code === 43 || code === 47 || code === 61)) valid = false;
    }
    for (let index = end - 1; index >= payloadStart && padding < 2; index -= 1) {
      const code = source.charCodeAt(index);
      if (isSpace(code)) continue;
      if (code === 61) padding += 1;
      else break;
    }
    return { mime, base64, payloadStart, payloadBytes: Math.max(0, Math.floor(characters * 3 / 4) - padding), payloadExact: valid && characters % 4 === 0 };
  }
  let payloadBytes = 0;
  for (let index = payloadStart; index < end; index += 1) {
    if (source.charCodeAt(index) === 37 && index + 2 < end && /^[0-9a-f]{2}$/i.test(source.slice(index + 1, index + 3))) { payloadBytes += 1; index += 2; }
    else {
      const code = source.charCodeAt(index);
      if (code < 0x80) payloadBytes += 1;
      else if (code < 0x800) payloadBytes += 2;
      else if (code >= 0xd800 && code <= 0xdbff && index + 1 < end) { payloadBytes += 4; index += 1; }
      else payloadBytes += 3;
    }
  }
  return { mime, base64, payloadStart, payloadBytes, payloadExact: true };
}
function representation(source: string, start: number, end: number): ResourceRepresentation {
  if (rangeStartsWith(source, start, end, "data:")) {
    let comma = start;
    while (comma < end && source.charCodeAt(comma) !== 44 && comma - start < 300) comma += 1;
    return /(?:^|;)base64(?:;|$)/i.test(source.slice(start + 5, comma)) ? "data-url-base64" : "data-url-percent";
  }
  if (rangeStartsWith(source, start, end, "blob:")) return "blob-url";
  if (rangeStartsWith(source, start, end, "http:") || rangeStartsWith(source, start, end, "https:")) return "external-url";
  if (rangeStartsWith(source, start, end, "his:") || rangeStartsWith(source, start, end, "resource:")) return "internal-reference";
  return "other-url";
}
function resourceFromAttribute(source: string, tag: string, attribute: AttributeSpan, attributes: AttributeSpan[], sequence: number): { resource: InspectedResource; data: ReturnType<typeof dataUrlDetails> | null } {
  const repr = representation(source, attribute.valueStart, attribute.valueEnd);
  const data = repr.startsWith("data-url") ? dataUrlDetails(source, attribute.valueStart, attribute.valueEnd) : null;
  const attr = (name: string) => attributes.find((item) => item.name === name);
  const safeAttr = (name: string) => { const item = attr(name); return item ? smallValue(source, item.valueStart, item.valueEnd) : null; };
  const style = safeAttr("style") ?? "";
  const styleDimension = (name: "width" | "height") => new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]{1,40})`, "i").exec(style)?.[1]?.trim() ?? null;
  return { resource: {
    id: `resource-${sequence}`,
    type: tag === "img" ? "image" : tag,
    representation: repr,
    mime: data?.mime ?? null,
    storedBytes: repr === "data-url-base64" ? attribute.valueEnd - attribute.valueStart : utf8ByteLengthRange(source, attribute.valueStart, attribute.valueEnd),
    payloadBytes: data?.payloadBytes ?? null,
    payloadExact: data?.payloadExact ?? false,
    sourceCharacters: attribute.valueEnd - attribute.valueStart,
    name: safeAttr("data-image-file-name") ?? safeAttr("title") ?? safeAttr("alt"),
    internalId: safeAttr("data-resource-id") ?? null,
    width: safeAttr("width") ?? styleDimension("width"),
    height: safeAttr("height") ?? styleDimension("height"),
    location: `<${tag}> #${sequence + 1}`,
    fingerprint: fastFingerprintRange(source, attribute.valueStart, attribute.valueEnd),
    valueStart: attribute.valueStart,
    valueEnd: attribute.valueEnd,
  }, data };
}

export function analyzeSource(source: string): SourceAnalysisResult {
  let htmlSourceTextBytes = 0;
  let htmlSyntaxBytes = 0;
  let hisMetadataBytes = 0;
  let attributeBytes = 0;
  let urlBytes = 0;
  let dataUrlBytes = 0;
  let base64SourceBytes = 0;
  let base64PayloadBytes = 0;
  let base64PayloadExact = true;
  let inlineStyleBytes = 0;
  let inlineSvgBytes = 0;
  const resources: InspectedResource[] = [];
  const svgStack: { start: number; sequence: number }[] = [];
  let index = 0;
  while (index < source.length) {
    const open = source.indexOf("<", index);
    if (open < 0) { htmlSourceTextBytes += utf8ByteLengthRange(source, index); break; }
    htmlSourceTextBytes += utf8ByteLengthRange(source, index, open);
    if (source.startsWith("<!--", open)) {
      const closeAt = source.indexOf("-->", open + 4);
      const end = closeAt < 0 ? source.length : closeAt + 3;
      const bytes = utf8ByteLengthRange(source, open, end);
      if (source.startsWith("<!--hisfuture-", open)) {
        hisMetadataBytes += bytes;
        if (source.startsWith("<!--hisfuture-pdf-resource:", open)) {
          const idMatch = /"resourceId"\s*:\s*"([A-Za-z0-9_-]{1,128})"/.exec(source.slice(open, Math.min(end, open + 4096)));
          resources.push({ id: `resource-${resources.length}`, type: "pdf", representation: "project-resource", mime: "application/pdf", storedBytes: bytes, payloadBytes: null, payloadExact: false, sourceCharacters: end - open, name: null, internalId: idMatch?.[1] ?? null, width: null, height: null, location: "metadata HIS", fingerprint: fastFingerprintRange(source, open, end), valueStart: open, valueEnd: end });
        } else if (source.startsWith("<!--hisfuture-image-resource:", open)) {
          const metadata = source.slice(open, Math.min(end, open + 8192));
          const idMatch = /"resourceId"\s*:\s*"([A-Za-z0-9_-]{1,128})"/.exec(metadata);
          const mimeMatch = /"mimeType"\s*:\s*"(image\/[A-Za-z0-9.+-]+)"/.exec(metadata);
          const nameMatch = /"fileName"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/.exec(metadata);
          let fileName: string | null = null;
          if (nameMatch) {
            try { fileName = JSON.parse(`"${nameMatch[1]}"`) as string; } catch { fileName = nameMatch[1]; }
          }
          resources.push({ id: `resource-${resources.length}`, type: "image", representation: "project-resource", mime: mimeMatch?.[1] ?? null, storedBytes: bytes, payloadBytes: null, payloadExact: false, sourceCharacters: end - open, name: fileName, internalId: idMatch?.[1] ?? null, width: null, height: null, location: "metadata HIS", fingerprint: fastFingerprintRange(source, open, end), valueStart: open, valueEnd: end });
        }
      } else htmlSyntaxBytes += bytes;
      index = end;
      continue;
    }
    const end = findTagEnd(source, open);
    htmlSyntaxBytes += utf8ByteLengthRange(source, open, end);
    let cursor = open + 1;
    const closing = source.charCodeAt(cursor) === 47;
    if (closing) cursor += 1;
    while (cursor < end && isSpace(source.charCodeAt(cursor))) cursor += 1;
    const nameStart = cursor;
    while (cursor < end && /[A-Za-z0-9:-]/.test(source[cursor])) cursor += 1;
    const tag = source.slice(nameStart, cursor).toLowerCase();
    if (!closing && tag) {
      const attributes = parseAttributes(source, cursor, end - 1);
      for (const attribute of attributes) {
        attributeBytes += utf8ByteLengthRange(source, attribute.start, attribute.end);
        if (attribute.name === "style") inlineStyleBytes += utf8ByteLengthRange(source, attribute.valueStart, attribute.valueEnd);
      }
      if (EMBED_TAGS.has(tag)) {
        const resourceAttribute = attributes.find((attribute) => RESOURCE_ATTRIBUTES.has(attribute.name));
        if (resourceAttribute && resourceAttribute.valueEnd > resourceAttribute.valueStart) {
          const { resource, data } = resourceFromAttribute(source, tag, resourceAttribute, attributes, resources.length);
          resources.push(resource);
          urlBytes += resource.storedBytes;
          if (resource.representation.startsWith("data-url")) {
            dataUrlBytes += resource.storedBytes;
            if (data?.base64) base64SourceBytes += resource.valueEnd - data.payloadStart;
            base64PayloadBytes += data?.payloadBytes ?? 0;
            if (data && !data.payloadExact) base64PayloadExact = false;
          }
        }
      }
      const resourceAttribute = EMBED_TAGS.has(tag) ? attributes.find((attribute) => RESOURCE_ATTRIBUTES.has(attribute.name)) : null;
      for (const attribute of attributes) if (attribute !== resourceAttribute && attribute.valueEnd - attribute.valueStart >= 65536) {
        resources.push({ id: `resource-${resources.length}`, type: "large-attribute", representation: "large-attribute", mime: null, storedBytes: utf8ByteLengthRange(source, attribute.valueStart, attribute.valueEnd), payloadBytes: null, payloadExact: false, sourceCharacters: attribute.valueEnd - attribute.valueStart, name: attribute.name, internalId: null, width: null, height: null, location: `<${tag}> @${attribute.name}`, fingerprint: fastFingerprintRange(source, attribute.valueStart, attribute.valueEnd), valueStart: attribute.valueStart, valueEnd: attribute.valueEnd });
      }
      if (tag === "svg") svgStack.push({ start: open, sequence: resources.length });
    } else if (closing && tag === "svg" && svgStack.length) {
      const svg = svgStack.pop()!;
      const bytes = utf8ByteLengthRange(source, svg.start, end);
      inlineSvgBytes += bytes;
      resources.push({ id: `resource-${resources.length}`, type: "svg", representation: "inline-svg", mime: "image/svg+xml", storedBytes: bytes, payloadBytes: bytes, payloadExact: true, sourceCharacters: end - svg.start, name: null, internalId: null, width: null, height: null, location: `<svg> #${svg.sequence + 1}`, fingerprint: fastFingerprintRange(source, svg.start, end), valueStart: svg.start, valueEnd: end });
    }
    index = end;
  }

  const duplicateGroups: DuplicateResourceGroup[] = [];
  const buckets = new Map<string, InspectedResource[]>();
  for (const resource of resources) {
    const key = `${resource.representation}:${resource.fingerprint}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(resource);
    buckets.set(key, bucket);
  }
  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue;
    const groups: InspectedResource[][] = [];
    for (const resource of bucket) {
      const group = groups.find((items) => equalRanges(source, items[0].valueStart, items[0].valueEnd, resource.valueStart, resource.valueEnd));
      if (group) group.push(resource); else groups.push([resource]);
    }
    for (const group of groups) if (group.length > 1) duplicateGroups.push({ resourceId: group[0].id, occurrences: group.length, storedBytesEach: group[0].storedBytes, duplicatedBytes: group[0].storedBytes * (group.length - 1) });
  }
  const duplicatedResourceBytes = duplicateGroups.reduce((total, group) => total + group.duplicatedBytes, 0);
  const totalBytes = utf8ByteLengthRange(source);
  const resourceStoredBytes = resources.reduce((total, resource) => total + resource.storedBytes, 0);
  const exclusiveSum = htmlSourceTextBytes + htmlSyntaxBytes + hisMetadataBytes;
  const embeddedRanges = resources.filter((resource) => resource.representation.startsWith("data-url")).sort((a, b) => a.valueStart - b.valueStart);
  const htmlParts: string[] = [];
  let htmlCursor = 0;
  for (const resource of embeddedRanges) {
    if (resource.valueStart < htmlCursor) continue;
    htmlParts.push(source.slice(htmlCursor, resource.valueStart), "data:,");
    htmlCursor = resource.valueEnd;
  }
  htmlParts.push(source.slice(htmlCursor));
  return {
    storage: {
      total: exact(totalBytes, true),
      htmlSourceText: exact(htmlSourceTextBytes, true),
      htmlSyntax: exact(htmlSyntaxBytes, true),
      hisMetadata: exact(hisMetadataBytes, true),
      unclassified: exact(Math.max(0, totalBytes - exclusiveSum), true),
      attributes: exact(attributeBytes, false),
      urls: exact(urlBytes, false),
      dataUrls: exact(dataUrlBytes, false),
      base64Source: exact(base64SourceBytes, false),
      base64Payload: { bytes: base64PayloadBytes, exact: base64PayloadExact, exclusive: false },
      inlineStyles: exact(inlineStyleBytes, false),
      inlineSvg: exact(inlineSvgBytes, false),
      resourceStoredBytes: exact(resourceStoredBytes, false),
    },
    resources,
    duplicateGroups,
    duplicatedResourceBytes,
    parseableHtml: htmlParts.join(""),
  };
}
