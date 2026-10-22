import assert from "node:assert/strict";
import { chromium } from "playwright";
const url = process.env.CANVAS_URL;
if (!url) throw new Error("Supply the newly opened installed canvas URL in CANVAS_URL, without committing/logging its capability.");
const executablePath = process.env.BROWSER_EXECUTABLE ?? (process.platform === "win32" ? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" : undefined);
const browser = await chromium.launch({ executablePath, headless: true });
try {
  const page = await browser.newPage();
  await page.goto(url);
  await page.locator("#card").getByText("09:00 - Welcome, shared goals and accessibility check-in", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("Attendees", { exact: false }).inputValue(), "50");
  assert.equal(await page.getByLabel("Venue to explore", { exact: false }).inputValue(), "studio");
  assert.equal(await page.getByLabel("Requirements and notes", { exact: false }).inputValue(), "Live SDK verification: step-free access and hands-on afternoon.");
  const state = await page.evaluate(async () => {
    const response = await fetch("/api/state", { headers: { Authorization: `Bearer ${location.hash.slice(1)}` } });
    const { revision, evidenceRevision, draft, submissions } = await response.json();
    return { revision, evidenceRevision, draft, deliveries: submissions.map(item => item.delivery?.status ?? "not sent") };
  });
  assert.equal(state.revision, 7);
  assert.equal(state.evidenceRevision, 3);
  assert.deepEqual(state.deliveries, ["not sent", "queued"]);
  console.log("PASS actual provider reload and fresh-instance reopen preserve agent revision, human inputs and queued review history; no new send.");
} finally { await browser.close(); }
