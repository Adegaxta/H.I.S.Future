import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const visualsDir = path.join(root, "src", "nodes", "visuals");

function writeGenerated(filename, metadata) {
  const sorted = Object.fromEntries(Object.entries(metadata).sort(([a], [b]) => a.localeCompare(b)));
  const output = `${JSON.stringify(sorted, null, 2)}\n`;
  fs.writeFileSync(path.join(visualsDir, filename), output, "utf8");
}

const lucideTagsPath = path.join(root, "node_modules", "lucide-static", "tags.json");
if (!fs.existsSync(lucideTagsPath)) throw new Error("lucide-static is not installed.");
const lucideTags = JSON.parse(fs.readFileSync(lucideTagsPath, "utf8"));
const lucideMetadata = Object.fromEntries(Object.entries(lucideTags).map(([name, tags]) => [name, tags.join(" ")]));
writeGenerated("lucideSearchMetadata.generated.json", lucideMetadata);

const materialTypesPath = path.join(root, "node_modules", "@material-symbols", "font-400", "index.d.ts");
const materialNames = new Set([...fs.readFileSync(materialTypesPath, "utf8").matchAll(/^\s+"([^"]+)",?$/gm)].map((match) => match[1]));
const response = await fetch("https://fonts.google.com/metadata/icons?incomplete=1&key=material_symbols");
if (!response.ok) throw new Error(`Material Symbols metadata request failed (${response.status}).`);
const payload = JSON.parse((await response.text()).replace(/^\)\]\}'\s*/, ""));
const materialMetadata = {};
for (const icon of payload.icons) {
  if (!materialNames.has(icon.name)) continue;
  const terms = [...(icon.categories ?? []), ...(icon.tags ?? [])];
  materialMetadata[icon.name] = [...new Set(terms)].join(" ");
}
if (Object.keys(materialMetadata).length < 3_000) throw new Error("Incomplete Material Symbols metadata.");
writeGenerated("materialSearchMetadata.generated.json", materialMetadata);

console.log(`Updated semantic metadata for ${Object.keys(lucideMetadata).length} Lucide and ${Object.keys(materialMetadata).length} Material Symbols.`);
