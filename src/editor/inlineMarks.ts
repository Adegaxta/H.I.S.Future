export type InlineFormatCommand = "bold" | "italic" | "underline" | "strikeThrough";
export type InlineMarkValue = "on" | "off" | "mixed";
export type InlineMarkState = Record<InlineFormatCommand, InlineMarkValue>;

export const EMPTY_INLINE_MARK_STATE: InlineMarkState = {
  bold: "off",
  italic: "off",
  underline: "off",
  strikeThrough: "off",
};

function hasMark(node: Node, editor: HTMLElement, command: InlineFormatCommand): boolean {
  const nodeElement = node.nodeType === Node.ELEMENT_NODE ? node as HTMLElement : node.parentElement;
  const mention = nodeElement?.closest<HTMLElement>(".editor-mention") ?? null;
  if (command === "underline" && mention?.dataset.mentionUserUnderline === "true") return true;
  if (command === "strikeThrough" && mention?.dataset.mentionStrike === "true") return true;
  let element = nodeElement?.matches(".editor-mention")
    ? nodeElement.querySelector<HTMLElement>(":scope > .editor-mention__label") ?? nodeElement
    : nodeElement;
  while (element && element !== editor) {
    const tag = element.tagName;
    const style = element.style;
    if (command === "bold" && (tag === "B" || tag === "STRONG" || /^(?:bold|bolder|[6-9]00)$/i.test(style.fontWeight))) return true;
    if (command === "italic" && (tag === "I" || tag === "EM" || /^(?:italic|oblique)/i.test(style.fontStyle))) return true;
    const decoration = `${style.textDecorationLine} ${style.textDecoration}`.toLowerCase();
    const insideMention = Boolean(mention && mention.contains(element));
    if (command === "underline" && !insideMention && (tag === "U" || decoration.includes("underline"))) return true;
    if (command === "strikeThrough" && !insideMention && (["S", "STRIKE", "DEL"].includes(tag) || decoration.includes("line-through"))) return true;
    element = element.parentElement;
  }

  const target = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
  if (!target || typeof getComputedStyle !== "function") return false;
  const computed = getComputedStyle(target);
  if (command === "bold") {
    const numericWeight = Number.parseInt(computed.fontWeight, 10);
    return computed.fontWeight === "bold" || Number.isFinite(numericWeight) && numericWeight >= 600;
  }
  if (command === "italic") return /^(?:italic|oblique)/i.test(computed.fontStyle);
  if (mention && (command === "underline" || command === "strikeThrough")) return false;
  if (command === "underline") return computed.textDecorationLine.includes("underline");
  return computed.textDecorationLine.includes("line-through");
}

function getSelectedMarkNodes(range: Range, editor: HTMLElement): Node[] {
  if (range.collapsed) {
    const container = range.startContainer;
    if (container.nodeType === Node.TEXT_NODE) return [container];
    const element = container as Element;
    const adjacent = element.childNodes[Math.max(0, range.startOffset - 1)] || element.childNodes[range.startOffset];
    return [adjacent || element];
  }

  const nodes: Node[] = [];
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    const parent = current.parentElement;
    const isEditorUi = parent?.closest("[data-editor-ui], [data-his-table-handle], [data-his-table-column-handles]");
    if (!isEditorUi && current.textContent && range.intersectsNode(current)) {
      const length = current.textContent.length;
      const startsAtEnd = current === range.startContainer && range.startOffset >= length;
      const endsAtStart = current === range.endContainer && range.endOffset === 0;
      if (!startsAtEnd && !endsAtStart) nodes.push(current);
    }
    current = walker.nextNode();
  }

  // Calls are atomic and cannot receive browser inline marks. Ignore them when
  // editable text is also selected; if a Call is the whole selection, inspect
  // its own ancestors so the toolbar still reports a truthful state.
  if (!nodes.length) {
    editor.querySelectorAll<HTMLElement>("[data-mention-id]").forEach((mention) => {
      if (range.intersectsNode(mention)) nodes.push(mention);
    });
  }
  return nodes;
}

export function readInlineMarkState(range: Range, editor: HTMLElement): InlineMarkState {
  const nodes = getSelectedMarkNodes(range, editor);
  if (!nodes.length) return EMPTY_INLINE_MARK_STATE;
  const commands: InlineFormatCommand[] = ["bold", "italic", "underline", "strikeThrough"];
  return commands.reduce<InlineMarkState>((state, command) => {
    const activeCount = nodes.reduce((count, node) => count + Number(hasMark(node, editor, command)), 0);
    state[command] = activeCount === 0 ? "off" : activeCount === nodes.length ? "on" : "mixed";
    return state;
  }, { ...EMPTY_INLINE_MARK_STATE });
}

export function rangeBelongsToEditor(range: Range, editor: HTMLElement): boolean {
  return editor.contains(range.startContainer) && editor.contains(range.endContainer);
}
