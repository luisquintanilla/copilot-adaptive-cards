# Adaptive Cards Workbench

A reusable, standards-grounded UI component and reference canvas for the **GitHub Copilot app**. Adaptive Cards are a building block inside a hybrid canvas, not a restriction on every canvas experience.

**Status: experimental MVP, locally verified.** This is a custom integration with the experimental canvas SDK, not native Adaptive Cards support in Copilot and not an official GitHub or Microsoft product. Installation does not make every "generate a UI" request use cards. See [intent](INTENT.md) and [verification and limits](VERIFICATION.md).

**Known limits:** templating uses a pinned official **alpha-source** fix; extension reload requires a **fresh panel with the same document ID** in the tested app build. This is a source distribution that must be built before installation, not a prebuilt extension-install URL. The original Windows checks did not establish a normal npm restore; consult [verification](VERIFICATION.md) and the repository's Actions results rather than assuming CI or cross-version compatibility.

## Intent

Language models generate inspectable structured documents; a deterministic host validates, binds, renders and saves them. People manipulate a durable shared artifact. Copilot can read that artifact and revise it without discarding human choices. Ordinary clicks are not model calls.

Adaptive Cards define presentation and interaction. JSON Schema validates the supplied data and action payloads. Official Adaptive Cards templating binds those data to standard elements. None of these infer a good layout from arbitrary Schema.org data. Schema.org is optional domain metadata, not an MVP dependency. [Flint](https://www.microsoft.com/en-us/research/blog/flint-a-visualization-language-for-the-ai-era/) is architectural inspiration, not the renderer.

## Hero: plan a workshop together

1. Open `adaptive-cards-workbench` with a stable `documentId` and `templateName: "workshop"`.
2. Inspect synthetic USD venue quotes and an agenda. Change attendee count/budget; **Save parameters and recalculate** runs a fixed local calculation. Unknown prices stay unknown, and capacity is reported separately from affordability.
3. Choose a venue, add accessibility requirements, and **Save choice for review**. Saved inputs and reviews survive closing, reopening under another panel ID, and provider restarts.
4. Preview the exact outgoing context. Check consent and choose **Send to Copilot** to queue it in the owning conversation. This is not a booking or a claim the agent has finished.
5. Copilot reads `get_document`, revises the agenda with `set_data` and the current revision, and preserves the saved choice/notes. Both participants see the same artifact.

`comparison` and `pr-readiness` are smaller recipes on the same host. They do not fetch live business data or approve GitHub PRs.

## Develop

Requires Node 24+, a Copilot app version with canvas extensions, and npm. The SDK is supplied by the app, not installed in this project.

```powershell
npm ci
npm run check
npm run package
```

Runtime libraries are committed, version-pinned and integrity-checked. `npm run vendor` refreshes the same pinned official distributions and verifies their published file integrity; review any change before committing it. No runtime CDN, model-provider key, package installation or network connector is required. Browser tests use installed Edge on Windows or `BROWSER_EXECUTABLE`; otherwise install the pinned Playwright Chromium browser for development only.

If a managed shell cannot resolve `node` inside npm's child shell, use `node scripts\check.mjs` or `node scripts\check.mjs --package` directly. The runner uses the current Node executable for all child commands. A normal developer dependency restore is still required.

Build output is `build\extension`; installable archives are produced by the package script. Copy the **contents** of the extension folder to one immediate directory:

- Project: `.github\extensions\adaptive-cards-workbench`
- User: `$COPILOT_HOME\extensions\adaptive-cards-workbench`
- Session: `$COPILOT_HOME\session-state\<session-id>\extensions\adaptive-cards-workbench`

`COPILOT_HOME` defaults to `~\.copilot`. Reload extensions, inspect its log, and open the canvas through Copilot. Do not copy a `node_modules` folder or install another Copilot SDK. Optionally copy the supplied authoring skill to the conventional `.github\skills\adaptive-cards-workbench` directory; a `skills` folder inside an extension is documentation, not assumed to be automatically registered. Use a folder/repository/archive distribution; the expression bundle exceeds the app's per-file Gist sharing limit. Packaging requires `tar` (included in current Windows, Linux and macOS); runtime installation does not.

The source repository requires a build; its root is not a prebuilt extension-install URL. Clone/build the source and copy `build\extension`, or install a locally generated runtime archive. GitHub Actions artifacts, when available from a successful run, are build outputs, not a separately published GitHub release.

## Contracts and architecture

`src\model.ts` describes the versioned document envelope: stable identity/title, exactly one standard `card` or `template`, `data`, draft-07 `dataSchema`, and named draft-07 `actionContracts`. There is no custom card element or executable handler syntax.

Validation proceeds through envelope, schema, data, official template expansion, the unmodified upstream card schema, host capabilities, and action payload checks. Diagnostics identify stage/code/path. Generated source is never evaluated as JavaScript. Trusted official template libraries run in a short-lived worker with a two-second deadline and a 128 MiB old-generation limit; Node VM is used to load trusted browser bundles, **not claimed as a security sandbox**.

The browser component is `src\web\adapter.js`; the trusted hybrid shell provides artifact identity, diagnostics, history and explicit consent. Source/data updates use agent-facing canvas actions. UI submissions use authenticated loopback HTTP; SSE announces saved changes. These are separate paths into the same durable store. Adaptive Cards actions never automatically become agent tools.

Other canvas authors can reuse `CardAdapter(element, onSubmit, onInputChanged)` and call `render(expandedCard, savedDraft, actionContracts)`, then `values()` to capture inputs. Load the pinned renderer and validate/expand documents on the trusted side first. The adapter itself has no Copilot SDK dependency; its callback is not an agent invocation. Reuse the contract/validation boundary as well as the visual component.

Storage is session-scoped: `<session.workspacePath>\adaptive-cards-workbench\<documentId>.json`. `instanceId` identifies a view, not saved data. Writes are atomic and serialized within the provider. Expected revisions reject stale changes. Updates cannot silently remove/retype saved inputs or drop a selected choice. A person can explicitly confirm **Clear input draft...** (history stays) or open a new document to resolve an incompatible design; agent actions do not clear drafts. Evidence revisions distinguish source/data changes from draft/history bookkeeping; stale reviews cannot be sent. This is not a multi-process database or cross-session collaboration service. Keep backups before manual file edits.

### Host capability profile

- Standard card **1.5**; upstream draft-06 card schema. Adaptive Cards JS 2.11.3, expressions 4.11.0, and unmodified official templating source snapshot **2.4.0-alpha.0+53352bb**.
- Text, facts, containers/columns, basic inputs, Submit/Execute, ShowCard and ToggleVisibility. Each host-handled action requires a declared payload schema.
- Standard `$data`/`${...}` binding and `$when` Boolean expression strings. Missing/unresolved fields and engine warnings are errors rather than success-shaped UI.
- A narrow compatibility normalization expands `${true}`/`${false}` conditions as equivalent standard Boolean comparisons, avoiding the SDK's constant-to-string interpolation issue. Saved authoring source is unchanged. Other non-Boolean condition results follow the official engine's false behavior; use Boolean data schemas/comparisons, not truthiness.
- Plain-text Markdown policy. No remote images, URLs, media, refresh/authentication, dynamic choices, inline actions, custom elements or generated HTML/JS.
- Data/submission schemas use strict draft-07, local acyclic references and explicit constraints. No remote IDs/references or `format` annotations.
- Maximum 256 KiB document, depth 32, 500 expanded elements, 16 KiB draft, 32 KiB outgoing context and 50 submissions per artifact. History is never silently pruned.

The loopback server binds `127.0.0.1` with an OS-assigned port. State/mutations/events require a per-panel random capability; mutations require the exact Origin and Host. Public static assets contain no document data. The capability is in the canvas URL fragment and must be treated as a credential. SSE uses a capability query because native EventSource has no custom headers; do not log event URLs. CSP disallows inline scripts and external network access; inline **styles** are allowed because the standard renderer creates them. The host app's documented theme tokens are preferred over app-private styling.

**Template compatibility decision:** published templating 2.3.1 incorrectly warns on valid false conditions. Silencing all warnings would also hide missing bindings. Instead, this project compiles the exact, unmodified official upstream fix [microsoft/AdaptiveCards#7946](https://github.com/microsoft/AdaptiveCards/pull/7946), commit `53352bb7c9ea7bda88ad3ee2fbd18f3e0c9a2c0a`. Its upstream package version is an alpha, not a newly published stable release. Source, package metadata, licenses and generated bundle hashes are retained. The original SDK checkout is not modified. This is an experimental compatibility pin, not a claim of production readiness.

Send requires a saved current-evidence review, exact context hash, current revision and explicit UI confirmation. A delivery acknowledgement means **queued**, not agent completion. Failure/timeout/restart during delivery is **uncertain**, never automatically retried. Check chat before any manual follow-up. Agent-facing actions deliberately have no send operation.

## Authoring and troubleshooting

See `skills\adaptive-cards-workbench\SKILL.md` for the generate/validate/repair workflow. Start from a recipe; fetch the current document before updates. Only the workshop recipe has fixed local calculations. Adding arbitrary generated handlers or automatic business operations is outside this contract.

An extension load failure is diagnosed with the app's extension **inspect** tool/log, not stdout (reserved for JSON-RPC). A card failure is reported in the canvas diagnostics. A revision conflict means read/review the current evidence rather than overwrite. Unsaved local inputs are retained when remote changes arrive; use **Review latest, keep local inputs** before saving. Never reset a corrupt store to manufacture a successful demo.

**Observed reload limitation:** the tested runtime re-registered the provider after extension reload but did not re-invoke `open` for an already-open panel. That old panel's action binding was unavailable. Open a **fresh instanceId with the same documentId**, not a new document, to recover the saved artifact. Persistence and fresh-panel recovery are verified; automatic old-panel rehydration is not claimed. Adaptive Cards does not itself solve extension activation/distribution or UI-to-agent routing.

## Primary references

- [Copilot canvas extension authoring](https://docs.github.com/en/copilot/how-tos/github-copilot-app/working-with-canvas-extensions)
- Installed Copilot SDK `canvas.d.ts`, `session.d.ts` and bundled extension guide are the exact local compatibility contract.
- [Adaptive Cards schema](https://adaptivecards.io/explorer/AdaptiveCard.html)
- [Adaptive Cards templating](https://learn.microsoft.com/en-us/adaptive-cards/templating/)
- [Adaptive Cards JavaScript SDK](https://learn.microsoft.com/en-us/adaptive-cards/sdk/rendering-cards/javascript/)

Public source availability does not imply a published release, official adapter ecosystem support, native integration, or compatibility with future SDK versions. See third-party notices for bundled licenses.
