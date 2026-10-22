# Verification and known limits

Local verification: 2026-10-21, Windows, Node 24.14.1, installed Microsoft Edge
in headless Playwright runs, and the installed Copilot runtime/SDK
(runtime bootstrap 1.0.99-2). These are observed local results, not a promise of
compatibility with every current/future Copilot app build.

## Repeatable gates

Run from the standalone project:

| Command | Observed result |
|---|---|
| `node scripts\check.mjs --package` | Passed: strict TypeScript check, verified build, 34 Node tests, browser flows, source/runtime archives, isolated extracted-runtime checks |
| `node --test tests\validation.test.mjs tests\conditions.test.mjs` | Passed: 11 validation/condition tests, including true, false, scoped/repeated bindings and missing-condition diagnostics |
| `node node_modules\typescript\bin\tsc --noEmit` | Passed |
| `node scripts\build.mjs` | Passed with vendor integrity checks and runtime dependency licenses |
| `node tests\browser.mjs` | Passed: seven browser acceptance flows described below |
| `node tests\package.mjs` | Passed: every installed file hash checked; all three recipes and validation worker run from an extracted folder with no `node_modules` and no runtime downloads |

The full runner uses the current Node executable for child processes and runs
test files serially. Parallel suites caused a valid-document worker to exceed
its two-second wall-clock deadline on the shared host; serialization avoids
competing SDK startups without increasing the production deadline or relaxing
assertions. Under resource pressure, runtime validation can still time out
explicitly rather than render unvalidated content. Normal
`npm ci` was not established in this managed environment: initial registry TLS
and npm child-shell PATH failures required integrity-checked public package-file
restoration. The portable lock now uses canonical public npm URLs. A normal
source restore and the configured GitHub Actions workflow had not yet been
verified on a conventional developer/CI environment at that initial local
verification. They are not claimed as local passes. See the repository's
Actions results for subsequent CI runs.

The public CI workflow pins Ubuntu 24.04, which the pinned Playwright 1.56.1
supports. The first publication run restored dependencies with `npm ci` but
could not install browsers on the Ubuntu 26.04 image selected by
`ubuntu-latest`. The runner pin fixes that compatibility mismatch without
changing dependency versions, validation deadlines or runtime behavior.

The packaging check also compares both archive hashes across repeated packaging
of unchanged inputs on the current machine. File timestamps are normalized;
Node compression avoids the current-time gzip header emitted by the local
`tar -z`. This is not a cross-platform byte-reproducibility guarantee.

## Behavior evidence

| Requirement | Exact test/check |
|---|---|
| Standard designs and three reusable recipes | `all three recipes expand real standard cards with bound evidence and declared review actions` |
| Truthful known totals and unknown prices | `workshop forty prices distinguish unknown price from independent capacity and budget`; `Store.submit normalizes numbers and recalculates fifty-person costs without inventing Hall price` |
| Useful schema/binding/action errors and bounds | `data card schema and binding errors expose their actual diagnostic stage and path`; the validation suite's schema/reference, capability, byte/depth/element and unsafe-JSON tests |
| Correct true/false conditions without hiding missing data | `standard true and false dollar-when expressions retain and omit exactly the guarded content`; `false Boolean bindings and repeated conditions omit content without masking missing bindings` |
| Shared durable human state | `durable drafts and reviews reopen and preserve human choices across a data revision without sending` |
| No silent input/choice loss during redesign | `removing a selected choice or retyping saved notes cannot silently erase human intent`; `removing an input with durable human edits rejects the document update without discarding notes` |
| Hidden action metadata is not a human draft | `hidden action kind stays in saved submissions never drafts and setData retains human inputs` |
| Revision/consent/hash/uncertainty guards | `concurrent compare-and-swap updates save one winner reject one conflict and leave a usable queue`; `exact SHA256 preview rejects tampering and concurrent explicit sends queue only once`; `failed sender persists uncertainty and reopening never automatically retries delivery` |
| Authenticated loopback and content/CSP contracts | All seven cases in `tests\http.test.mjs`, including the JSONP lookalike regression and SSE closure |

