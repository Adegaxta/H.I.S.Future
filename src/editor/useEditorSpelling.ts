import { useEffect, useRef, useState, type RefObject } from "react";
import type { Locale } from "../i18n/core";
import { addEditorDictionaryWord, checkEditorWord, getEditorWordAtPoint, type EditorWord } from "./spelling";
import { rangeBelongsToEditor } from "./inlineMarks";
import { useEditorSpellingHighlights } from "./useEditorSpellingHighlights";

export interface EditorSpellingMenu extends EditorWord { x: number; y: number; suggestions: string[] }
export function useEditorSpelling({ editorRef, nodeId, locale, enabled, replace }: {
  editorRef: RefObject<HTMLDivElement | null>; nodeId: string; locale: Locale; enabled: boolean;
  replace: (range: Range, suggestion: string) => void;
}) {
  useEditorSpellingHighlights(editorRef, nodeId, locale, enabled);
  const [menu, setMenu] = useState<EditorSpellingMenu | null>(null);
  const requestId = useRef(0);
  const close = () => { requestId.current++; setMenu(null); };
  useEffect(() => {
    close();
    const pointer = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest(".his-spelling-menu")) close();
    };
    const cancel = () => close();
    document.addEventListener("pointerdown", pointer, true);
    document.addEventListener("keydown", cancel, true);
    editorRef.current?.addEventListener("input", cancel);
    const editor = editorRef.current;
    return () => {
      requestId.current++;
      document.removeEventListener("pointerdown", pointer, true);
      document.removeEventListener("keydown", cancel, true);
      editor?.removeEventListener("input", cancel);
    };
  }, [nodeId, locale, editorRef]);
  const request = (x: number, y: number, fallback: () => void): boolean => {
    const editor = editorRef.current;
    if (!editor || !enabled) return false;
    const hit = getEditorWordAtPoint(editor, x, y, locale);
    if (!hit) return false;
    const token = ++requestId.current;
    void checkEditorWord(hit.word, locale).then((result) => {
      if (requestId.current !== token || !rangeBelongsToEditor(hit.range, editor) || hit.range.toString() !== hit.word) return;
      if (!result.supported || !result.misspelled) { fallback(); return; }
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(hit.range.cloneRange());
      setMenu({ ...hit, x, y, suggestions: result.suggestions });
    }).catch((error) => {
      console.warn("Spelling check unavailable", error);
      if (requestId.current === token) fallback();
    });
    return true;
  };
  const correct = (suggestion: string) => {
    const editor = editorRef.current;
    if (menu && editor && rangeBelongsToEditor(menu.range, editor) && menu.range.toString() === menu.word) replace(menu.range, suggestion);
    close();
  };
  const add = async () => {
    if (!menu) return;
    const token = requestId.current;
    await addEditorDictionaryWord(menu.word, locale);
    // Ask every open editor to recheck against the updated personal dictionary.
    document.querySelectorAll<HTMLElement>("[spellcheck='true']").forEach((editor) => {
      editor.spellcheck = false;
      editor.spellcheck = true;
    });
    if (requestId.current === token) close();
  };
  return { menu, request, correct, add, close };
}
