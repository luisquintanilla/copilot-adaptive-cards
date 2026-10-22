export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type ObjectValue = Record<string, unknown>;
export function object(value: unknown): value is ObjectValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export interface Diagnostic { stage: string; code: string; path: string; message: string }
export class WorkbenchError extends Error {
  constructor(public code: string, message: string, public diagnostics: Diagnostic[] = [], public status = 400) {
    super(message);
  }
}
export function fail(stage: string, code: string, path: string, message: string): never {
  throw new WorkbenchError(code, message, [{ stage, code, path, message }]);
}
export interface Document {
  documentVersion: 1;
  documentId: string;
  title: string;
  recipe?: "workshop" | "comparison" | "pr-readiness";
  card?: ObjectValue;
  template?: ObjectValue;
  data: ObjectValue;
  dataSchema: ObjectValue;
  actionContracts: Record<string, ObjectValue>;
}
export interface Submission {
  id: string;
  revision: number;
  evidenceRevision: number;
  actionId: string;
  inputs: ObjectValue;
  createdAt: string;
  delivery?: { status: "sending" | "queued" | "failed" | "uncertain"; requestId: string; messageId?: string; error?: string };
}
export interface Stored {
  storeVersion: 1;
  revision: number;
  evidenceRevision: number;
  document: Document;
  draft: ObjectValue;
  submissions: Submission[];
}
export interface Snapshot extends Stored { expanded: ObjectValue }
export const idPattern = "^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$";
export const documentSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object", additionalProperties: false,
  properties: {
    documentVersion: { const: 1 }, documentId: { type: "string", pattern: idPattern },
    title: { type: "string", minLength: 1, maxLength: 200 },
    recipe: { enum: ["workshop", "comparison", "pr-readiness"] },
    card: { type: "object" }, template: { type: "object" },
    data: { type: "object" }, dataSchema: { type: "object" },
    actionContracts: { type: "object", maxProperties: 20, additionalProperties: { type: "object" } }
  },
  required: ["documentVersion", "documentId", "title", "data", "dataSchema", "actionContracts"],
  oneOf: [{ required: ["card"], not: { required: ["template"] } }, { required: ["template"], not: { required: ["card"] } }]
};
export const supportedTypes = [
  "AdaptiveCard", "TextBlock", "RichTextBlock", "TextRun", "FactSet", "Container", "ColumnSet", "Column",
  "Input.Text", "Input.Number", "Input.Toggle", "Input.ChoiceSet", "Input.Date", "Input.Time",
  "ActionSet", "Action.Submit", "Action.Execute", "Action.ShowCard", "Action.ToggleVisibility"
] as const;
export function validId(value: unknown): asserts value is string {
  if (typeof value !== "string" || !new RegExp(idPattern).test(value)) {
    fail("contract", "invalid_id", "/documentId", "Use 1-64 letters, digits, dots, underscores or hyphens, starting with a letter or digit.");
  }
}
export function revision(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) fail("contract", "invalid_revision", "/expectedRevision", "A non-negative integer revision is required.");
}
export function safeTree(value: unknown, path = "", depth = 0): void {
  if (depth > 32) fail("contract", "depth_limit", path, "Maximum JSON depth is 32.");
  if (typeof value === "number" && !Number.isFinite(value)) fail("contract", "invalid_number", path, "Finite JSON numbers are required.");
  if (Array.isArray(value)) value.forEach((item, index) => safeTree(item, `${path}/${index}`, depth + 1));
  else if (object(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (["__proto__", "prototype", "constructor"].includes(key)) fail("contract", "unsafe_key", `${path}/${key}`, "Unsafe property key.");
      safeTree(item, `${path}/${key}`, depth + 1);
    }
  } else if (value !== null && !["number", "boolean", "string"].includes(typeof value)) {
    fail("contract", "not_json", path, "Only JSON values are accepted.");
  }
}
export function cardInputs(root: unknown): Map<string, ObjectValue> {
  const inputs = new Map<string, ObjectValue>();
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (object(value)) {
      if (typeof value.type === "string" && value.type.startsWith("Input.") && typeof value.id === "string") inputs.set(value.id, value);
      for (const key of ["body", "items", "columns", "actions", "card", "selectAction", "inlines", "fallback"]) {
        if (value[key] !== undefined) walk(value[key]);
      }
    }
  };
  walk(root);
  return inputs;
}
export function cardInputIds(root: unknown): Set<string> {
  return new Set(cardInputs(root).keys());
}
