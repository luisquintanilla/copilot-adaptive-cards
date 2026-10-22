import { build } from "esbuild";
import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(root, "build", "extension");
await mkdir(output, { recursive: true });
const integrity = JSON.parse(await readFile(resolve(root, "vendor/integrity.json"), "utf8"));
for (const file of integrity) {
  const bytes = await readFile(resolve(root, "vendor", file.file));
  if (`sha256-${createHash("sha256").update(bytes).digest("base64")}` !== file.integrity) throw new Error(`Vendor integrity: ${file.file}`);
}
await Promise.all([
  build({ absWorkingDir: root, entryPoints: ["src/core.ts"], outfile: `${output}/core.mjs`, bundle: true, platform: "node", format: "esm", target: "node24" }),
  build({ absWorkingDir: root, entryPoints: ["src/expansion-worker.ts"], outfile: `${output}/expansion-worker.mjs`, bundle: true, platform: "node", format: "esm", target: "node24" })
]);
await cp(resolve(root, "vendor"), resolve(output, "vendor"), { recursive: true });
await cp(resolve(root, "schemas"), resolve(output, "schemas"), { recursive: true });
await cp(resolve(root, "src/web"), resolve(output, "assets"), { recursive: true });
await cp(resolve(root, "src/extension.mjs"), resolve(output, "extension.mjs"));
await cp(resolve(root, "vendor/adaptivecards.js"), resolve(output, "assets/adaptivecards.js"));
await cp(resolve(root, "skills"), resolve(output, "skills"), { recursive: true });
await mkdir(resolve(output, "licenses"), { recursive: true });
for (const name of ["ajv", "fast-deep-equal", "fast-uri", "json-schema-traverse", "require-from-string"]) {
  const directory = resolve(root, "node_modules", name);
  const licenses = (await readdir(directory)).filter(file => /^licen[cs]e/i.test(file));
  if (!licenses.length) throw new Error(`Missing dependency license: ${name}`);
  for (const file of licenses) await cp(resolve(directory, file), resolve(output, "licenses", `${name}-${file}`));
}
for (const name of ["README.md", "INTENT.md", "VERIFICATION.md", "LICENSE", "THIRD-PARTY-NOTICES.txt"]) {
  await cp(resolve(root, name), resolve(output, name));
}
await writeFile(resolve(output, "copilot-extension.json"), JSON.stringify({ name: "adaptive-cards-workbench", version: 1 }, null, 2));
const { documentSchema, example, templateNames } = await import(new URL("../build/extension/core.mjs", import.meta.url));
await writeFile(resolve(output, "schemas", "workbench-document.json"), JSON.stringify(documentSchema, null, 2) + "\n");
await mkdir(resolve(output, "examples"), { recursive: true });
for (const name of templateNames) await writeFile(resolve(output, "examples", `${name}.json`), JSON.stringify(example(name, `${name}-example`), null, 2) + "\n");
console.log("Built standalone extension with verified, same-origin assets.");
