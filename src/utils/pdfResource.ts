export interface PdfResourceInfo {
  resourceId: string;
  fileName: string;
  fileSize: number;
  hash: string;
}

const PDF_META_PREFIX = "<!--hisfuture-pdf-resource:";
const PDF_META_SUFFIX = "-->";

export function createPdfContent(resource: PdfResourceInfo): string {
  return `${PDF_META_PREFIX}${JSON.stringify(resource)}${PDF_META_SUFFIX}<p><br></p>`;
}

export function getPdfResourceInfo(content: string): PdfResourceInfo | null {
  const start = content.indexOf(PDF_META_PREFIX);
  if (start < 0) return null;
  const end = content.indexOf(PDF_META_SUFFIX, start + PDF_META_PREFIX.length);
  if (end < 0) return null;
  try {
    const parsed = JSON.parse(content.slice(start + PDF_META_PREFIX.length, end)) as Partial<PdfResourceInfo>;
    if (
      typeof parsed.resourceId !== "string" ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(parsed.resourceId) ||
      typeof parsed.fileName !== "string" ||
      typeof parsed.fileSize !== "number" ||
      typeof parsed.hash !== "string"
    ) return null;
    return parsed as PdfResourceInfo;
  } catch {
    return null;
  }
}

