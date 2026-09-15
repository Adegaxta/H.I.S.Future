import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

const root = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))/, "$1"));
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const appSource = read("src/App.tsx");
assert.equal(
  /^import AppWorkspace from/m.test(appSource),
  false,
  "the workspace must remain outside the cold-launch bundle",
);
assert.ok(
  appSource.includes('lazy(loadAppWorkspace)'),
  "the workspace must be loaded as a route-level chunk",
);

const html = read("dist/index.html");
const entryMatch = html.match(/<script[^>]+src="(?:\.\/|\/)assets\/([^"]+\.js)"/);
assert.ok(entryMatch, "the production entry bundle must be discoverable in dist/index.html");

const entryPath = path.join(root, "dist", "assets", entryMatch[1]);
const entry = fs.readFileSync(entryPath);
const entryGzipBytes = gzipSync(entry).byteLength;
const ENTRY_RAW_BUDGET = 350_000;
const ENTRY_GZIP_BUDGET = 115_000;

assert.ok(
  entry.byteLength <= ENTRY_RAW_BUDGET,
  `cold-launch JS is ${entry.byteLength} bytes; budget is ${ENTRY_RAW_BUDGET}`,
);
assert.ok(
  entryGzipBytes <= ENTRY_GZIP_BUDGET,
  `cold-launch JS is ${entryGzipBytes} gzip bytes; budget is ${ENTRY_GZIP_BUDGET}`,
);

const initialCssMatch = html.match(/<link[^>]+href="(?:\.\/|\/)assets\/([^"]+\.css)"/);
assert.ok(initialCssMatch, "the production entry stylesheet must be discoverable in dist/index.html");
const initialCss = fs.readFileSync(path.join(root, "dist", "assets", initialCssMatch[1]));
const initialCssGzipBytes = gzipSync(initialCss).byteLength;
const INITIAL_CSS_RAW_BUDGET = 45_000;
const INITIAL_CSS_GZIP_BUDGET = 12_000;
assert.ok(
  initialCss.byteLength <= INITIAL_CSS_RAW_BUDGET,
  `cold-launch CSS is ${initialCss.byteLength} bytes; budget is ${INITIAL_CSS_RAW_BUDGET}`,
);
assert.ok(
  initialCssGzipBytes <= INITIAL_CSS_GZIP_BUDGET,
  `cold-launch CSS is ${initialCssGzipBytes} gzip bytes; budget is ${INITIAL_CSS_GZIP_BUDGET}`,
);

const workspaceAsset = fs.readdirSync(path.join(root, "dist", "assets"))
  .find((name) => /^AppWorkspace-.*\.js$/.test(name));
assert.ok(workspaceAsset, "the workspace must be emitted as an independent chunk");
const workspace = fs.readFileSync(path.join(root, "dist", "assets", workspaceAsset));
const workspaceGzipBytes = gzipSync(workspace).byteLength;
const WORKSPACE_RAW_BUDGET = 750_000;
const WORKSPACE_GZIP_BUDGET = 225_000;
assert.ok(
  workspace.byteLength <= WORKSPACE_RAW_BUDGET,
  `workspace JS is ${workspace.byteLength} bytes; budget is ${WORKSPACE_RAW_BUDGET}`,
);
assert.ok(
  workspaceGzipBytes <= WORKSPACE_GZIP_BUDGET,
  `workspace JS is ${workspaceGzipBytes} gzip bytes; budget is ${WORKSPACE_GZIP_BUDGET}`,
);

console.log(
  `Performance budgets passed (cold launch: JS ${entry.byteLength}/${entryGzipBytes} gzip, CSS ${initialCss.byteLength}/${initialCssGzipBytes} gzip; workspace JS ${workspace.byteLength}/${workspaceGzipBytes} gzip).`,
);
