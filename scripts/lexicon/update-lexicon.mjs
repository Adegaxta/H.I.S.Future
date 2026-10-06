import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { Readable, Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";

const approved = process.argv.includes("--approve-large-downloads");
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..", "..");
const manifestPath = join(repositoryRoot, "docs", "lexicon", "dataset-manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

console.log(JSON.stringify({
  approvalStatus: manifest.approvalStatus,
  automaticRuntimeDownload: manifest.runtimeNetworkAccess,
  sources: manifest.sources.map((source) => ({
    id: source.id,
    originPage: source.originPage,
    directDownloadUrl: source.directDownloadUrl,
    publishedSize: source.publishedSize,
    license: source.license,
    proposedOutput: source.proposedOutput,
    redistribute: source.redistribute,
  })),
}, null, 2));

if (!approved) {
  console.log("\nPLAN ONLY: no download occurred. Re-run only after explicit approval with --approve-large-downloads.");
  process.exit(0);
}
if (!manifest.approvalStatus.startsWith("approved")) throw new Error("dataset-manifest.json is not approved.");
for (const source of manifest.sources) {
  if (!source.directDownloadUrl || !Number.isSafeInteger(source.compressedBytes) || !/^[a-f0-9]{64}$/u.test(source.sha256 ?? "")) {
    throw new Error(`Source ${source.id} needs a pinned direct URL, byte size, and SHA-256.`);
  }
}

const staging = await mkdtemp(join(tmpdir(), "his-lexicon-"));
const generated = [];
try {
  for (const source of manifest.sources) {
    const downloaded = join(staging, basename(new URL(source.directDownloadUrl).pathname) || `${source.id}.download`);
    const response = await fetch(source.directDownloadUrl);
    if (!response.ok || !response.body) throw new Error(`Download failed for ${source.id}: HTTP ${response.status}`);
    const hash = createHash("sha256");
    let bytes = 0;
    const meter = new Transform({ transform(chunk, _encoding, callback) { bytes += chunk.length; hash.update(chunk); callback(null, chunk); } });
    await pipeline(Readable.fromWeb(response.body), meter, createWriteStream(downloaded, { flags: "wx" }));
    const digest = hash.digest("hex");
    if (bytes !== source.compressedBytes || digest !== source.sha256) throw new Error(`Verification failed for ${source.id}.`);

    const output = resolve(repositoryRoot, source.proposedOutput);
    await mkdir(dirname(output), { recursive: true });
    let importStats;
    if (source.id.startsWith("kaikki-")) {
      importStats = runImporter("import-kaikki.mjs", ["--input", downloaded, "--output", output, "--language", source.language, "--version", source.upstreamDumpDate, "--replace"]);
    } else if (source.id.startsWith("open-english-wordnet-")) {
      const extractedDirectory = join(staging, "oewn-json");
      await mkdir(extractedDirectory);
      const archive = unzipSync(new Uint8Array(readFileSync(downloaded)));
      for (const [name, data] of Object.entries(archive)) {
        if (!name.endsWith(".json") || name.includes("..")) continue;
        const target = join(extractedDirectory, basename(name));
        await writeFile(target, data);
      }
      importStats = runImporter("import-open-english-wordnet.mjs", ["--input", extractedDirectory, "--output", output, "--version", source.release, "--replace"]);
    }
    generated.push({
      id: source.id,
      inputBytes: bytes,
      inputSha256: digest,
      output,
      outputBytes: (await stat(output)).size,
      outputSha256: await sha256File(output),
      importStats,
    });
  }
  const outputDirectory = dirname(generated[0]?.output ?? join(repositoryRoot, "src-tauri", "resources", "lexicon", "unused"));
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(join(outputDirectory, "build-metadata.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), sources: generated }, null, 2)}\n`);
  await writeFile(join(outputDirectory, "ATTRIBUTIONS.generated.md"), attributionNotice(manifest.sources));
  console.log(JSON.stringify({ generated }, null, 2));
} finally {
  await rm(staging, { recursive: true, force: true });
}

function runImporter(script, args) {
  const result = spawnSync(process.execPath, [join(scriptDirectory, script), ...args], { cwd: repositoryRoot, encoding: "utf8" });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.status !== 0) throw new Error(result.stderr || `${script} failed with status ${result.status}`);
  const lastLine = result.stdout.trim().split(/\r?\n/u).at(-1);
  return lastLine ? JSON.parse(lastLine) : null;
}

async function sha256File(path) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), new Writable({ write(chunk, _encoding, callback) { hash.update(chunk); callback(); } }));
  return hash.digest("hex");
}

function attributionNotice(sources) {
  return `# HIS Lexicon generated attributions\n\n${sources.map((source) => `- ${source.id}: ${source.license}; source ${source.originPage}; filtered/modified for HIS.`).join("\n")}\n`;
}
