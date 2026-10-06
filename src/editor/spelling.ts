import { invoke } from "@tauri-apps/api/core";
import type { Locale } from "../i18n/core";
import { isDesktopRuntime } from "../project/runtime";

export interface SpellingResult { supported: boolean; misspelled: boolean; suggestions: string[]; native: boolean }
export interface EditorWord { word: string; range: Range }

export function getEditorWordAtPoint(editor: HTMLElement, x: number, y: number, locale: Locale): EditorWord | null {
  const caret = document.caretRangeFromPoint(x, y);
  const node = caret?.startContainer;
  if (!caret || !node || node.nodeType !== Node.TEXT_NODE || !editor.contains(node) ||
      node.parentElement?.closest("[data-mention-id], [data-editor-ui], [data-page-index], [data-globe-icon]")) return null;
  const block = node.parentElement?.closest("p, h1, h2, h3, h4, h5, h6, blockquote, li, pre") ?? editor;
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  const nodes: Array<{ node: Node; start: number; end: number }> = [];
  let text = "";
  let cursorOffset = -1;
  while (walker.nextNode()) {
    const current = walker.currentNode;
    const start = text.length;
    text += current.textContent ?? "";
    nodes.push({ node: current, start, end: text.length });
    if (current === node) cursorOffset = start + caret.startOffset;
  }
  if (cursorOffset < 0) return null;
  const segments = new Intl.Segmenter(locale, { granularity: "word" }).segment(text);
  for (const segment of segments) {
    if (!segment.isWordLike || segment.index > cursorOffset || segment.index + segment.segment.length < cursorOffset) continue;
    const start = nodes.find((entry) => entry.end > segment.index);
    const endOffset = segment.index + segment.segment.length;
    const end = nodes.find((entry) => entry.end >= endOffset);
    if (!start || !end) continue;
    const range = document.createRange();
    range.setStart(start.node, segment.index - start.start);
    range.setEnd(end.node, endOffset - end.start);
    if (Array.from(block.querySelectorAll("[data-mention-id], [data-editor-ui], [data-globe-icon]")).some((item) => range.intersectsNode(item))) return null;
    if (!Array.from(range.getClientRects()).some((rect) => x >= rect.left - 1 && x <= rect.right + 1 && y >= rect.top && y <= rect.bottom)) continue;
    return { word: segment.segment, range };
  }
  return null;
}

const PERSONAL_DICTIONARY_KEY = "his.editor.personal-dictionary.v1";
const nativeSupport = new Map<Locale, Promise<boolean>>();
const spellers = new Map<Locale, Promise<import("nspell")>>();

function personalWords(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(PERSONAL_DICTIONARY_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((word): word is string => typeof word === "string" && word.length > 0 && word.length <= 256) : [];
  } catch { return []; }
}
export function isPersonalWord(word: string): boolean {
  return personalWordSet().has(word.normalize("NFC").toLowerCase());
}
export function personalWordSet(): Set<string> {
  return new Set(personalWords().map((entry) => entry.normalize("NFC").toLowerCase()));
}
export function usesNativeSpelling(locale: Locale): Promise<boolean> {
  if (!isDesktopRuntime()) return Promise.resolve(false);
  let known = nativeSupport.get(locale);
  if (!known) {
    known = invoke<{ supported: boolean }>("get_spelling_suggestions", { word: locale === "es" ? "hola" : "hello", locale })
      .then((result) => result.supported).catch(() => false);
    nativeSupport.set(locale, known);
  }
  return known;
}
export function getBundledSpeller(locale: Locale): Promise<import("nspell")> {
  let known = spellers.get(locale);
  if (!known) {
    known = (async () => {
      const [{ default: nspell }, [{ default: aff }, { default: dic }]] = await Promise.all([
        import("nspell"),
        locale === "es" ? Promise.all([import("../../node_modules/dictionary-es/index.aff?raw"), import("../../node_modules/dictionary-es/index.dic?raw")])
          : Promise.all([import("../../node_modules/dictionary-en/index.aff?raw"), import("../../node_modules/dictionary-en/index.dic?raw")]),
      ]);
      const checker = nspell(aff, dic);
      personalWords().forEach((word) => checker.add(word));
      return checker;
    })();
    spellers.set(locale, known);
  }
  return known;
}
export async function checkEditorWord(word: string, locale: Locale): Promise<SpellingResult> {
  if (isPersonalWord(word)) return { supported: true, misspelled: false, suggestions: [], native: false };
  if (await usesNativeSpelling(locale)) {
    const result = await invoke<Omit<SpellingResult, "native">>("get_spelling_suggestions", { word, locale });
    return { ...result, native: true };
  }
  const checker = await getBundledSpeller(locale);
  const misspelled = !checker.correct(word);
  return { supported: true, misspelled, suggestions: misspelled ? checker.suggest(word).slice(0, 8) : [], native: false };
}
export async function addEditorDictionaryWord(word: string, _locale: Locale): Promise<void> {
  const words = personalWords();
  if (!isPersonalWord(word)) words.push(word.normalize("NFC"));
  localStorage.setItem(PERSONAL_DICTIONARY_KEY, JSON.stringify(words));
  await Promise.all(Array.from(spellers.values(), async (pending) => (await pending).add(word)));
  if (isDesktopRuntime()) {
    // Mirror into available Windows dictionaries so native red underlines agree.
    await Promise.allSettled((["es", "en"] as const).map(async (locale) => {
      if (await usesNativeSpelling(locale)) await invoke("add_spelling_word", { word, locale });
    }));
  }
  window.dispatchEvent(new Event("his-personal-dictionary-change"));
}
