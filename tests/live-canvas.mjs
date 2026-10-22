import assert from "node:assert/strict";
import { chromium } from "playwright";
const url = process.env.CANVAS_URL;
if (!url) throw new Error("Open the installed canvas via the app, then supply its URL in CANVAS_URL. Do not commit/log capability URLs.");
const executablePath = process.env.BROWSER_EXECUTABLE ?? (process.platform === "win32" ? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" : undefined);
const browser = await chromium.launch({ executablePath, headless: true });
try {
  const page = await browser.newPage();
  await page.goto(url);
  await page.locator("#card").getByText("A practical AI workshop", { exact: true }).waitFor();
  await page.getByLabel("Attendees", { exact: false }).fill("50");
  await page.getByLabel("Venue to explore", { exact: false }).selectOption("studio");
  await page.getByLabel("Requirements and notes", { exact: false }).fill("Live SDK verification: step-free access and hands-on afternoon.");
  await page.getByRole("button", { name: "Save parameters and recalculate", exact: true }).click();
  await page.locator("#card").getByText("$2950.00 USD; within budget; capacity fits", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Save choice for review", exact: true }).click();
  await page.locator("#reviews option").waitFor({ state: "attached" });
  await page.locator("#instruction").fill("Bounded Adaptive Cards Workbench integration test: acknowledge receipt only. The implementation turn is separately verifying an agenda revision. Do not start external work, call tools, or change the modernization project.");
  await page.getByRole("button", { name: "Preview exact outgoing context", exact: true }).click();
  await page.locator("#outgoing").waitFor();
  assert.match(await page.locator("#outgoing").inputValue(), /Live SDK verification/);
  assert.equal(await page.locator("#send").isDisabled(), true);
  if (process.argv.includes("--send")) {
    await page.locator("#confirmed").check();
    await page.getByRole("button", { name: "Send to Copilot", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Queued in the owning Copilot session" }).waitFor();
    console.log("PASS actual installed SDK session.send acknowledged queueing after explicit preview/consent.");
  } else console.log("PASS installed canvas rendered, recalculated and saved; preview only, no send.");
  const state = await page.evaluate(async () => {
    const response = await fetch("/api/state", { headers: { Authorization: `Bearer ${location.hash.slice(1)}` } });
    const { revision, evidenceRevision, document, draft, submissions } = await response.json();
    return { revision, evidenceRevision, data: document.data, draft, deliveries: submissions.map(item => item.delivery?.status ?? "not sent") };
  });
  console.log(JSON.stringify(state, null, 2));
} finally { await browser.close(); }
