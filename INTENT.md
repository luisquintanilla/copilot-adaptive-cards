# Standards-grounded building blocks for shared Copilot workspaces

## Problem Statement

People and Copilot need to work together on durable plans, comparisons and
reviews without rebuilding common UI or describing every click in chat. A
structured contract should ground generated interfaces without becoming a new,
proprietary UI language.

## Context

Copilot canvas extensions supply a web UI and agent-facing capabilities, not a
verified native Adaptive Cards JSON renderer. This project embeds the existing
renderer and explicitly connects state, inputs and consent.

The [Flint research](https://www.microsoft.com/en-us/research/blog/flint-a-visualization-language-for-the-ai-era/)
motivates separating model intent from trusted rendering. Adaptive Cards supplies
the presentation vocabulary; JSON Schema validates data and actions; official
templating binds them. Schema.org can supply domain meaning, not inferred layout.

Cards fit common structured content and controls. Specialized charts, diagrams,
editors, audio and 3D still need specialized renderers. The reference hybrid shell
demonstrates composition rather than pretending cards are the whole canvas.

## Goals

- Custom designs made from existing, standard Adaptive Cards building blocks.
- Supplied data, inspectable schemas, useful diagnostics and a repair workflow.
- A reusable card adapter plus an installable reference canvas.
- Human choices and notes preserved across data updates and reopening.
- Local deterministic interactions without a model turn.
- Saved reviews followed by a separate, explicit preview and Send to Copilot.
- A non-coding hero, with comparison and PR-readiness recipes on the same host.
- A standalone GitHub-hostable project, separate from the AdaptiveCards SDK.

## Non-Goals

No new element plugins or UI DSL, generated HTML/JavaScript, generic
schema-to-layout compiler, model provider, Flint integration, automatic agent
invocation, booking/email/calendar/business connectors, GitHub approval/merge,
or automatic repository/release publication. Installation does not force every
UI request to use cards. Schema-valid output is not proof of good UX or truth.

## Proposed Solution

The model supplies a standard card or template, data and explicit JSON Schema
contracts. A deterministic pipeline validates and expands it. A reusable browser
adapter renders it; a trusted shell handles durable identity, diagnostics,
history and consent. UI HTTP/SSE and agent canvas actions share one store.

The primary hero is workshop planning: compare supplied venue quotes, edit
attendance/budget, recalculate locally, record a venue and accessibility notes,
save/review, explicitly send context, then revise the agenda without discarding
human inputs. Missing prices remain unknown and capacity is separate from cost.
The example evidence is synthetic and never implies real availability.

Comparison and PR readiness are thin recipes, not new applications or
connectors. PR readiness never posts a GitHub review or merges a PR.

## What Success Looks Like

The installed extension registers and opens through actual app RPC. Standard
cards render and bind; supported local work does not call an agent. Human inputs
survive shared-state revision and provider reopening. Only confirmed sending
queues a message in the owning session. A queue acknowledgement is not agent
completion.

Deterministic tests gate contract/state/consent behavior; browser checks exercise
the real renderer. Live SDK evidence is recorded separately from browser
fixtures. Clean-install archives run without npm or network at runtime. Manual
generation tasks and a rubric exist, but no unmeasured model-quality improvement
or broad future SDK compatibility is claimed.

## Todos

The MVP implementation and its verification live in the source, tests and
verification record. Before publishing, the owner must choose a destination and
authorize repository creation. Before production adoption, review permissions,
package provenance and experimental SDK compatibility for that environment.
