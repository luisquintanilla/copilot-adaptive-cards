import assert from 'node:assert/strict';
import test from 'node:test';
import { validateDocument } from '../build/extension/core.mjs';
import { document, problem, textValues } from './helpers.mjs';

test('false Boolean bindings and repeated conditions omit content without masking missing bindings', async () => {
  const candidate = document('conditional-data');
  delete candidate.card;
  candidate.data = { visible: false, rows: [{ name: 'Show this', visible: true }, { name: 'Hide this', visible: false }] };
  candidate.dataSchema = { type: 'object', properties: { visible: { type: 'boolean' }, rows: { type: 'array' } }, required: ['visible', 'rows'] };
  candidate.template = { type: 'AdaptiveCard', version: '1.5', body: [
    { type: 'TextBlock', text: 'Hidden root', $when: '${visible}' },
    { type: 'TextBlock', text: '${name}', $data: '${rows}', $when: '${visible}' }
  ] };
  const source = structuredClone(candidate.template);
  const compiled = await validateDocument(candidate);
  assert.deepEqual(textValues(compiled.expanded), ['Show this']);
  assert.deepEqual(compiled.document.template, source);
  candidate.template.body[0].$when = '${missing}';
  await problem(validateDocument(candidate), 'binding_warning', 'binding', '/template');
});
