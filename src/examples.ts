import type { Document, ObjectValue } from "./model.js";
import { fail, object } from "./model.js";

export const workshopDataSchema: ObjectValue = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object", additionalProperties: false,
  properties: {
    title: { type: "string", minLength: 1, maxLength: 200 },
    attendees: { type: "integer", minimum: 1, maximum: 1000 },
    budget: { type: "number", minimum: 0, maximum: 1000000 },
    audience: { type: "string", maxLength: 100 },
    quotes: {
      type: "array", minItems: 1, maxItems: 10,
      items: {
        type: "object", additionalProperties: false,
        properties: {
          id: { type: "string", pattern: "^[a-z][a-z0-9-]*$" },
          name: { type: "string", maxLength: 100 },
          capacity: { type: "integer", minimum: 1 },
          room: { type: ["number", "null"], minimum: 0, maximum: 1000000 },
          perPerson: { type: ["number", "null"], minimum: 0, maximum: 1000000 },
          source: { type: "string", maxLength: 300 }
        },
        required: ["id", "name", "capacity", "room", "perPerson", "source"]
      }
    },
    agenda: { type: "array", maxItems: 20, items: { type: "string", maxLength: 200 } },
    costs: {
      type: "array", maxItems: 10,
      items: {
        type: "object", additionalProperties: false,
        properties: { name: { type: "string" }, summary: { type: "string" } },
        required: ["name", "summary"]
      }
    }
  },
  required: ["title", "attendees", "budget", "audience", "quotes", "agenda", "costs"]
};
const parameters: ObjectValue = {
  type: "object", additionalProperties: false,
  properties: {
    attendees: { type: "integer", minimum: 1, maximum: 1000 },
    budget: { type: "number", minimum: 0, maximum: 1000000 }
  }, required: ["attendees", "budget"]
};
const review = (choices: string[]): ObjectValue => ({
  type: "object", additionalProperties: false,
  properties: {
    selection: { type: "string", enum: choices },
    notes: { type: "string", maxLength: 2000 }
  }, required: ["selection", "notes"]
});

export function calculateWorkshop(data: ObjectValue): ObjectValue {
  if (!Array.isArray(data.quotes)) fail("example", "invalid_quotes", "/data/quotes", "Quotes must be an array.");
  const costs = data.quotes.map((quote, index) => {
    if (!object(quote) || typeof quote.name !== "string") fail("example", "invalid_quote", `/data/quotes/${index}`, "Invalid quote.");
    const total = typeof quote.room === "number" && typeof quote.perPerson === "number"
      ? Math.round((quote.room + quote.perPerson * Number(data.attendees)) * 100) / 100 : null;
    const capacity = Number(quote.capacity) >= Number(data.attendees) ? "capacity fits" : "not enough capacity";
    return {
      name: quote.name,
      summary: total === null ? `Price unknown; ${capacity}` :
        `$${total.toFixed(2)} USD; ${total <= Number(data.budget) ? "within budget" : "over budget"}; ${capacity}`
    };
  });
  return { ...data, costs };
}

function workshop(documentId: string): Document {
  return {
    documentVersion: 1, documentId, title: "Workshop planning", recipe: "workshop",
    dataSchema: workshopDataSchema,
    data: calculateWorkshop({
      title: "A practical AI workshop", attendees: 40, budget: 3000, audience: "Mixed experience",
      quotes: [
        { id: "studio", name: "Studio", capacity: 50, room: 1200, perPerson: 35, source: "Synthetic quote A; USD; no real availability implied" },
        { id: "library", name: "Library", capacity: 30, room: 500, perPerson: 20, source: "Synthetic quote B; USD; no real availability implied" },
        { id: "hall", name: "Hall", capacity: 60, room: null, perPerson: 40, source: "Synthetic quote C; room price unavailable" }
      ],
      agenda: ["09:00 - Welcome and shared goals", "10:00 - Guided hands-on exercise", "13:00 - Small-group projects", "15:00 - Reflection and next steps"]
    }),
    actionContracts: { parameters, review: review(["studio", "library", "hall"]) },
    template: {
      type: "AdaptiveCard", version: "1.5",
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
      body: [
        { type: "TextBlock", text: "${title}", size: "Large", weight: "Bolder", wrap: true },
        { type: "TextBlock", text: "Synthetic USD quotes. These are examples, not bookings. Save locally; send to Copilot only when you choose.", wrap: true },
        { type: "Input.Number", id: "attendees", label: "Attendees", value: "${attendees}", min: 1, max: 1000, isRequired: true, errorMessage: "Enter 1-1000 attendees." },
        { type: "Input.Number", id: "budget", label: "Budget (USD)", value: "${budget}", min: 0, max: 1000000, isRequired: true, errorMessage: "Enter a non-negative budget." },
        { type: "ActionSet", actions: [{ type: "Action.Submit", id: "parameters", title: "Save parameters and recalculate" }] },
        { type: "TextBlock", text: "Venue comparison", size: "Medium", weight: "Bolder" },
        { type: "Container", $data: "${costs}", items: [
          { type: "TextBlock", text: "${name}", weight: "Bolder" },
          { type: "TextBlock", text: "${summary}", wrap: true }
        ] },
        { type: "TextBlock", text: "Proposed agenda", size: "Medium", weight: "Bolder" },
        { type: "TextBlock", $data: "${agenda}", text: "${$data}", wrap: true },
        { type: "Input.ChoiceSet", id: "selection", label: "Venue to explore",
          errorMessage: "Choose a venue.", choices: [
            { title: "Studio", value: "studio" }, { title: "Library", value: "library" }, { title: "Hall (price unknown)", value: "hall" }
          ] },
        { type: "Input.Text", id: "notes", label: "Requirements and notes", isMultiline: true, maxLength: 2000,
          placeholder: "For example: step-free access required; keep the afternoon hands-on." }
      ],
      actions: [{ type: "Action.Submit", id: "review", title: "Save choice for review" }]
    }
  };
}

