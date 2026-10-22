import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Store } from '../build/extension/core.mjs';
import { fixture, document, problem, textValues } from './helpers.mjs';

test('Store.submit normalizes numbers and recalculates fifty-person costs without inventing Hall price', async t => {
  const { store } = await fixture(t);
  const before = await store.open('numbers');
  const result = await store.submit('numbers', before.revision, 'parameters', { attendees: '50', budget: '3000.50' });
  assert.deepEqual(result.submissions[0].inputs, { attendees: 50, budget: 3000.5 });
  assert.deepEqual(result.draft, { attendees: 50, budget: 3000.5 });
  assert.equal(result.document.data.attendees, 50);
  assert.equal(result.evidenceRevision, before.evidenceRevision + 1);
  assert.equal(result.revision, before.revision + 1);
  assert.deepEqual(result.document.data.costs, [
    { name: 'Studio', summary: '$2950.00 USD; within budget; capacity fits' },
    { name: 'Library', summary: '$1500.00 USD; within budget; not enough capacity' },
    { name: 'Hall', summary: 'Price unknown; capacity fits' }
  ]);
  assert.ok(textValues(result.expanded).includes('$2950.00 USD; within budget; capacity fits'));
  for (const raw of [
    { attendees: '5e1', budget: '3000' }, { attendees: '', budget: '3000' },
    { attendees: '50.5', budget: '3000' }, { attendees: '0', budget: '3000' },
    { attendees: '1001', budget: '3000' }, { attendees: '50', budget: '-1' }
  ]) {
    await problem(() => store.submit('numbers', result.revision, 'parameters', raw), 'submission_invalid', 'submission');
  }
  const unchanged = await store.get('numbers');
  assert.equal(unchanged.revision, result.revision);
  assert.equal(unchanged.submissions.length, 1);
});

test('Store.submit enforces choice required fields extra fields and note limits before saving', async t => {
  const { store } = await fixture(t);
  const opened = await store.open('choices', 'comparison');
  for (const inputs of [
    { selection: 'studio', notes: 'Not a comparison choice' },
    { notes: 'Missing selection' }, { selection: 'a' },
    { selection: 'a', notes: '', unexpected: true },
    { selection: 'a', notes: 'x'.repeat(2001) }
  ]) {
    await problem(() => store.submit('choices', opened.revision, 'review', inputs), 'submission_invalid', 'submission');
  }
  const saved = await store.submit('choices', opened.revision, 'review', { selection: 'unknown', notes: 'x'.repeat(2000) });
  assert.deepEqual(saved.submissions[0].inputs, { selection: 'unknown', notes: 'x'.repeat(2000) });
  assert.equal(saved.revision, 2);
  assert.equal(saved.evidenceRevision, 1);
  await problem(() => store.submit('choices', saved.revision, 'missing', {}), 'unknown_action', 'submission', '/actionId');
});

test('Store.submit merges safe hidden data and rejects raw or declared-input collisions', async t => {
  const { store } = await fixture(t);
  let state = await store.open('hidden', 'comparison');
  const candidate = document('hidden');
  candidate.card.body.push({ type: 'Input.Text', id: 'notes' });
  candidate.card.actions = [{ type: 'Action.Submit', id: 'review', title: 'Save', data: { kind: 'review' } }];
  candidate.actionContracts.review = {
    type: 'object', additionalProperties: false,
    properties: { notes: { type: 'string' }, kind: { const: 'review' } }, required: ['notes', 'kind']
  };
  state = await store.setDocument('hidden', state.revision, candidate);
  await problem(() => store.submit('hidden', state.revision, 'review', { notes: 'Human', kind: 'forged' }),
    'input_collision', 'submission', '/kind');
  const collision = structuredClone(state.document);
  collision.card.actions[0].data = { notes: 'Override human notes' };
  state = await store.setDocument('hidden', state.revision, collision);
  await problem(() => store.submit('hidden', state.revision, 'review', {}), 'input_collision', 'submission', '/notes');
  state = await store.setDocument('hidden', state.revision, candidate);
  state = await store.submit('hidden', state.revision, 'review', { notes: 'Human' });
  assert.deepEqual(state.submissions[0].inputs, { notes: 'Human', kind: 'review' });
  assert.equal((await store.get('hidden')).submissions.length, 1);
});

