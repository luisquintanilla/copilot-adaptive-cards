import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture, problem } from './helpers.mjs';

test('removing a selected choice or retyping saved notes cannot silently erase human intent', async t => {
  const { store } = await fixture(t);
  let current = await store.open('input-compatibility');
  current = await store.saveDraft('input-compatibility', current.revision, { selection: 'studio', notes: 'Keep the step-free venue.' });
  const selectionChange = structuredClone(current.document);
  selectionChange.template.body.find(input => input.id === 'selection').choices = [{ title: 'New venue', value: 'new' }];
  selectionChange.actionContracts.review.properties.selection.enum = ['new'];
  await problem(store.setDocument('input-compatibility', current.revision, selectionChange), 'draft_conflict');
  const typeChange = structuredClone(current.document);
  const index = typeChange.template.body.findIndex(input => input.id === 'notes');
  typeChange.template.body[index] = { type: 'Input.Number', id: 'notes', label: 'Numeric code' };
  typeChange.actionContracts.review.properties.notes = { type: 'number' };
  await problem(store.setDocument('input-compatibility', current.revision, typeChange), 'draft_conflict');
  const unchanged = await store.get('input-compatibility');
  assert.equal(unchanged.revision, current.revision);
  assert.deepEqual(unchanged.draft, { selection: 'studio', notes: 'Keep the step-free venue.' });
  assert.deepEqual(unchanged.document, current.document);
  const cleared = await store.saveDraft('input-compatibility', current.revision, {});
  const updated = await store.setDocument('input-compatibility', cleared.revision, selectionChange);
  assert.deepEqual(updated.draft, {});
  assert.deepEqual(updated.document.actionContracts.review.properties.selection.enum, ['new']);
});
