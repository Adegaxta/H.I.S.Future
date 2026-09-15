import { Texture } from "pixi.js";
import type { ResolvedNodeVisual } from "../nodes/visuals/types";

type LucideNode = [string, Record<string, unknown>, LucideNode[]?];
type LucideModule = { __iconData?: { size?: number; node: LucideNode[] } };

const GLYPH_TEXTURE_SIZE = 96;
const NEUTRAL_ICON_COLOR = "#e8e9ea";

function escapeXml(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function svgAttributeName(name: string): string {
  if (name === "className") return "class";
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function renderLucideNode([tag, attributes, children]: LucideNode): string {
  const serialized = Object.entries(attributes)
    .filter(([name, value]) => name !== "key" && value !== undefined && value !== null)
    .map(([name, value]) => `${svgAttributeName(name)}="${escapeXml(value)}"`)
    .join(" ");
  const content = children?.map(renderLucideNode).join("") ?? "";
  return `<${tag}${serialized ? ` ${serialized}` : ""}>${content}</${tag}>`;
}

async function lucideSource(name: string): Promise<string> {
  const { default: dynamicIconImports } = await import("lucide-react/dynamicIconImports");
  const loader = (dynamicIconImports as Record<string, (() => Promise<LucideModule>) | undefined>)[name];
  if (!loader) throw new Error(`Unknown Lucide icon: ${name}`);
  const module = await loader();
  if (!module.__iconData?.node) throw new Error(`Lucide icon data is unavailable: ${name}`);
  const size = module.__iconData.size ?? 24;
  const body = module.__iconData.node.map(renderLucideNode).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${GLYPH_TEXTURE_SIZE}" height="${GLYPH_TEXTURE_SIZE}" viewBox="0 0 ${size} ${size}" fill="none" stroke="${NEUTRAL_ICON_COLOR}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function glyphFont(visual: Extract<ResolvedNodeVisual, { kind: "emoji" | "icon" }>): string {
  if (visual.kind === "emoji") return visual.style === "noto" ? "Noto Color Emoji" : "Twemoji";
  return "Material Symbols Rounded";
}

async function glyphTexture(visual: Extract<ResolvedNodeVisual, { kind: "emoji" | "icon" }>): Promise<Texture> {
  const family = glyphFont(visual);
  const value = visual.kind === "emoji" ? visual.value : visual.name;
  const fontSize = visual.kind === "emoji" ? 68 : 72;
  const font = `400 ${fontSize}px "${family}"`;
  await document.fonts?.load(font, value);
  const canvas = document.createElement("canvas");
  canvas.width = GLYPH_TEXTURE_SIZE;
  canvas.height = GLYPH_TEXTURE_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is unavailable for graph visual rendering");
  context.font = font;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = NEUTRAL_ICON_COLOR;
  context.fillText(value, GLYPH_TEXTURE_SIZE / 2, GLYPH_TEXTURE_SIZE / 2 + 2);
  return Texture.from(canvas, true);
}

function imageTexture(source: string, rasterize = false): Promise<Texture> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        let resource: HTMLImageElement | HTMLCanvasElement = image;
        if (rasterize) {
          const canvas = document.createElement("canvas");
          canvas.width = GLYPH_TEXTURE_SIZE;
          canvas.height = GLYPH_TEXTURE_SIZE;
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Canvas 2D is unavailable for graph SVG rendering");
          context.drawImage(image, 0, 0, GLYPH_TEXTURE_SIZE, GLYPH_TEXTURE_SIZE);
          resource = canvas;
        }
        const texture = Texture.from(resource, true);
        if (!texture) reject(new Error("Pixi did not create a texture for the image"));
        else resolve(texture);
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error(`Image could not be loaded: ${source}`));
    image.src = source;
  });
}

export function graphVisualTextureKey(visual: ResolvedNodeVisual): string {
  if (visual.kind === "image") return visual.src;
  if (visual.kind === "emoji") return `hisfuture-emoji:${visual.style}:${visual.value}`;
  return `hisfuture-icon:${visual.provider}:${visual.name}`;
}

export async function loadGraphVisualTexture(visual: ResolvedNodeVisual): Promise<Texture> {
  if (visual.kind === "image") return imageTexture(visual.src);
  if (visual.kind === "icon" && visual.provider === "lucide") return imageTexture(await lucideSource(visual.name), true);
  return glyphTexture(visual);
}

export function loadGraphImageTexture(source: string): Promise<Texture> {
  return imageTexture(source);
}
