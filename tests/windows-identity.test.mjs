import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [config, cargo] = await Promise.all([
  readFile(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../src-tauri/Cargo.toml", import.meta.url), "utf8"),
]);

assert.equal(config.productName, "H.I.S. Future");
assert.equal(config.mainBinaryName, "H.I.S. Future");
assert.equal(config.identifier, "com.terce.hisfuture");
assert.match(cargo, /^name = "hisfuture"$/m);
assert.equal(config.bundle.fileAssociations[0].ext[0], "his");
assert.equal(config.bundle.fileAssociations[0].name, "H.I.S. Future Project");
assert.equal(config.bundle.fileAssociations[0].description, "Proyecto H.I.S. Future");

console.log("PASS: Windows visible identity preserves technical IDs and .his association.");