Browser flows use the actual bundled renderer and loopback service:

- `workshop-local-recalculation-review-preview-explicit-send`
- `shared-revision-keeps-unsaved-inputs-and-restores-saved-draft`
- `newly-saved-review-is-selected-against-current-evidence`
- `narrow-light-dark-standard-renderer`
- `plain-text-injection-and-inline-script-CSP`
- `clearing-draft-requires-consent-and-retains-review-history`
- `native-showcard-and-togglevisibility-stay-local`

## Real app/SDK evidence, separate from fixtures

The built archive was installed as a **session-scoped extension**, without
runtime dependencies or a separate SDK installation. Extension reload/inspect
reported ready. Runtime capability discovery and real `open_canvas` succeeded.
Invalid document IDs and reserved `canvas.*` action names were rejected by the
runtime before handler work.

An automated browser drove the **actual installed extension's URL**, not a
mock server: attendees changed from 40 to 50, Studio recalculated to $2950 USD,
the human selected Studio and saved accessibility notes, then previewed the
exact outgoing context and explicitly checked consent/Send.
`tests\live-canvas.mjs --send` passed against that opened instance. The actual
SDK `session.send` acknowledged queueing a message in the owning conversation.
The test request was bounded to acknowledgement, with no external work.
Queue acknowledgement is not proof of subsequent model completion.

Real canvas `get_document` and `set_data` calls then revised the agenda at
expected revision 6 to revision 7, retaining the human selection and notes.
The provider was restarted from the installable archive; a fresh panel opened
the **same documentId**. `tests\live-reopen.mjs` verified the revised agenda,
50 attendees, Studio, exact saved notes, and unchanged queued-review history.
The new panel's real `get_submissions` action also returned that saved history.

**Observed host limitation:** the old, already-open instance did not acquire a
new provider binding after reload; its action reported panel unavailable.
Fresh-instance recovery worked. The documented workaround is a new instanceId
with the same documentId. Automatic old-panel rehydration is not claimed.
These checks do not assert a human visually inspected the app's iframe/chrome
or that all host-theme injection details were observable from automation.

To repeat live checks, open a synthetic workshop instance through the app and
set its capability URL in `CANVAS_URL` locally. Never commit/log that URL.
`live-canvas.mjs` defaults to preview-only; `--send` explicitly opts into an
actual owning-session message. `live-reopen.mjs` is read-only and checks the
specific synthetic revision/notes above.

## Compatibility decisions and exclusions

- Renderer: official Adaptive Cards 2.11.3. Expressions: official 4.11.0 browser
  distribution. The attempted 4.23.1 browser distribution failed during startup.
- Templating: exact **unmodified official upstream** source commit
  `53352bb7c9ea7bda88ad3ee2fbd18f3e0c9a2c0a` (2.4.0-alpha.0), compiled locally.
  [microsoft/AdaptiveCards#7946](https://github.com/microsoft/AdaptiveCards/pull/7946)
  fixes the published 2.3.1 bundle's false-condition warning bug. Rejecting those
  warnings would reject valid cards; ignoring them wholesale would hide missing
  conditions. Source, metadata, license and generated-file hashes are retained.
- Literal `${true}`/`${false}` conditions receive a source-preserving rewrite to
  equivalent standard comparisons because the SDK interpolates constants as
  strings. No new card syntax or custom element is introduced.
- Node VM loads trusted bundles, not a claimed security sandbox. Workers have
  explicit time/old-generation limits; this is not an unbounded-code runtime.
- No model-quality improvement has been measured. `evaluation` supplies task
  specifications and a rubric, not fabricated success-rate/coverage metrics.
- The initial local verification performed no connectors, external business
  mutations, GitHub reviews/merges, repository creation or release publication.
  Public source publication is separate from those local checks.
- The original AdaptiveCards SDK checkout and .NET modernization source were
  left unchanged. The standalone source and archives live in session artifacts.
