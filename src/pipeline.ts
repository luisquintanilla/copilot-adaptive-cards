import { readFileSync } from "node:fs";
import { createContext, Script } from "node:vm";
import { Ajv, type ValidateFunction } from "ajv";
import draft6 from "ajv/dist/refs/json-schema-draft-06.json" with { type: "json" };
import { calculateWorkshop, workshopDataSchema } from "./examples.js";
import { documentSchema, fail, object, safeTree, supportedTypes, WorkbenchError, type Document, type ObjectValue } from "./model.js";

const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false });
// The upstream draft-06 file retains a legacy draft-04 ID annotation.
ajv.removeKeyword("id");
ajv.addMetaSchema(draft6);
const upstream = JSON.parse(readFileSync(new URL("./schemas/adaptive-card-1.5.json", import.meta.url), "utf8"));
const validateCard = ajv.compile(upstream);
const envelope = ajv.compile(documentSchema);
const userValidator = new Ajv({ allErrors: true, strict: true });
const allowedTypes = new Set<string>(supportedTypes);
const context = createContext({ console: { log() {}, warn() {}, error() {} }, URL, TextEncoder, TextDecoder, setTimeout, clearTimeout });
context.window = context;
context.self = context;
context.global = context;
for (const name of ["adaptive-expressions.js", "adaptivecards-templating.js"]) {
  new Script(readFileSync(new URL(`./vendor/${name}`, import.meta.url), "utf8"), { filename: name }).runInContext(context);
}
interface TemplateEngine {
  GlobalSettings: { getUndefinedFieldValueSubstitutionString?: (path: string) => string };
  Template: new (source: unknown) => {
    expand(context: { $root: unknown }): unknown;
    getLastTemplateExpansionWarnings(): string[];
  };
}
const engine = context.ACData as TemplateEngine;
engine.GlobalSettings.getUndefinedFieldValueSubstitutionString = path => fail("binding", "missing_binding", path, "A binding refers to missing or null data. Supply it or explicitly guard the expression.");

function check(validate: ValidateFunction, data: unknown, stage: string): void {
  if (!validate(data)) {
    throw new WorkbenchError(`${stage}_invalid`, `Validation failed at ${stage}.`, (validate.errors ?? []).map(error => ({
      stage, code: error.keyword, path: error.instancePath || "/", message: `${error.message}; ${JSON.stringify(error.params)}`
    })));
  }
}

function schemaCheck(schema: ObjectValue): ValidateFunction {
  const walk = (node: unknown, refs: Set<string>, depth = 0): void => {
    if (depth > 32) fail("schema", "schema_depth", "/", "Schema reference nesting exceeds 32.");
    if (Array.isArray(node)) node.forEach(value => walk(value, refs, depth + 1));
    else if (object(node)) {
      if (node.$schema !== undefined && node.$schema !== "http://json-schema.org/draft-07/schema#") {
        fail("schema", "schema_dialect", "/$schema", "Host data and submission schemas use JSON Schema draft-07.");
      }
      if (node.format !== undefined) fail("schema", "unsupported_format", "/format", "MVP schemas use explicit constraints; format annotations are not supported.");
      if (node.$id !== undefined) fail("schema", "external_schema_id", "/$id", "Use local schema references, without external IDs.");
      if (node.$ref !== undefined) {
        if (typeof node.$ref !== "string" || !node.$ref.startsWith("#/")) fail("schema", "external_ref", "/$ref", "Only local #/ references are supported.");
        if (refs.has(node.$ref)) fail("schema", "cyclic_ref", "/$ref", "Cyclic schema references are unsupported.");
        let target: unknown = schema;
        for (const key of node.$ref.slice(2).split("/").map(part => part.replace(/~1/g, "/").replace(/~0/g, "~"))) {
          target = object(target) ? target[key] : undefined;
        }
        if (target === undefined) fail("schema", "missing_ref", "/$ref", "Reference does not exist.");
        walk(target, new Set([...refs, node.$ref]), depth + 1);
      }
      for (const key of ["properties", "patternProperties", "definitions", "$defs", "dependencies"]) {
        if (object(node[key])) for (const value of Object.values(node[key])) {
          if (!Array.isArray(value)) walk(value, refs, depth + 1);
        }
      }
      for (const key of ["items", "additionalItems", "additionalProperties", "contains", "propertyNames", "not", "if", "then", "else", "allOf", "anyOf", "oneOf"]) {
        if (node[key] !== undefined) walk(node[key], refs, depth + 1);
      }
    }
  };
  walk(schema, new Set());
  try { return userValidator.compile(schema); }
  catch (error) { fail("schema", "invalid_schema", "/", error instanceof Error ? error.message : "Invalid schema."); }
}

