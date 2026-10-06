import { EDITOR_TRANSIENT_BLOCK_ATTRIBUTES } from "./blockModel";

const EDITOR_PLACEHOLDER_ATTRIBUTE = "data-editor-placeholder";
const EDITOR_UI_ATTRIBUTE = "data-editor-ui";
const RUNTIME_IMAGE_ATTRIBUTE = "data-his-runtime-image";
const VOID_HTML_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
  "meta", "param", "source", "track", "wbr",
]);
const TRANSIENT_BLOCK_ATTRIBUTES = new Set<string>(EDITOR_TRANSIENT_BLOCK_ATTRIBUTES);

interface SerializedAttribute {
  name: string;
  value: string | null;
  source: string;
}

interface SerializedStartTag {
  html: string;
  isEditorUi: boolean;
  isVoid: boolean;
}

export interface EditorSerializationPhaseMetrics {
  serializationMs: number;
  transientCleanupMs: number;
}

function isHtmlWhitespace(character: string | undefined): boolean {
  return character === " " || character === "\n" || character === "\r" ||
    character === "\t" || character === "\f";
}

function isNameTerminator(character: string | undefined): boolean {
  return character === undefined || isHtmlWhitespace(character) || character === "=" ||
    character === "/" || character === ">";
}

function findTagEnd(html: string, start: number): number {
  let quote = "";
  for (let index = start + 1; index < html.length; index += 1) {
    const character = html[index];
    if (quote) {
      if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === ">") return index;
  }
  return -1;
}

function rewriteStartTag(tag: string): SerializedStartTag {
  let cursor = 1;
  while (isHtmlWhitespace(tag[cursor])) cursor += 1;
  const nameStart = cursor;
  while (cursor < tag.length && !isNameTerminator(tag[cursor])) cursor += 1;
  const tagName = tag.slice(nameStart, cursor).toLowerCase();
  const prefix = tag.slice(0, cursor);
  const attributes: SerializedAttribute[] = [];
  let suffix = "";

  while (cursor < tag.length) {
    const segmentStart = cursor;
    while (isHtmlWhitespace(tag[cursor])) cursor += 1;
    if (cursor >= tag.length || tag[cursor] === ">" || tag[cursor] === "/") {
      suffix = tag.slice(segmentStart);
      break;
    }

    const attributeNameStart = cursor;
    while (cursor < tag.length && !isNameTerminator(tag[cursor])) cursor += 1;
    const name = tag.slice(attributeNameStart, cursor).toLowerCase();
    while (isHtmlWhitespace(tag[cursor])) cursor += 1;
    let value: string | null = null;
    if (tag[cursor] === "=") {
      cursor += 1;
      while (isHtmlWhitespace(tag[cursor])) cursor += 1;
      const quote = tag[cursor] === '"' || tag[cursor] === "'" ? tag[cursor] : "";
      if (quote) {
        cursor += 1;
        const valueStart = cursor;
        while (cursor < tag.length && tag[cursor] !== quote) cursor += 1;
        value = tag.slice(valueStart, cursor);
        if (tag[cursor] === quote) cursor += 1;
      } else {
        const valueStart = cursor;
        while (cursor < tag.length && !isHtmlWhitespace(tag[cursor]) && tag[cursor] !== ">") cursor += 1;
        value = tag.slice(valueStart, cursor);
      }
    }
    const source = tag.slice(segmentStart, cursor);
    attributes.push({ name, value, source });
  }

  const hasTransientBlockState = attributes.some(({ name }) =>
    TRANSIENT_BLOCK_ATTRIBUTES.has(name),
  );
  const hasRuntimeImageSource = attributes.some(({ name }) => name === RUNTIME_IMAGE_ATTRIBUTE);
  const isEditorUi = attributes.some(({ name }) => name === EDITOR_UI_ATTRIBUTE);
  const persistedAttributes = attributes.filter(({ name, value }) => {
    if (name === EDITOR_UI_ATTRIBUTE || name === EDITOR_PLACEHOLDER_ATTRIBUTE) return false;
    if (name === RUNTIME_IMAGE_ATTRIBUTE) return false;
    if (hasRuntimeImageSource && name === "src") return false;
    if (TRANSIENT_BLOCK_ATTRIBUTES.has(name)) return false;
    if (name !== "contenteditable") return true;
    if (value?.toLowerCase() === "false") return true;
    return !hasTransientBlockState && value?.toLowerCase() !== "true";
  });

  return {
    html: `${prefix}${persistedAttributes.map(({ source }) => source).join("")}${suffix}`,
    isEditorUi,
    isVoid: VOID_HTML_ELEMENTS.has(tagName) || /\/\s*>$/u.test(tag),
  };
}

/**
 * Converts browser-owned editor HTML into document HTML without touching the
 * live DOM. A future dirty-block serializer can replace this boundary without
 * leaking editor UI state into persisted Node content.
 */
export function stripTransientEditorState(html: string): string {
  const output: string[] = [];
  let cursor = 0;
  let suppressedDepth = 0;

  while (cursor < html.length) {
    const tagStart = html.indexOf("<", cursor);
    if (tagStart < 0) {
      if (suppressedDepth === 0) output.push(html.slice(cursor));
      break;
    }
    if (suppressedDepth === 0) output.push(html.slice(cursor, tagStart));

    if (html.startsWith("<!--", tagStart)) {
      const commentEnd = html.indexOf("-->", tagStart + 4);
      const end = commentEnd < 0 ? html.length : commentEnd + 3;
      if (suppressedDepth === 0) output.push(html.slice(tagStart, end));
      cursor = end;
      continue;
    }

    const tagEnd = findTagEnd(html, tagStart);
    if (tagEnd < 0) {
      if (suppressedDepth === 0) output.push(html.slice(tagStart));
      break;
    }
    const tag = html.slice(tagStart, tagEnd + 1);
    const closing = /^<\s*\//u.test(tag);
    const declaration = /^<\s*[!?]/u.test(tag);

    if (declaration) {
      if (suppressedDepth === 0) output.push(tag);
    } else if (closing) {
      if (suppressedDepth > 0) suppressedDepth -= 1;
      else output.push(tag);
    } else {
      const rewritten = rewriteStartTag(tag);
      if (suppressedDepth > 0) {
        if (!rewritten.isVoid) suppressedDepth += 1;
      } else if (rewritten.isEditorUi) {
        if (!rewritten.isVoid) suppressedDepth = 1;
      } else {
        output.push(rewritten.html);
      }
    }
    cursor = tagEnd + 1;
  }

  return output.join("");
}

export function serializeEditorContent(
  editor: Pick<HTMLElement, "innerHTML">,
  reportMetrics?: (metrics: EditorSerializationPhaseMetrics) => void,
): string {
  if (!reportMetrics) return stripTransientEditorState(editor.innerHTML);
  const serializationStarted = performance.now();
  const interactiveHtml = editor.innerHTML;
  const serializationMs = performance.now() - serializationStarted;
  const cleanupStarted = performance.now();
  const content = stripTransientEditorState(interactiveHtml);
  reportMetrics({
    serializationMs,
    transientCleanupMs: performance.now() - cleanupStarted,
  });
  return content;
}
