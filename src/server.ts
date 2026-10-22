import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { Store } from "./store.js";
import { documentSchema, object, revision, supportedTypes, WorkbenchError, type ObjectValue } from "./model.js";
import { templateNames } from "./examples.js";

export const capabilities = {
  cardVersion: "1.5", renderer: "adaptivecards 2.11.3", templating: "adaptivecards-templating official source 2.4.0-alpha.0+53352bb",
  expressionEngine: "adaptive-expressions 4.11.0", dataSchemaDialect: "draft-07", cardSchemaDialect: "draft-06",
  templates: templateNames, limits: { documentBytes: 262144, depth: 32, expandedElements: 500, evaluationMs: 2000, submissions: 50 },
  supportedTypes,
  documentSchema,
  handledActions: ["Action.Submit", "Action.Execute"], localActions: ["Action.ToggleVisibility", "Action.ShowCard"],
  unsupported: ["OpenUrl", "images/media", "refresh/authentication", "remote choices", "custom elements", "Markdown", "JSON Schema format"],
  consent: "Saving and local recalculation do not send messages. Preview and explicitly confirm Send to Copilot."
};
export async function startServer(store: Store, documentId: string, options: {
  assetDirectory?: URL; sessionLabel?: string; report?: (error: unknown) => void;
} = {}) {
  const assets = options.assetDirectory ?? new URL("./assets/", import.meta.url);
  const token = randomBytes(32).toString("base64url");
  const clients = new Set<ServerResponse>();
  let origin = "";
  const policy = [
    "default-src 'none'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
    "connect-src 'self'", "img-src 'none'", "font-src 'self'", "base-uri 'none'",
    "form-action 'none'", "object-src 'none'"
  ].join("; ");
  const files: Record<string, [string, string]> = {
    "/": ["index.html", "text/html; charset=utf-8"],
    "/app.js": ["app.js", "text/javascript; charset=utf-8"],
    "/adapter.js": ["adapter.js", "text/javascript; charset=utf-8"],
    "/adaptivecards.js": ["adaptivecards.js", "text/javascript; charset=utf-8"],
    "/styles.css": ["styles.css", "text/css; charset=utf-8"]
  };
  function headers(response: ServerResponse) {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Security-Policy", policy);
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Content-Type-Options", "nosniff");
  }
  function json(response: ServerResponse, status: number, value: unknown) {
    headers(response);
    response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(value));
  }
  function authorized(request: IncomingMessage, url: URL): boolean {
    const candidate = request.headers.authorization?.replace(/^Bearer /, "") ?? (url.pathname === "/events" ? url.searchParams.get("cap") : "");
    if (!candidate) return false;
    const left = Buffer.from(candidate), right = Buffer.from(token);
    return left.length === right.length && timingSafeEqual(left, right);
  }
  async function body(request: IncomingMessage): Promise<ObjectValue> {
    if (request.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") throw new WorkbenchError("content_type", "Use application/json.", [], 415);
    const parts: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 262144) throw new WorkbenchError("body_limit", "Request exceeds 256 KiB.", [], 413);
      parts.push(chunk);
    }
    let data: unknown;
    try { data = JSON.parse(Buffer.concat(parts).toString("utf8")); }
    catch { throw new WorkbenchError("invalid_json", "Malformed JSON request."); }
    if (!object(data)) throw new WorkbenchError("invalid_body", "A JSON object is required.");
    return data;
  }
  async function handle(request: IncomingMessage, response: ServerResponse) {
    if (request.headers.host !== new URL(origin).host) throw new WorkbenchError("host_rejected", "Untrusted loopback host.", [], 403);
    const url = new URL(request.url ?? "/", origin);
    const file = files[url.pathname];
    if (request.method === "GET" && file) {
      const bytes = await readFile(new URL(file[0], assets));
      headers(response);
      response.writeHead(200, { "Content-Type": file[1] });
      response.end(bytes);
      return;
    }
    if (!authorized(request, url)) throw new WorkbenchError("unauthorized", "This canvas capability is missing or expired.", [], 401);
    if ((request.headers.origin && request.headers.origin !== origin) ||
        request.headers["sec-fetch-site"] === "cross-site" ||
        (request.method === "POST" && request.headers.origin !== origin)) {
      throw new WorkbenchError("origin_rejected", "Untrusted request origin.", [], 403);
    }
    if (request.method === "GET" && url.pathname === "/api/state") {
      json(response, 200, { ...await store.get(documentId), capabilities, sessionLabel: options.sessionLabel ?? "Owning Copilot session" });
      return;
    }
    if (request.method === "GET" && url.pathname === "/events") {
      headers(response);
      response.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", Connection: "keep-alive" });
      response.write("event: ready\ndata: {}\n\n");
      clients.add(response);
      request.on("close", () => clients.delete(response));
      return;
    }
    if (request.method !== "POST") throw new WorkbenchError("method_not_allowed", "Use a documented GET or POST endpoint.", [], 405);
    const data = await body(request);
    const expected = data.expectedRevision;
    revision(expected);
    if (url.pathname === "/api/submit") {
      if (typeof data.actionId !== "string") throw new WorkbenchError("action_required", "Action ID required.");
      json(response, 200, await store.submit(documentId, expected, data.actionId, data.inputs));
    } else if (url.pathname === "/api/draft") {
      json(response, 200, await store.saveDraft(documentId, expected, data.inputs));
    } else if (url.pathname === "/api/preview-send" || url.pathname === "/api/send") {
      if (typeof data.submissionId !== "string") throw new WorkbenchError("submission_required", "Submission ID required.");
      if (url.pathname === "/api/preview-send") json(response, 200, await store.previewSend(documentId, expected, data.submissionId, data.instruction));
      else {
        if (typeof data.requestId !== "string") throw new WorkbenchError("request_required", "Request ID required.");
        json(response, 200, await store.send(documentId, expected, data.submissionId, data.instruction, data.hash, data.requestId));
      }
    } else throw new WorkbenchError("not_found", "Unknown endpoint.", [], 404);
  }
  const server = createServer((request, response) => {
    void handle(request, response).catch(error => {
      if (!(error instanceof WorkbenchError) || error.status >= 500) options.report?.(error);
      if (!response.headersSent) json(response, error instanceof WorkbenchError ? error.status : 500, {
        code: error instanceof WorkbenchError ? error.code : "internal_error",
        message: error instanceof WorkbenchError ? error.message : "Unexpected server error. Check the extension log.",
        diagnostics: error instanceof WorkbenchError ? error.diagnostics : []
      });
      else response.destroy();
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve(); });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Loopback server has no address.");
  origin = `http://127.0.0.1:${address.port}`;
  const changed = (id: string) => {
    if (id === documentId) for (const client of clients) client.write("event: changed\ndata: {}\n\n");
  };
  store.on("changed", changed);
  const heartbeat = setInterval(() => { for (const client of clients) client.write(": heartbeat\n\n"); }, 20000);
  heartbeat.unref();
  let closed = false;
  return {
    url: `${origin}/#${token}`,
    async close() {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      store.off("changed", changed);
      for (const client of clients) client.end();
      clients.clear();
      server.closeIdleConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  };
}
