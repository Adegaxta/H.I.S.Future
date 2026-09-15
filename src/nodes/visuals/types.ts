export type EmojiVisualStyle = "noto" | "twemoji";
export type IconVisualProvider = "lucide" | "material-symbols";

export type NodeVisual =
  | { kind: "image"; nodeId: string; source: "local" | "unsplash" }
  | { kind: "emoji"; value: string; style: EmojiVisualStyle }
  | { kind: "icon"; provider: IconVisualProvider; name: string };

export type ResolvedNodeVisual =
  | { kind: "image"; src: string }
  | Extract<NodeVisual, { kind: "emoji" | "icon" }>;

export function parseNodeVisual(value: unknown): NodeVisual | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<NodeVisual> & Record<string, unknown>;
  if (candidate.kind === "image" && typeof candidate.nodeId === "string" &&
      (candidate.source === "local" || candidate.source === "unsplash")) {
    return { kind: "image", nodeId: candidate.nodeId, source: candidate.source };
  }
  if (candidate.kind === "emoji" && typeof candidate.value === "string" && candidate.value.length > 0 &&
      (candidate.style === "noto" || candidate.style === "twemoji")) {
    return { kind: "emoji", value: candidate.value, style: candidate.style };
  }
  if (candidate.kind === "icon" && (candidate.provider === "lucide" || candidate.provider === "material-symbols") &&
      typeof candidate.name === "string" && candidate.name.length > 0) {
    return { kind: "icon", provider: candidate.provider, name: candidate.name };
  }
  return null;
}
