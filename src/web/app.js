import { CardAdapter } from "./adapter.js";
const $ = id => document.getElementById(id);
const token = location.hash.slice(1);
let snapshot, dirty = false, busy = false, remote = false, pendingEvent = false, preview;
function message(text) { $("status").textContent = text; }
function failure(error) { $("error").textContent = error.message; $("error").hidden = false; }
function invalidatePreview() {
  preview = undefined; $("consent").hidden = true; $("confirmed").checked = false; $("send").disabled = true;
}
async function api(path, data) {
  const response = await fetch(`/api/${path}`, {
    method: data ? "POST" : "GET", headers: { Authorization: `Bearer ${token}`, ...(data ? { "Content-Type": "application/json" } : {}) },
    ...(data ? { body: JSON.stringify(data) } : {})
  });
  const value = await response.json();
  if (!response.ok) {
    const error = new Error(`${value.code}: ${value.message}${value.diagnostics?.length ? `\n${JSON.stringify(value.diagnostics, null, 2)}` : ""}`);
    error.code = value.code;
    if (value.code === "revision_conflict") { remote = true; $("conflict").hidden = false; }
    throw error;
  }
  return value;
}
async function run(operation) {
  if (busy) return;
  busy = true; $("interactive").disabled = true; $("error").hidden = true;
  try { await operation(); }
  catch (error) { failure(error); }
  finally {
    busy = false; $("interactive").disabled = false;
    if (pendingEvent) { pendingEvent = false; queueMicrotask(refreshFromEvent); }
  }
}
function refreshFromEvent() {
  if (busy) { pendingEvent = true; return; }
  void run(async () => {
    const current = await api("state");
    if (current.revision === snapshot?.revision) return;
    if (dirty) { remote = true; $("conflict").hidden = false; invalidatePreview(); }
    else { render(current); message("Saved artifact updated."); }
  });
}
function changed() {
  dirty = true; $("dirty").textContent = "Unsaved local inputs"; invalidatePreview();
}
const adapter = new CardAdapter($("card"), (actionId, inputs) => run(async () => {
  if (remote) throw new Error("Review the latest saved evidence first. Your local inputs have not been discarded.");
  if (dirty) snapshot = await api("draft", { expectedRevision: snapshot.revision, inputs: adapter.values() });
  const saved = await api("submit", { expectedRevision: snapshot.revision, actionId, inputs });
  render(saved, undefined, actionId === "parameters" ? undefined : saved.submissions.at(-1)?.id);
  message(actionId === "parameters" ? "Recalculated and saved locally. No message was sent." : "Review saved locally. Inspect it before explicitly sending.");
}), changed);
function reviewStatus() {
  const saved = snapshot?.submissions.find(item => item.id === $("reviews").value);
  $("review-status").textContent = saved
    ? `Evidence ${saved.evidenceRevision}${saved.evidenceRevision !== snapshot.evidenceRevision ? " (stale: save a new review)" : " (current)"}. Delivery: ${saved.delivery?.status ?? "not sent"}.${saved.delivery?.error ? ` ${saved.delivery.error}` : ""}`
    : "No saved review yet.";
}
function render(state, preserved = undefined, preferredSubmissionId = undefined) {
  adapter.render(state.expanded, preserved ?? state.draft, state.document.actionContracts);
  snapshot = state; dirty = Boolean(preserved); remote = false;
  $("conflict").hidden = true;
  $("dirty").textContent = dirty ? "Local inputs retained; review before saving" : "Inputs saved";
  $("title").textContent = state.document.title;
  $("identity").textContent = `${state.document.documentId} | revision ${state.revision} | evidence ${state.evidenceRevision} | ${state.sessionLabel}`;
  $("source").textContent = JSON.stringify({ document: state.document, draft: state.draft, submissions: state.submissions, capabilities: state.capabilities }, null, 2);
  const selected = preferredSubmissionId ?? $("reviews").value;
  $("reviews").replaceChildren(...[...state.submissions].reverse().filter(item => item.actionId !== "parameters").map(item => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = `${item.actionId} | ${item.createdAt} | evidence ${item.evidenceRevision} | ${item.delivery?.status ?? "not sent"}`;
    return option;
  }));
  if ([...$("reviews").options].some(option => option.value === selected)) $("reviews").value = selected;
  invalidatePreview(); reviewStatus();
}
$("save-draft").onclick = () => run(async () => {
  if (remote) throw new Error("Review the latest evidence before saving.");
  render(await api("draft", { expectedRevision: snapshot.revision, inputs: adapter.values() }));
  message("Input draft saved. No review submitted and no message sent.");
});
$("clear-draft").onclick = () => run(async () => {
  if (remote) throw new Error("Review the latest saved state before clearing inputs.");
  if (!confirm("Clear saved and unsaved input drafts? Existing review history is retained. Nothing will be sent.")) return;
  render(await api("draft", { expectedRevision: snapshot.revision, inputs: {} }));
  message("Input draft cleared. Review history retained. Nothing was sent.");
});
$("latest").onclick = () => run(async () => {
  const local = dirty ? adapter.values() : undefined;
  const current = await api("state");
  if (local) {
    const ids = new Set();
    const collect = value => {
      if (Array.isArray(value)) value.forEach(collect);
      else if (value && typeof value === "object") {
        if (value.type?.startsWith("Input.")) ids.add(value.id);
        Object.values(value).forEach(collect);
      }
    };
    collect(current.expanded);
    if (Object.keys(local).some(key => !ids.has(key))) throw new Error("The new card removed locally edited inputs. Copy your local values before reopening; this view has not been replaced.");
  }
  render(current, local);
  message("Latest evidence displayed. Local inputs, if any, were retained for your review.");
});
$("reviews").onchange = () => { invalidatePreview(); reviewStatus(); };
$("instruction").oninput = invalidatePreview;
$("preview").onclick = () => run(async () => {
  if (dirty || remote) throw new Error("Save or review current local inputs before previewing outgoing context.");
  preview = await api("preview-send", {
    expectedRevision: snapshot.revision, submissionId: $("reviews").value, instruction: $("instruction").value
  });
  $("outgoing").value = preview.prompt; $("consent").hidden = false; $("confirmed").checked = false; $("send").disabled = true;
  message("Preview only. Nothing has been sent.");
});
$("confirmed").onchange = () => { $("send").disabled = !preview || !$("confirmed").checked; };
$("send").onclick = () => run(async () => {
  if (!preview || !$("confirmed").checked || dirty || remote) throw new Error("Review and confirm the current outgoing context first.");
  const state = await api("send", {
    expectedRevision: snapshot.revision, submissionId: $("reviews").value, instruction: $("instruction").value,
    hash: preview.hash, requestId: crypto.randomUUID()
  });
  render(state);
  const delivery = state.submissions.find(item => item.id === $("reviews").value)?.delivery;
  message(delivery?.status === "queued" ? "Queued in the owning Copilot session. This is not confirmation that the agent has finished." : "Delivery is uncertain. Check the conversation; do not automatically retry.");
});
addEventListener("beforeunload", event => { if (dirty) { event.preventDefault(); event.returnValue = ""; } });
function refreshTheme() {
  if (!snapshot) return;
  try { adapter.render(snapshot.expanded, adapter.values(), snapshot.document.actionContracts); }
  catch (error) { failure(error); }
}
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", refreshTheme);
new MutationObserver(refreshTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["style", "data-color-mode", "data-dark-theme", "data-light-theme", "class"] });
try {
  if (!token) throw new Error("Open this canvas from its owning Copilot session to obtain its capability.");
  render(await api("state")); message("Shared artifact ready. Ordinary edits and local calculations do not invoke Copilot.");
  const events = new EventSource(`/events?cap=${encodeURIComponent(token)}`);
  events.addEventListener("changed", refreshFromEvent);
  events.onerror = () => message("Live updates disconnected; reconnecting. Use Review latest before making another saved change.");
} catch (error) { failure(error); message("Canvas could not load."); }
