import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { Store, startServer } from "../build/extension/core.mjs";

const directory = await mkdtemp(join(tmpdir(), "cards-browser-"));
const sent = [];
const store = new Store(directory, async prompt => { sent.push(prompt); return "test-message-id"; });
await store.open("workshop-browser", "workshop");
const server = await startServer(store, "workshop-browser");
const executablePath = process.env.BROWSER_EXECUTABLE ?? (process.platform === "win32" ? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" : undefined);
let browser;
try {
  browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "light" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(server.url);
  await page.waitForFunction(() => document.querySelector("#card").children.length || !document.querySelector("#error").hidden);
  assert.equal(await page.locator("#error").textContent(), "", errors.join("\n"));
  await page.locator("#card").getByText("A practical AI workshop", { exact: true }).waitFor();
  assert.equal(await page.locator("#error").isVisible(), false);
  await page.getByLabel("Attendees", { exact: false }).fill("50");
  await page.getByLabel("Venue to explore", { exact: false }).selectOption("studio");
  await page.getByLabel("Requirements and notes", { exact: false }).fill("Step-free access; retain hands-on time.");
  await page.getByRole("button", { name: "Save parameters and recalculate", exact: true }).click();
  await page.locator("#card").getByText("$2950.00 USD; within budget; capacity fits", { exact: true }).waitFor();
  assert.equal(sent.length, 0);
  assert.match((await store.get("workshop-browser")).draft.notes, /Step-free/);
  await page.getByRole("button", { name: "Save choice for review", exact: true }).click();
  await page.locator("#reviews option").waitFor({ state: "attached" });
  assert.equal(sent.length, 0);
  await page.getByRole("button", { name: "Preview exact outgoing context", exact: true }).click();
  await page.locator("#outgoing").waitFor();
  assert.match(await page.locator("#outgoing").inputValue(), /Step-free access/);
  assert.equal(await page.locator("#send").isDisabled(), true);
  assert.equal(sent.length, 0);
  await page.locator("#confirmed").check();
  await page.getByRole("button", { name: "Send to Copilot", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Queued in the owning Copilot session" }).waitFor();
  assert.equal(sent.length, 1);
  assert.match(sent[0], /"selection": "studio"/);
  console.log("PASS workshop-local-recalculation-review-preview-explicit-send");

  await page.getByLabel("Requirements and notes", { exact: false }).fill("Local unsaved accessibility correction");
  const current = await store.get("workshop-browser");
  await store.setData("workshop-browser", current.revision, { ...current.document.data, agenda: ["09:00 - Agent revision; keep the human choices"] });
  await page.locator("#conflict").waitFor();
  assert.equal(await page.getByLabel("Requirements and notes", { exact: false }).inputValue(), "Local unsaved accessibility correction");
  await page.getByRole("button", { name: "Review latest, keep local inputs", exact: true }).click();
  await page.locator("#card").getByText("09:00 - Agent revision; keep the human choices", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("Venue to explore", { exact: false }).inputValue(), "studio");
  assert.equal(await page.getByLabel("Requirements and notes", { exact: false }).inputValue(), "Local unsaved accessibility correction");
  await page.getByRole("button", { name: "Save input draft", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Input draft saved" }).waitFor();
  await page.reload();
  await page.getByLabel("Requirements and notes", { exact: false }).waitFor();
  assert.equal(await page.getByLabel("Requirements and notes", { exact: false }).inputValue(), "Local unsaved accessibility correction");
  assert.equal(sent.length, 1);
  console.log("PASS shared-revision-keeps-unsaved-inputs-and-restores-saved-draft");
  await page.getByRole("button", { name: "Save choice for review", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("#reviews").selectedIndex === 0 && document.querySelectorAll("#reviews option").length === 2);
  assert.match(await page.locator("#review-status").textContent(), /\(current\)/);
  console.log("PASS newly-saved-review-is-selected-against-current-evidence");

  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForFunction(() => getComputedStyle(document.body).backgroundColor === "rgb(13, 17, 23)");
  assert.equal(await page.getByLabel("Venue to explore", { exact: false }).inputValue(), "studio");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.emulateMedia({ colorScheme: "light" });
  await page.waitForFunction(() => getComputedStyle(document.body).backgroundColor === "rgb(255, 255, 255)");
  console.log("PASS narrow-light-dark-standard-renderer");

  const beforeText = await store.get("workshop-browser");
  await store.setData("workshop-browser", beforeText.revision, { ...beforeText.document.data, title: '<img src="https://example.invalid/x" onerror="window.cardInjected=true">' });
  await page.locator("#card").getByText('<img src="https://example.invalid/x" onerror="window.cardInjected=true">', { exact: true }).waitFor();
  assert.equal(await page.locator("#card img").count(), 0);
  assert.equal(await page.evaluate(() => window.cardInjected), undefined);
  await page.evaluate(() => {
    const script = document.createElement("script");
    script.textContent = "window.inlineInjected=true";
    document.head.append(script);
  });
  assert.equal(await page.evaluate(() => window.inlineInjected), undefined);
  assert.deepEqual(errors, []);
  console.log("PASS plain-text-injection-and-inline-script-CSP");
  const beforeClear = await store.get("workshop-browser");
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("button", { name: "Clear input draft...", exact: true }).click();
  assert.deepEqual((await store.get("workshop-browser")).draft, beforeClear.draft);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Clear input draft...", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Input draft cleared" }).waitFor();
  const afterClear = await store.get("workshop-browser");
  assert.deepEqual(afterClear.draft, {});
  assert.deepEqual(afterClear.submissions, beforeClear.submissions);
  assert.equal(sent.length, 1);
  console.log("PASS clearing-draft-requires-consent-and-retains-review-history");
  await store.setDocument("workshop-browser", afterClear.revision, {
    documentVersion: 1, documentId: "workshop-browser", title: "Standard local actions",
    data: {}, dataSchema: { type: "object" }, actionContracts: {},
    card: { type: "AdaptiveCard", version: "1.5",
      body: [{ type: "TextBlock", id: "local-detail", text: "Toggled detail", isVisible: false }],
      actions: [
        { type: "Action.ToggleVisibility", title: "Toggle local detail", targetElements: ["local-detail"] },
        { type: "Action.ShowCard", title: "Show inline card", card: {
          type: "AdaptiveCard", version: "1.5", body: [{ type: "TextBlock", text: "Inline local detail" }]
        } }
      ] }
  });
  await page.getByRole("button", { name: "Toggle local detail", exact: true }).waitFor();
  assert.equal(await page.locator("#card").getByText("Toggled detail", { exact: true }).isVisible(), false);
  await page.getByRole("button", { name: "Toggle local detail", exact: true }).click();
  await page.locator("#card").getByText("Toggled detail", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Show inline card", exact: true }).click();
  await page.locator("#card").getByText("Inline local detail", { exact: true }).waitFor();
  assert.equal(sent.length, 1);
  assert.deepEqual(errors, []);
  console.log("PASS native-showcard-and-togglevisibility-stay-local");
  await context.close();
} finally {
  await browser?.close();
  await server.close();
  await rm(directory, { recursive: true, force: true });
}
