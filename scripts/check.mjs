import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
function run(...args) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${args.join(" ")} failed (${result.signal ?? result.status}).`);
}
if (!process.argv.includes("--unit")) run("node_modules/typescript/bin/tsc", "--noEmit");
run("scripts/build.mjs");
const tests = (await readdir(new URL("../tests/", import.meta.url))).filter(name => name.endsWith(".test.mjs")).sort();
if (!tests.length) throw new Error("No contract test suites found.");
run("--test", "--test-concurrency=1", ...tests.map(name => `tests/${name}`));
if (!process.argv.includes("--unit")) run("tests/browser.mjs");
if (process.argv.includes("--package")) {
  run("scripts/package.mjs");
  run("tests/package.mjs");
}
