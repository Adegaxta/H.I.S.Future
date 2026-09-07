export type EditorPickerTrigger =
  | { type: "slash"; query: string }
  | { type: "mention"; query: string };

export function getEditorPickerTrigger(textBeforeCaret: string): EditorPickerTrigger | null {
  const slash = textBeforeCaret.match(/(?:^|\n|\s)\/([a-zA-Z0-9]*)$/);
  if (slash) return { type: "slash", query: slash[1] };

  const mention = textBeforeCaret.match(/(?:^|\s)@([^\s@]*)$/);
  return mention ? { type: "mention", query: mention[1] } : null;
}

export interface MentionTriggerRange {
  container: unknown;
  triggerOffset: number;
}

export function createEmptyEditorPickerSession() {
  return {
    slashPicker: null,
    callPicker: null,
    slashPickerIndex: 0,
    callPickerIndex: 0,
    imageMentionChoice: null,
    pickerPosition: null,
    mentionTriggerRange: null,
  } as const;
}

export function isSameMentionTriggerRange(
  current: MentionTriggerRange | null,
  container: unknown,
  triggerOffset: number,
): boolean {
  return current !== null && current.container === container && current.triggerOffset === triggerOffset;
}
