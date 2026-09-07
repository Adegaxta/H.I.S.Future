import { useState } from "react";
import type { NodeItem, PickerState } from "../types/nodes";
import { normalizeSearchText, SLASH_REGISTRY } from "../defs/editor";

export function useEditorPickers(nodes: NodeItem[]) {
  const [callPicker, setCallPicker] = useState<PickerState | null>(null);
  const [callPickerIndex, setCallPickerIndex] = useState(0);
  const [imageMentionChoice, setImageMentionChoice] = useState<string | null>(null);
  const [slashPicker, setSlashPicker] = useState<PickerState | null>(null);
  const [slashPickerIndex, setSlashPickerIndex] = useState(0);
  const [pickerPosition, setPickerPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);

  const callCandidates = callPicker
    ? nodes.filter((node) =>
        node.name.toLowerCase().includes(callPicker.query.toLowerCase()),
      )
    : [];
  const slashCandidates = slashPicker
    ? SLASH_REGISTRY.all().filter((command) => {
        const query = normalizeSearchText(slashPicker.query);
        const haystack = normalizeSearchText(
          [command.label, command.tag, command.id, ...("aliases" in command ? command.aliases ?? [] : [])].join(" "),
        );
        return haystack.includes(query);
      })
    : [];

  return {
    callPicker,
    setCallPicker,
    callPickerIndex,
    setCallPickerIndex,
    imageMentionChoice,
    setImageMentionChoice,
    slashPicker,
    setSlashPicker,
    slashPickerIndex,
    setSlashPickerIndex,
    pickerPosition,
    setPickerPosition,
    callCandidates,
    slashCandidates,
  };
}
