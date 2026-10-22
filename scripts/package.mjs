import { cp, mkdir, mkdtemp, readdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(root, "artifacts");
await mkdir(output, { recursive: true });
const stage = await mkdtemp(resolve(root, "build", "package-"));
async function archive(directory, filename) {
  const tar = resolve(stage, `${directory}.tar`);
  execFileSync("tar", ["-cf", tar, "-C", stage, directory]);
  await writeFile(resolve(output, filename), gzipSync(await readFile(tar)));
}
async function manifest(directory, prefix = "") {
  const records = [];
  for (const name of (await readdir(resolve(directory, prefix))).sort()) {
    const path = resolve(directory, prefix, name);
    if ((await stat(path)).isDirectory()) records.push(...await manifest(directory, `${prefix}${name}/`));
    else records.push({ path: `${prefix}${name}`, sha256: createHash("sha256").update(await readFile(path)).digest("hex") });
    await utimes(path, 315532800, 315532800);
  }
  return records;
}
try {
  const extension = resolve(stage, "adaptive-cards-workbench");
  await cp(resolve(root, "build", "extension"), extension, { recursive: true });
  const files = await manifest(extension);
  await writeFile(resolve(extension, "files.sha256.json"), JSON.stringify(files, null, 2) + "\n");
  await utimes(resolve(extension, "files.sha256.json"), 315532800, 315532800);
  await utimes(extension, 315532800, 315532800);
  await archive("adaptive-cards-workbench", "adaptive-cards-workbench-0.1.0.tgz");
  const source = resolve(stage, "copilot-adaptive-cards");
  await mkdir(source);
  for (const name of ["src", "scripts", "schemas", "vendor", "skills", "tests", "evaluation", ".github", "README.md", "INTENT.md", "VERIFICATION.md", "LICENSE", "THIRD-PARTY-NOTICES.txt", "package.json", "package-lock.json", "tsconfig.json", ".gitignore"]) {
    await cp(resolve(root, name), resolve(source, name), { recursive: true });
  }
  await manifest(source);
  await utimes(source, 315532800, 315532800);
  await archive("copilot-adaptive-cards", "copilot-adaptive-cards-0.1.0-source.tgz");
  const archives = (await readdir(output)).filter(name => name.endsWith(".tgz")).sort();
  await writeFile(resolve(output, "SHA256SUMS"), (await Promise.all(archives.map(async name =>
    `${createHash("sha256").update(await readFile(resolve(output, name))).digest("hex")}  ${name}`
  ))).join("\n") + "\n");
  console.log(`Packaged source and dependency-free extension in ${relative(root, output)}.`);
} finally { await rm(stage, { recursive: true, force: true }); }
