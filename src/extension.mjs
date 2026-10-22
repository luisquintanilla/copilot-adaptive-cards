import { join } from "node:path";
import { joinSession, createCanvas, CanvasError } from "@github/copilot-sdk/extension";
import { Store, startServer, capabilities, documentSchema, validateDocument, example, templateNames, WorkbenchError, idPattern } from "./core.mjs";

const panels = new Map();
let session;
let store;
const objectSchema = (properties, required = []) => ({ type: "object", additionalProperties: false, properties, required });
const expected = { type: "integer", minimum: 0 };
const action = (name, description, schema, handler) => ({
  name, description, inputSchema: schema,
  handler: async ctx => {
    const panel = panels.get(ctx.instanceId);
    if (!panel) throw new CanvasError("panel_unavailable", "This panel has no live provider binding. After an extension reload, open a fresh instanceId with the same documentId to recover saved work.");
    try { return await handler(panel.documentId, ctx.input ?? {}); }
    catch (error) {
      if (error instanceof WorkbenchError) throw new CanvasError(error.code, JSON.stringify({ message: error.message, diagnostics: error.diagnostics }));
      throw error;
    }
  }
});
const canvas = createCanvas({
  id: "adaptive-cards-workbench",
  displayName: "Adaptive Cards Workbench",
  description: "Shared, persistent, standard Adaptive Cards for planning, comparison and review; data binding, local calculations, explicit human-to-Copilot context.",
  inputSchema: objectSchema({
    documentId: { type: "string", pattern: idPattern },
    templateName: { enum: templateNames }
  }, ["documentId"]),
  actions: [
    action("get_capabilities", "Read supported standards, limits and consent behavior before generating a card.", objectSchema({}), async () => capabilities),
    action("list_templates", "List standard reusable recipes; these are not custom element types.", objectSchema({}), async () => templateNames),
    action("get_document", "Read current source/data, revision, saved human draft and review history before reasoning or updating.", objectSchema({}), id => store.get(id)),
    action("validate_document", "Validate a candidate without persisting it; diagnostics identify the failing contract stage/path.", objectSchema({ document: documentSchema }, ["document"]), async (_, input) => validateDocument(input.document)),
    action("set_document", "Save a valid document at expectedRevision. Preserve human choices/notes; conflicting changes fail.", objectSchema({ expectedRevision: expected, document: documentSchema }, ["expectedRevision", "document"]), (id, input) => store.setDocument(id, input.expectedRevision, input.document)),
    action("set_data", "Replace validated data without regenerating the template, with revision protection. Preserve current human edits.", objectSchema({ expectedRevision: expected, data: { type: "object" } }, ["expectedRevision", "data"]), (id, input) => store.setData(id, input.expectedRevision, input.data)),
    action("get_submissions", "Explicitly inspect saved human review values and their evidence revisions. This sends no message.", objectSchema({}), async id => (await store.get(id)).submissions),
    action("use_template", "Explicitly replace source with a bundled recipe; saved draft conflicts are rejected.", objectSchema({ expectedRevision: expected, templateName: { enum: templateNames } }, ["expectedRevision", "templateName"]), (id, input) => store.setDocument(id, input.expectedRevision, example(input.templateName, id)))
  ],
  open: async ctx => {
    if (!session?.workspacePath) throw new CanvasError("workspace_unavailable", "A session artifact workspace is required for durable storage. Retry after the provider joins.");
    store ??= new Store(join(session.workspacePath, "adaptive-cards-workbench"), message => session.send(message));
    const existing = panels.get(ctx.instanceId);
    if (existing) {
      if (existing.documentId !== ctx.input.documentId) throw new CanvasError("document_mismatch", "This panel already belongs to another document. Use a new instance ID.");
      return { title: "Adaptive Cards Workbench", url: existing.server.url };
    }
    await store.open(ctx.input.documentId, ctx.input.templateName ?? "workshop");
    const server = await startServer(store, ctx.input.documentId, {
      sessionLabel: `Copilot session ${session.sessionId}`,
      report: error => { void session.log(error instanceof Error ? error.message : String(error), { level: "error" }); }
    });
    panels.set(ctx.instanceId, { documentId: ctx.input.documentId, server });
    return { title: "Adaptive Cards Workbench", url: server.url };
  },
  onClose: async ctx => {
    const panel = panels.get(ctx.instanceId);
    panels.delete(ctx.instanceId);
    await panel?.server.close();
  }
});
session = await joinSession({ canvases: [canvas] });
for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => {
  void Promise.all([...panels.values()].map(panel => panel.server.close())).finally(() => process.exit(0));
});