test('hidden action kind stays in saved submissions never drafts and setData retains human inputs', async t => {
  const { directory, store } = await fixture(t);
  let state = await store.open('hidden-draft', 'comparison');
  const candidate = structuredClone(state.document);
  candidate.template.actions[0].data = { kind: 'review' };
  candidate.actionContracts.review.properties.kind = { const: 'review' };
  candidate.actionContracts.review.required.push('kind');
  state = await store.setDocument('hidden-draft', state.revision, candidate);
  const humanInputs = { selection: 'b', notes: 'Keep the allergen question and my choice.' };
  state = await store.submit('hidden-draft', state.revision, 'review', humanInputs);

  assert.deepEqual(state.submissions[0].inputs, { ...humanInputs, kind: 'review' });
  assert.deepEqual(state.draft, humanInputs);
  assert.equal(Object.hasOwn(state.draft, 'kind'), false);
  const path = join(directory, 'hidden-draft.json');
  const saved = JSON.parse(await readFile(path, 'utf8'));
  assert.deepEqual(saved.submissions[0].inputs, { ...humanInputs, kind: 'review' });
  assert.deepEqual(saved.draft, humanInputs);
  assert.equal(Object.hasOwn(saved.draft, 'kind'), false);

  const before = structuredClone(state);
  state = await store.setData('hidden-draft', state.revision, {
    ...state.document.data, title: 'Revised evidence after the human review'
  });
  assert.equal(state.revision, before.revision + 1);
  assert.equal(state.evidenceRevision, before.evidenceRevision + 1);
  assert.equal(state.expanded.body[0].text, 'Revised evidence after the human review');
  assert.deepEqual(state.draft, humanInputs);
  assert.equal(Object.hasOwn(state.draft, 'kind'), false);
  assert.deepEqual(state.submissions, before.submissions);

  const reopened = await new Store(directory).get('hidden-draft');
  assert.deepEqual(reopened.draft, humanInputs);
  assert.deepEqual(reopened.submissions[0].inputs, { ...humanInputs, kind: 'review' });
  assert.equal(reopened.document.data.title, 'Revised evidence after the human review');
  const updated = JSON.parse(await readFile(path, 'utf8'));
  assert.equal(Object.hasOwn(updated.draft, 'kind'), false);
  assert.deepEqual(updated.submissions, before.submissions);
});

test('durable drafts and reviews reopen and preserve human choices across a data revision without sending', async t => {
  const calls = [];
  const sender = async prompt => { calls.push(prompt); return 'unexpected'; };
  const { directory, store } = await fixture(t, sender);
  let state = await store.open('durable');
  state = await store.saveDraft('durable', state.revision, { selection: 'library', notes: 'Step-free access; preserve this.' });
  state = await store.submit('durable', state.revision, 'review', state.draft);
  const review = structuredClone(state.submissions[0]);
  const reopened = new Store(directory, sender);
  let restored = await reopened.open('durable', 'pr-readiness');
  assert.equal(restored.document.recipe, 'workshop', 'open must not replace an existing artifact with another recipe');
  assert.deepEqual(restored.draft, { selection: 'library', notes: 'Step-free access; preserve this.' });
  assert.deepEqual(restored.submissions, [review]);
  restored = await reopened.setData('durable', restored.revision, { ...restored.document.data, attendees: 50 });
  assert.deepEqual(restored.draft, { selection: 'library', notes: 'Step-free access; preserve this.' });
  assert.deepEqual(restored.submissions, [review]);
  assert.equal(restored.evidenceRevision, review.evidenceRevision + 1);
  assert.equal(restored.document.data.costs[0].summary, '$2950.00 USD; within budget; capacity fits');
  await problem(() => reopened.previewSend('durable', restored.revision, review.id, 'Reconsider capacity'), 'stale_submission');
  await problem(() => reopened.send('durable', restored.revision, review.id, 'Reconsider capacity', 'old-hash', 'stale-send'), 'stale_submission');
  assert.deepEqual(calls, [], 'opening, editing, saving, reviewing and previewing must never call sender');
  assert.deepEqual((await new Store(directory).get('durable')).draft, restored.draft);
});