function walkCard(root: unknown, visit: (node: ObjectValue, path: string) => void, path = ""): void {
  if (Array.isArray(root)) root.forEach((item, index) => walkCard(item, visit, `${path}/${index}`));
  else if (object(root)) {
    visit(root, path);
    for (const key of ["body", "items", "columns", "actions", "card", "selectAction", "inlines", "fallback"]) {
      if (root[key] !== undefined) walkCard(root[key], visit, `${path}/${key}`);
    }
  }
}

export function compile(source: unknown): { document: Document; expanded: ObjectValue } {
  safeTree(source);
  if (Buffer.byteLength(JSON.stringify(source)) > 256 * 1024) fail("contract", "size_limit", "/", "Maximum document size is 256 KiB.");
  check(envelope, source, "contract");
  const document = structuredClone(source) as Document;
  check(schemaCheck(document.dataSchema), document.data, "data");
  if (document.recipe === "workshop") {
    check(schemaCheck(workshopDataSchema), document.data, "data");
    const quoteIds = (document.data.quotes as ObjectValue[]).map(quote => quote.id);
    if (new Set(quoteIds).size !== quoteIds.length) fail("data", "duplicate_quote", "/quotes", "Quote IDs must be unique.");
    document.data = calculateWorkshop(document.data);
    check(schemaCheck(document.dataSchema), document.data, "data");
  }
  for (const contract of Object.values(document.actionContracts)) {
    if (contract.type !== "object" || contract.additionalProperties !== false || !object(contract.properties)) {
      fail("schema", "action_shape", "/actionContracts", "Action schemas require type object, properties, and additionalProperties false.");
    }
    schemaCheck(contract);
  }
  let expanded: unknown = document.card;
  if (!document.card) {
    const templateSource = structuredClone(document.template);
    const conditions = (value: unknown, path = "/template"): void => {
      if (Array.isArray(value)) value.forEach((item, index) => conditions(item, `${path}/${index}`));
      else if (object(value)) {
        if ("$when" in value && (typeof value.$when !== "string" || !/^\$\{.+\}$/.test(value.$when))) {
          fail("binding", "invalid_condition", `${path}/$when`, "$when must be a standard ${...} Boolean expression.");
        }
        if (typeof value.$when === "string") {
          const constant = /^\$\{\s*(true|false)\s*\}$/.exec(value.$when);
          // SDK 2.3.1 interpolates Boolean constants as strings. An equivalent
          // standard comparison preserves their type without changing source.
          if (constant) value.$when = `\${${constant[1]} == true}`;
        }
        for (const [key, item] of Object.entries(value)) conditions(item, `${path}/${key}`);
      }
    };
    conditions(templateSource);
    try {
      const template = new engine.Template(templateSource);
      expanded = template.expand({ $root: document.data });
      const warnings = template.getLastTemplateExpansionWarnings();
      if (warnings.length) throw new WorkbenchError("binding_warning", "The template engine reported expansion warnings.", warnings.map(message => ({
        stage: "binding", code: "expansion_warning", path: "/template", message
      })));
    } catch (error) {
      if (error instanceof WorkbenchError) throw error;
      fail("binding", "expression_error", "/template", error instanceof Error ? error.message : String(error));
    }
  }
  if (!object(expanded)) fail("binding", "invalid_expansion", "/", "The expanded card must be an object.");
  safeTree(expanded);
  if (expanded.version !== "1.5") fail("card", "unsupported_version", "/version", "This host supports card version 1.5.");
  check(validateCard, expanded, "card");
  const inputs = new Set<string>();
  const actionIds = new Set<string>();
  const allIds = new Set<string>();
  let elements = 0;
  walkCard(expanded, (node, path) => {
    if (typeof node.type === "string") {
      if (++elements > 500) fail("card", "element_limit", path, "Maximum 500 expanded elements.");
      if (!allowedTypes.has(node.type)) fail("capability", "unsupported_element", path, `Unsupported type: ${node.type}`);
      if (node.type.startsWith("Input.")) {
        if (typeof node.id !== "string" || !node.id || inputs.has(node.id)) fail("card", "input_id", path, "Input IDs must be nonempty and unique.");
        inputs.add(node.id);
      }
      if (["Action.Submit", "Action.Execute"].includes(node.type)) {
        if (typeof node.id !== "string" || !document.actionContracts[node.id] || actionIds.has(node.id)) {
          fail("action", "action_contract", path, "Each host-handled action needs a unique id and a declared submission schema.");
        }
        actionIds.add(node.id);
        if (node.data !== undefined && !object(node.data)) fail("action", "action_data", path, "Action data must be an object.");
      }
      if (node.id !== undefined) {
        if (typeof node.id !== "string" || !node.id || allIds.has(node.id)) fail("card", "duplicate_id", path, "Element/action IDs must be nonempty, unique strings.");
        allIds.add(node.id);
      }
    }
    for (const feature of ["refresh", "authentication", "inlineAction", "choices.data", "backgroundImage"]) {
      if (feature in node) fail("capability", "unsupported_feature", `${path}/${feature}`, `Unsupported feature: ${feature}`);
    }
    for (const value of Object.values(node)) {
      if (typeof value === "string" && /\$\{[^}]*\}/.test(value)) fail("binding", "unresolved_binding", path, "Unresolved expression in expanded card.");
    }
  });
  for (const id of Object.keys(document.actionContracts)) {
    if (!actionIds.has(id)) fail("action", "unused_contract", `/actionContracts/${id}`, "Action contract has no matching card action.");
  }
  return { document, expanded };
}