function comparison(documentId: string, pr: boolean): Document {
  return {
    documentVersion: 1, documentId, title: pr ? "PR readiness" : "Evidence-backed comparison", recipe: pr ? "pr-readiness" : "comparison",
    dataSchema: {
      $schema: "http://json-schema.org/draft-07/schema#", type: "object", additionalProperties: false,
      properties: {
        title: { type: "string", maxLength: 200 },
        context: { type: "string", maxLength: 2000 },
        evidence: { type: "array", maxItems: 20, items: {
          type: "object", additionalProperties: false,
          properties: { title: { type: "string", maxLength: 200 }, detail: { type: "string", maxLength: 2000 } },
          required: ["title", "detail"]
        } }
      }, required: ["title", "context", "evidence"]
    },
    data: {
      title: pr ? "Example PR review" : "Compare workshop catering",
      context: pr ? "Synthetic PR snapshot abc123. This is not a GitHub approval." : "Synthetic research. Prices and accessibility require confirmation.",
      evidence: pr ? [
        { title: "Checks", detail: "One failing test; see supplied check log." },
        { title: "Review status", detail: "Unknown, not approved." }
      ] : [
        { title: "Option A", detail: "Vegetarian menu available; quoted price $18/person." },
        { title: "Option B", detail: "Quoted price $15/person; allergen information unknown." }
      ]
    },
    actionContracts: { review: review(pr ? ["ready", "changes", "unknown"] : ["a", "b", "unknown"]) },
    template: {
      type: "AdaptiveCard", version: "1.5",
      body: [
        { type: "TextBlock", text: "${title}", size: "Large", weight: "Bolder", wrap: true },
        { type: "TextBlock", text: "${context}", wrap: true },
        { type: "Container", $data: "${evidence}", items: [
          { type: "TextBlock", text: "${title}", weight: "Bolder", wrap: true },
          { type: "TextBlock", text: "${detail}", wrap: true }
        ] },
        { type: "Input.ChoiceSet", id: "selection", label: "Your assessment", isRequired: true,
          errorMessage: "Choose an assessment.", choices: pr ? [
            { title: "Ready from my review", value: "ready" }, { title: "Needs changes", value: "changes" }, { title: "Need more evidence", value: "unknown" }
          ] : [
            { title: "Option A", value: "a" }, { title: "Option B", value: "b" }, { title: "Need more evidence", value: "unknown" }
          ] },
        { type: "Input.Text", id: "notes", label: "Corrections and notes", isMultiline: true, maxLength: 2000 }
      ], actions: [{ type: "Action.Submit", id: "review", title: "Save for review" }]
    }
  };
}

export const templateNames = ["workshop", "comparison", "pr-readiness"] as const;
export type TemplateName = typeof templateNames[number];
export function example(name: string, documentId: string): Document {
  if (name === "workshop") return workshop(documentId);
  if (name === "comparison") return comparison(documentId, false);
  if (name === "pr-readiness") return comparison(documentId, true);
  fail("contract", "unknown_template", "/templateName", "Choose workshop, comparison, or pr-readiness.");
}
