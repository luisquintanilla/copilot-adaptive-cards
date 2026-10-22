import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../", import.meta.url));
const sources = [
  ["adaptivecards", "2.11.3", "/dist/adaptivecards.min.js", "adaptivecards.js"],
  ["adaptivecards", "2.11.3", "/LICENSE", "adaptivecards.LICENSE"],
  ["adaptivecards", "2.11.3", "/dist/adaptivecards.min.js.LICENSE.txt", "adaptivecards.NOTICES"],
  ["adaptive-expressions", "4.11.0", "/lib/browser.js", "adaptive-expressions.js"],
  ["adaptive-expressions", "4.11.0", "https://raw.githubusercontent.com/microsoft/botbuilder-js/4.11.0/LICENSE", "adaptive-expressions.LICENSE"],
  ["adaptivecards-templating", "2.4.0-alpha.0+53352bb", "https://raw.githubusercontent.com/microsoft/AdaptiveCards/53352bb7c9ea7bda88ad3ee2fbd18f3e0c9a2c0a/source/nodejs/adaptivecards-templating/src/template-engine.ts", "adaptivecards-templating.ts"],
  ["adaptivecards-templating", "2.4.0-alpha.0+53352bb", "https://raw.githubusercontent.com/microsoft/AdaptiveCards/53352bb7c9ea7bda88ad3ee2fbd18f3e0c9a2c0a/source/nodejs/adaptivecards-templating/package.json", "adaptivecards-templating.package.json"],
  ["adaptivecards-templating", "2.4.0-alpha.0+53352bb", "https://raw.githubusercontent.com/microsoft/AdaptiveCards/53352bb7c9ea7bda88ad3ee2fbd18f3e0c9a2c0a/LICENSE", "adaptivecards-templating.LICENSE"]
];
await mkdir(resolve(root, "vendor"), { recursive: true });
const lockPath = resolve(root, "vendor", "integrity.json");
let old;
try { old = JSON.parse(await readFile(lockPath, "utf8")); }
catch (error) { if (error.code !== "ENOENT") throw error; }
const entries = [];
for (const [name, version, path, file] of sources) {
  const url = path.startsWith("https:") ? path : `https://unpkg.com/${name}@${version}${path}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} downloading ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const integrity = `sha256-${createHash("sha256").update(bytes).digest("base64")}`;
  const previous = old?.find(entry => entry.file === file);
  if (previous?.version === version && previous.integrity !== integrity) throw new Error(`Integrity changed: ${file}`);
  if (!path.startsWith("https:")) {
    const metadata = await fetch(`https://unpkg.com/${name}@${version}/?meta`);
    if (!metadata.ok) throw new Error(`Cannot verify metadata: ${name}`);
    const published = (await metadata.json()).files.find(entry => entry.path === path);
    if (published?.integrity !== integrity) throw new Error(`Published integrity mismatch: ${file}`);
  }
  await writeFile(resolve(root, "vendor", file), bytes);
  entries.push({ name, version, file, url, integrity });
}
const compiled = await build({
  absWorkingDir: root, entryPoints: ["vendor/adaptivecards-templating.ts"], bundle: true,
  format: "iife", globalName: "ACData", platform: "browser", target: "es2020", write: false,
  plugins: [{
    name: "official-template-browser-globals",
    setup(plugin) {
      plugin.onResolve({ filter: /^adaptive-expressions$/ }, () => ({ path: "AEL", namespace: "browser-global" }));
      plugin.onLoad({ filter: /.*/, namespace: "browser-global" }, () => ({ contents: "module.exports = globalThis.AEL;", loader: "js" }));
      plugin.onResolve({ filter: /package\.json$/ }, () => ({ path: resolve(root, "vendor/adaptivecards-templating.package.json") }));
    }
  }]
});
const bytes = compiled.outputFiles[0].contents;
const generated = {
  name: "adaptivecards-templating", version: "2.4.0-alpha.0+53352bb", file: "adaptivecards-templating.js",
  url: entries.find(entry => entry.file === "adaptivecards-templating.ts").url,
  compiler: "esbuild 0.28.2; unmodified official source",
  integrity: `sha256-${createHash("sha256").update(bytes).digest("base64")}`
};
const previous = old?.find(entry => entry.file === generated.file);
if (previous?.version === generated.version && previous.integrity !== generated.integrity) throw new Error("Compiled template integrity changed; review source/toolchain.");
await writeFile(resolve(root, "vendor", generated.file), bytes);
entries.push(generated);
await writeFile(lockPath, JSON.stringify(entries, null, 2) + "\n");
console.log("Verified official distributions and compiled the pinned upstream template warning fix. No runtime CDN required.");
