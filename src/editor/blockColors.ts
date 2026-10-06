import type { ColorTarget } from "./ColorOptions";

/** Keep hue while making highlights readable on the dark editor surface. */
export function mutedEditorBackground(color: string): string {
  const hex = color.match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1];
  if (!hex) return color;
  const full = hex.length === 3 ? Array.from(hex, (digit) => digit + digit).join("") : hex;
  return `rgba(${parseInt(full.slice(0, 2), 16)}, ${parseInt(full.slice(2, 4), 16)}, ${parseInt(full.slice(4, 6), 16)}, 0.22)`;
}

export function applyEditorBlockColor(block: HTMLElement, kind: ColorTarget, color: string): void {
  if (kind === "border") {
    if (color) block.style.border = `1px solid ${color}`;
    else block.style.removeProperty("border");
  } else {
    const property = kind === "text" ? "color" : "background-color";
    if (color) block.style.setProperty(property, kind === "background" ? mutedEditorBackground(color) : color);
    else block.style.removeProperty(property);
  }
}

export function resetEditorBlockColors(block: HTMLElement): void {
  ["color", "background-color", "border"].forEach((property) => block.style.removeProperty(property));
}
