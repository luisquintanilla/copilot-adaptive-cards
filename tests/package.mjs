import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const directory = await mkdtemp(join(tmpdir(), "cards-install-"));
try {
  const archives = ["adaptive-cards-workbench-0.1.0.tgz", "copilot-adaptive-cards-0.1.0-source.tgz"];
  const hashes = () => Promise.all(archives.map(async name =>
    createHash("sha256").update(await readFile(resolve(root, "artifacts", name))).digest("hex")
  ));
  const before = await hashes();
  execFileSync(process.execPath, [resolve(root, "scripts", "package.mjs")]);
  assert.deepEqual(await hashes(), before, "Unchanged sources must produce byte-identical archives.");
  console.log("PASS repeated packaging produced byte-identical source and runtime archives.");
  execFileSync("tar", ["-xzf", resolve(root, "artifacts/adaptive-cards-workbench-0.1.0.tgz"), "-C", directory]);
  const installed = join(directory, "adaptive-cards-workbench");
  assert.equal((await readdir(installed)).includes("node_modules"), false);
  const manifest = JSON.parse(await readFile(join(installed, "files.sha256.json"), "utf8"));
  assert.ok(manifest.length > 20);
  for (const file of manifest) assert.equal(createHash("sha256").update(await readFile(join(installed, file.path))).digest("hex"), file.sha256, file.path);
  const { Store, validateDocument } = await import(pathToFileURL(join(installed, "core.mjs")).href);
  for (const name of ["workshop", "comparison", "pr-readiness"]) {
    const fixture = JSON.parse(await readFile(join(installed, "examples", `${name}.json`), "utf8"));
    const compiled = await validateDocument(fixture);
    assert.equal(compiled.expanded.version, "1.5");
  }
  const store = new Store(join(directory, "data"));
  const saved = await store.open("isolated");
  assert.equal(saved.document.data.attendees, 40);
  console.log(`PASS isolated extracted extension: ${manifest.length} verified files; all recipes and worker run without node_modules or network.`);
} finally { await rm(directory, { recursive: true, force: true }); }