export function normalizeSubmission(document: Document, actionId: string, raw: unknown): ObjectValue {
  const { expanded } = compile(document);
  if (!object(raw)) fail("submission", "invalid_inputs", "/", "Input object required.");
  safeTree(raw);
  let action: ObjectValue | undefined;
  const inputs = new Map<string, ObjectValue>();
  walkCard(expanded, node => {
    if (typeof node.type === "string" && node.type.startsWith("Input.") && typeof node.id === "string") inputs.set(node.id, node);
    if (node.id === actionId && ["Action.Submit", "Action.Execute"].includes(String(node.type))) action = node;
  });
  const contract = document.actionContracts[actionId];
  if (!action || !contract || !object(contract.properties)) fail("submission", "unknown_action", "/actionId", "No declared card action.");
  const normalized: ObjectValue = { ...raw };
  for (const [key, value] of Object.entries(normalized)) {
    const input = inputs.get(key);
    const property = contract.properties[key];
    if (input?.type === "Input.Number" && typeof value === "string" && value.trim() && /^-?(?:\d+\.?\d*|\.\d+)$/.test(value)) normalized[key] = Number(value);
    if (input?.type === "Input.Toggle" && object(property) && property.type === "boolean") {
      if (value === (input.valueOn ?? "true")) normalized[key] = true;
      else if (value === (input.valueOff ?? "false")) normalized[key] = false;
    }
  }
  if (object(action.data)) {
    for (const [key, value] of Object.entries(action.data)) {
      if (key in normalized || inputs.has(key)) fail("submission", "input_collision", `/${key}`, "Hidden action data must not collide with inputs.");
      normalized[key] = value;
    }
  }
  check(schemaCheck(contract), normalized, "submission");
  return normalized;
}
