import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../build/extension/core.mjs';

export async function fixture(t, sender) {
  const directory = await mkdtemp(join(tmpdir(), 'adaptive-cards-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { directory, store: new Store(directory, sender) };
}

export function document(id = 'validation') {
  return {
    documentVersion: 1, documentId: id, title: 'Standard card',
    data: {}, dataSchema: { type: 'object' }, actionContracts: {},
    card: { type: 'AdaptiveCard', version: '1.5', body: [{ type: 'TextBlock', text: 'Concrete content' }] }
  };
}

export async function problem(operation, code, stage, path) {
  await assert.rejects(operation, error => {
    assert.equal(error.code, code, error.message);
    if (stage !== undefined) {
      assert.ok(error.diagnostics.some(diagnostic =>
        diagnostic.stage === stage && (path === undefined || diagnostic.path === path) &&
        typeof diagnostic.message === 'string' && diagnostic.message.length > 0),
      `Expected ${stage} diagnostic at ${path ?? 'any path'}: ${JSON.stringify(error.diagnostics)}`);
    }
    return true;
  });
}

export function textValues(value) {
  if (Array.isArray(value)) return value.flatMap(textValues);
  if (value && typeof value === 'object') {
    return [...(value.type === 'TextBlock' ? [value.text] : []), ...Object.values(value).flatMap(textValues)];
  }
  return [];
}
