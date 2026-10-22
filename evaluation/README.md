# Generation evaluation

These are reproducible task specifications, **not a claim of measured model quality**. The automated tests gate deterministic host behavior with fixed documents; they do not estimate first-pass LLM success rates.

For a manual model run, record model/version, date, exact prompt, supplied data, first document, validation diagnostics, repair count, and final result. Do not provide hidden test assertions to the model. Use the installed capability profile and standard envelope. Run `validate_document` and render a valid result before scoring it.

Score each criterion 0 (absent/wrong) or 1 (met):

- Standard schema-1.5 elements and standard templating; no proprietary types or code.
- Explicit, strict data/action schemas and correct units/types.
- Evidence faithfully preserved; missing prices/statuses stay unknown.
- Source/data separate; revisions preserve supplied human edits.
- Deterministic local work remains local; no unrequested agent calls or external actions.
- Usable labels and errors at narrow width and in both themes.
- Human review and explicit preview/confirmed-send remain distinct.

Any generated executable code, fabricated evidence, lost human edit or automatic external action is a hard failure regardless of total. Report first-pass validity and repair count separately from rubric score. Publish results only with actual runs and retained outputs; there is no numerical quality target in this MVP.

`cases.json` is an input inventory. Built output `examples/*.json` is a set of standard document fixtures generated from the same constructors as the reference recipes.
