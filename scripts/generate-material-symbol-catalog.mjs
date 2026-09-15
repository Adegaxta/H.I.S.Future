import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "node_modules", "@material-symbols", "font-400", "index.d.ts");
const outputPath = path.join(root, "src", "nodes", "visuals", "materialSymbolNames.generated.ts");

if (!fs.existsSync(sourcePath)) {
  throw new Error("Material Symbols is not installed. Run npm install before generating the catalogue.");
}

const source = fs.readFileSync(sourcePath, "utf8");
const names = [...source.matchAll(/^\s+"([^"]+)",?$/gm)].map((match) => match[1]);
const requiredNames = ["home", "image", "search", "settings"];

if (names.length < 1_000 || requiredNames.some((name) => !names.includes(name))) {
  throw new Error(`Unexpected Material Symbols catalogue (${names.length} entries).`);
}

const generated = [
  "// Generated from @material-symbols/font-400/index.d.ts. Do not edit manually.",
  `export const MATERIAL_SYMBOL_NAMES = ${JSON.stringify(names, null, 2)} as const;`,
  "",
].join("\n");

if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, "utf8") !== generated) {
  fs.writeFileSync(outputPath, generated, "utf8");
  console.log(`Generated ${names.length} Material Symbols.`);
}
