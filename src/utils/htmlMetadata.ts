// JSON embedded in an HTML comment must never contain a comment terminator.
export function stringifyHtmlMetadata(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
}