test('concurrent compare-and-swap updates save one winner reject one conflict and leave a usable queue', async t => {
  const { store } = await fixture(t);
  const before = await store.open('cas');
  const results = await Promise.allSettled([
    store.saveDraft('cas', before.revision, { notes: 'Writer A' }),
    store.saveDraft('cas', before.revision, { notes: 'Writer B' })
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const rejected = results.find(result => result.status === 'rejected');
  assert.equal(rejected.reason.code, 'revision_conflict');
  assert.equal(rejected.reason.status, 409);
  let current = await store.get('cas');
  assert.equal(current.revision, before.revision + 1);
  assert.equal(current.draft.notes, 'Writer A');
  current = await store.saveDraft('cas', current.revision, { notes: 'After conflict' });
  assert.equal(current.revision, before.revision + 2);
  assert.equal(current.draft.notes, 'After conflict');
});

test('removing an input with durable human edits rejects the document update without discarding notes', async t => {
  const { store } = await fixture(t);
  let state = await store.open('draft-conflict');
  state = await store.saveDraft('draft-conflict', state.revision, { notes: 'Do not discard' });
  const candidate = structuredClone(state.document);
  candidate.template.body = candidate.template.body.filter(item => item.id !== 'notes');
  await problem(() => store.setDocument('draft-conflict', state.revision, candidate), 'draft_conflict');
  const restored = await store.get('draft-conflict');
  assert.equal(restored.revision, state.revision);
  assert.equal(restored.draft.notes, 'Do not discard');
  assert.ok(restored.expanded.body.some(item => item.id === 'notes'));
});

test('exact SHA256 preview rejects tampering and concurrent explicit sends queue only once', async t => {
  const calls = [];
  const { directory, store } = await fixture(t, async prompt => { calls.push(prompt); return 'message-42'; });
  let state = await store.open('send');
  state = await store.submit('send', state.revision, 'review', { selection: 'studio', notes: 'Human decision' });
  const submission = state.submissions[0];
  const instruction = 'Compare the evidence; do not book.';
  const preview = await store.previewSend('send', state.revision, submission.id, instruction);
  assert.equal(preview.hash, createHash('sha256').update(preview.prompt).digest('hex'));
  assert.match(preview.prompt, /untrusted artifact data/);
  assert.match(preview.prompt, /Do not book, publish, merge/);
  const context = JSON.parse(preview.prompt.slice(preview.prompt.indexOf('\n\n{') + 2));
  assert.equal(context.documentId, 'send');
  assert.equal(context.revision, state.revision);
  assert.deepEqual(context.submission.inputs, { selection: 'studio', notes: 'Human decision' });
  assert.equal(calls.length, 0);
  await problem(() => store.send('send', state.revision, submission.id, instruction, '0'.repeat(64), 'tamper-hash'), 'review_changed');
  await problem(() => store.send('send', state.revision, submission.id, 'Changed instruction', preview.hash, 'tamper-instruction'), 'review_changed');
  assert.equal(calls.length, 0);
  assert.equal((await store.get('send')).revision, state.revision);
  const results = await Promise.allSettled([
    store.send('send', state.revision, submission.id, instruction, preview.hash, 'send-once'),
    store.send('send', state.revision, submission.id, instruction, preview.hash, 'send-twice')
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'revision_conflict');
  assert.deepEqual(calls, [preview.prompt], 'the bytes confirmed by the human must be exactly the bytes sent');
  state = await new Store(directory).get('send');
  assert.deepEqual(state.submissions[0].delivery, { status: 'queued', requestId: 'send-once', messageId: 'message-42' });
  assert.equal(state.revision, 4);
  const replay = await store.send('send', state.revision, submission.id, instruction, preview.hash, 'replay');
  assert.equal(replay.revision, state.revision);
  assert.equal(calls.length, 1);
});

test('changing saved human context invalidates a previously exact preview hash', async t => {
  const calls = [];
  const { store } = await fixture(t, async prompt => { calls.push(prompt); return 'unexpected'; });
  let state = await store.open('changed-preview');
  state = await store.submit('changed-preview', state.revision, 'review', { selection: 'hall', notes: 'Confirm room price' });
  const review = state.submissions[0];
  const preview = await store.previewSend('changed-preview', state.revision, review.id, 'Investigate');
  state = await store.saveDraft('changed-preview', state.revision, { selection: 'library', notes: 'Check capacity too' });
  await problem(() => store.send('changed-preview', state.revision, review.id, 'Investigate', preview.hash, 'changed'), 'review_changed');
  const fresh = await store.previewSend('changed-preview', state.revision, review.id, 'Investigate');
  assert.notEqual(fresh.hash, preview.hash);
  assert.match(fresh.prompt, /Check capacity too/);
  assert.equal(calls.length, 0);
});

test('send preview enforces instruction bounds and the context limit without invoking sender', async t => {
  let calls = 0;
  const { store } = await fixture(t, async () => { calls++; return 'unexpected'; });
  let state = await store.open('send-limits', 'comparison');
  state = await store.submit('send-limits', state.revision, 'review', { selection: 'a', notes: 'Keep this review' });
  let review = state.submissions.at(-1);
  for (const instruction of ['', 'x'.repeat(1001)]) {
    await problem(() => store.previewSend('send-limits', state.revision, review.id, instruction), 'invalid_request', 'send', '/instruction');
  }
  for (const instruction of ['x', 'x'.repeat(1000)]) {
    const preview = await store.previewSend('send-limits', state.revision, review.id, instruction);
    assert.equal(preview.hash, createHash('sha256').update(preview.prompt).digest('hex'));
    assert.ok(preview.prompt.includes(`User request: ${instruction}\n\n`));
  }
  state = await store.setData('send-limits', state.revision, {
    ...state.document.data, evidence: Array.from({ length: 20 }, (_, i) => ({ title: `Evidence ${i}`, detail: 'x'.repeat(2000) }))
  });
  state = await store.submit('send-limits', state.revision, 'review', { selection: 'b', notes: 'Review the large context' });
  review = state.submissions.at(-1);
  await problem(() => store.previewSend('send-limits', state.revision, review.id, 'Check'), 'context_limit', 'send', '/');
  assert.equal(calls, 0);
  assert.equal((await store.get('send-limits')).submissions.length, 2);
});

test('failed sender persists uncertainty and reopening never automatically retries delivery', async t => {
  const calls = [];
  const sender = async prompt => { calls.push(prompt); throw new Error('Acknowledgement lost'); };
  const { directory, store } = await fixture(t, sender);
  let state = await store.open('uncertain', 'comparison');
  state = await store.submit('uncertain', state.revision, 'review', { selection: 'b', notes: 'Confirm allergens' });
  const review = state.submissions[0];
  const preview = await store.previewSend('uncertain', state.revision, review.id, 'Check this');
  state = await store.send('uncertain', state.revision, review.id, 'Check this', preview.hash, 'failed-send');
  assert.deepEqual(state.submissions[0].delivery, { status: 'uncertain', requestId: 'failed-send', error: 'Acknowledgement lost' });
  assert.deepEqual(calls, [preview.prompt]);
  const reopened = new Store(directory, sender);
  const restored = await reopened.open('uncertain');
  assert.deepEqual(restored.submissions[0].delivery, state.submissions[0].delivery);
  await problem(() => reopened.send('uncertain', restored.revision, review.id, 'Check this', preview.hash, 'retry'), 'delivery_uncertain');
  assert.equal(calls.length, 1);
  assert.equal((await reopened.get('uncertain')).revision, state.revision);
});

test('restart during sending exposes uncertainty without resetting persisted history or calling sender', async t => {
  let calls = 0;
  const { directory, store } = await fixture(t);
  let state = await store.open('interrupted', 'comparison');
  state = await store.submit('interrupted', state.revision, 'review', { selection: 'a', notes: 'Keep the evidence' });
  const path = join(directory, 'interrupted.json');
  const saved = JSON.parse(await readFile(path, 'utf8'));
  saved.submissions[0].delivery = { status: 'sending', requestId: 'interrupted-request' };
  await writeFile(path, JSON.stringify(saved));
  const reopened = new Store(directory, async () => { calls++; return 'unexpected'; });
  const restored = await reopened.get('interrupted');
  assert.equal(restored.submissions[0].delivery.status, 'uncertain');
  assert.match(restored.submissions[0].delivery.error, /restarted during delivery/);
  assert.equal(restored.submissions[0].inputs.notes, 'Keep the evidence');
  await problem(() => reopened.send('interrupted', restored.revision, restored.submissions[0].id, 'Check', 'unused', 'retry'), 'delivery_uncertain');
  assert.equal(calls, 0);
});

test('corrupt persisted JSON or unsupported saved structure is never silently reset', async t => {
  const { directory, store } = await fixture(t);
  for (const [id, bytes] of [
    ['broken-json', '{"storeVersion":1,"draft":'],
    ['broken-shape', JSON.stringify({ storeVersion: 900, revision: 1, draft: { notes: 'Human work' } })]
  ]) {
    const path = join(directory, `${id}.json`);
    await writeFile(path, bytes);
    await problem(() => store.open(id), 'corrupt_store');
    await problem(() => new Store(directory).get(id), 'corrupt_store');
    assert.equal(await readFile(path, 'utf8'), bytes);
  }
  let state = await store.open('corrupt-delivery', 'comparison');
  state = await store.submit('corrupt-delivery', state.revision, 'review', { selection: 'a', notes: 'Preserve despite corruption' });
  const path = join(directory, 'corrupt-delivery.json');
  const valid = JSON.parse(await readFile(path, 'utf8'));
  for (const corrupt of [
    saved => { saved.revision = 0; },
    saved => { saved.evidenceRevision = saved.revision + 1; },
    saved => { saved.submissions.push(structuredClone(saved.submissions[0])); },
    saved => { saved.submissions[0].createdAt = 'not-a-date'; },
    saved => { saved.submissions[0].delivery = { status: 'made-up', requestId: 'request' }; },
    saved => { saved.submissions[0].delivery = { status: 'queued', requestId: 'request' }; },
    saved => { saved.submissions[0].delivery = { status: 'uncertain', requestId: 'request', error: 123 }; }
  ]) {
    const saved = structuredClone(valid);
    corrupt(saved);
    const bytes = JSON.stringify(saved);
    await writeFile(path, bytes);
    await problem(() => store.open('corrupt-delivery'), 'corrupt_store');
    assert.equal(await readFile(path, 'utf8'), bytes);
  }
});

test('draft size scalar input identity and unsafe-key guards reject edits without changing persisted state', async t => {
  const { directory, store } = await fixture(t);
  let state = await store.open('draft-limits');
  const exact = { notes: 'x'.repeat(16384 - Buffer.byteLength(JSON.stringify({ notes: '' }))) };
  assert.equal(Buffer.byteLength(JSON.stringify(exact)), 16384);
  state = await store.saveDraft('draft-limits', state.revision, exact);
  assert.equal(state.revision, 2);
  assert.equal(state.draft.notes.length, 16372);
  for (const [draft, code] of [
    [{ notes: `${exact.notes}x` }, 'invalid_draft'],
    [{ notes: ['nested'] }, 'invalid_draft_value'],
    [{ unknownInput: 'Not on the card' }, 'unknown_input'],
    [JSON.parse('{"constructor":"unsafe"}'), 'unsafe_key']
  ]) {
    await problem(() => store.saveDraft('draft-limits', state.revision, draft), code);
  }
  const bytes = JSON.parse(await readFile(join(directory, 'draft-limits.json'), 'utf8'));
  assert.equal(bytes.revision, 2);
  assert.equal(bytes.draft.notes.length, 16372);
  for (const id of ['../escape', '', 'x'.repeat(65)]) {
    await problem(() => store.open(id), 'invalid_id', 'contract', '/documentId');
  }
  await problem(() => store.saveDraft('draft-limits', -1, {}), 'invalid_revision', 'contract', '/expectedRevision');
});

test('fifty saved submissions are retained and the fifty-first is rejected without deletion', async t => {
  const { directory, store } = await fixture(t);
  let state = await store.open('history', 'comparison');
  state = await store.submit('history', state.revision, 'review', { selection: 'a', notes: 'First review' });
  const path = join(directory, 'history.json');
  const saved = JSON.parse(await readFile(path, 'utf8'));
  saved.submissions = Array.from({ length: 49 }, (_, i) => ({ ...saved.submissions[0], id: `review-${i}` }));
  await writeFile(path, JSON.stringify(saved));
  state = await store.submit('history', state.revision, 'review', { selection: 'b', notes: 'Fiftieth review' });
  assert.equal(state.submissions.length, 50);
  assert.equal(state.submissions.at(-1).inputs.notes, 'Fiftieth review');
  const bytes = await readFile(path, 'utf8');
  await problem(() => store.submit('history', state.revision, 'review', { selection: 'unknown', notes: 'Overflow' }), 'history_full');
  assert.equal(await readFile(path, 'utf8'), bytes);
});
