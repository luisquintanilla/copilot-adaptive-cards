import test from 'node:test';
import assert from 'node:assert/strict';
import { example, validateDocument } from '../build/extension/core.mjs';
import { document, problem, textValues } from './helpers.mjs';

test('all three recipes expand real standard cards with bound evidence and declared review actions', async () => {
  for (const [recipe, title, evidence] of [
    ['workshop', 'A practical AI workshop', '$2600.00 USD; within budget; capacity fits'],
    ['comparison', 'Compare workshop catering', 'Quoted price $15/person; allergen information unknown.'],
    ['pr-readiness', 'Example PR review', 'One failing test; see supplied check log.']
  ]) {
    const result = await validateDocument(example(recipe, recipe));
    assert.equal(result.document.recipe, recipe);
    assert.equal(result.expanded.type, 'AdaptiveCard');
    assert.equal(result.expanded.version, '1.5');
    assert.ok(textValues(result.expanded).includes(title));
    assert.ok(textValues(result.expanded).includes(evidence));
    assert.equal(result.expanded.actions[0].id, 'review');
    assert.equal(result.expanded.actions[0].type, 'Action.Submit');
    assert.doesNotMatch(JSON.stringify(result.expanded), /\$\{/);
  }
});

test('workshop forty prices distinguish unknown price from independent capacity and budget', async () => {
  const source = example('workshop', 'costs');
  // Derived costs must not trust a supplied cached total.
  source.data.costs = [{ name: 'Forged', summary: '$0' }];
  const { document: compiled, expanded } = await validateDocument(source);
  assert.deepEqual(compiled.data.costs, [
    { name: 'Studio', summary: '$2600.00 USD; within budget; capacity fits' },
    { name: 'Library', summary: '$1300.00 USD; within budget; not enough capacity' },
    { name: 'Hall', summary: 'Price unknown; capacity fits' }
  ]);
  assert.ok(textValues(expanded).includes('Price unknown; capacity fits'));
  assert.equal(source.data.costs[0].name, 'Forged', 'validation must not mutate its caller');
  source.data.budget = 2600;
  assert.equal((await validateDocument(source)).document.data.costs[0].summary, '$2600.00 USD; within budget; capacity fits');
  source.data.budget = 2599.99;
  source.data.quotes[2].capacity = 39;
  const over = await validateDocument(source);
  assert.equal(over.document.data.costs[0].summary, '$2600.00 USD; over budget; capacity fits');
  assert.equal(over.document.data.costs[2].summary, 'Price unknown; not enough capacity');
  source.data.quotes[2].room = 1200;
  source.data.quotes[2].perPerson = null;
  assert.equal((await validateDocument(source)).document.data.costs[2].summary, 'Price unknown; not enough capacity');
});

test('data card schema and binding errors expose their actual diagnostic stage and path', async () => {
  const data = example('workshop', 'data-error');
  data.data.attendees = 0;
  await problem(() => validateDocument(data), 'data_invalid', 'data', '/attendees');
  const card = document();
  card.card.body[0].text = 42;
  await problem(() => validateDocument(card), 'card_invalid', 'card');
  const schema = document();
  schema.dataSchema = { type: 'not-a-json-schema-type' };
  await problem(() => validateDocument(schema), 'invalid_schema', 'schema', '/');
  const binding = example('comparison', 'binding');
  binding.template.body[0].text = '${absentTitle}';
  await problem(() => validateDocument(binding), 'missing_binding', 'binding', 'absentTitle');
  const unresolved = document();
  unresolved.card.body[0].text = '${notExpanded}';
  await problem(() => validateDocument(unresolved), 'unresolved_binding', 'binding');
});

test('malformed dollar-when is rejected with binding diagnostics rather than silently dropping content', async () => {
  for (const condition of ['${notAFunction(}', '${absentCondition}', false, true, 'false']) {
    const source = example('comparison', 'invalid-when');
    source.template.body[0].$when = condition;
    await assert.rejects(() => validateDocument(source), error => {
      assert.ok(error.diagnostics.some(item => item.stage === 'binding'), error.message);
      return true;
    });
  }
});

test('standard true and false dollar-when expressions retain and omit exactly the guarded content', async () => {
  const source = example('comparison', 'valid-when');
  source.template.body.unshift(
    { type: 'TextBlock', text: 'Must remain', $when: '${true}' },
    { type: 'TextBlock', text: 'Must disappear', $when: '${false}' }
  );
  const result = await validateDocument(source);
  assert.ok(textValues(result.expanded).includes('Must remain'));
  assert.ok(!textValues(result.expanded).includes('Must disappear'));
  assert.ok(textValues(result.expanded).includes('Compare workshop catering'));
});

test('schema accepts local references but rejects remote missing cyclic and unsupported schemas', async () => {
  const local = document();
  local.dataSchema = {
    type: 'object', properties: { count: { $ref: '#/definitions/count' } },
    required: ['count'], definitions: { count: { type: 'integer', minimum: 1 } }
  };
  local.data = { count: 3 };
  assert.equal((await validateDocument(local)).document.data.count, 3);
  local.data.count = 0;
  await problem(() => validateDocument(local), 'data_invalid', 'data', '/count');
  for (const [schema, code] of [
    [{ $ref: 'https://example.invalid/schema.json' }, 'external_ref'],
    [{ $ref: '#/definitions/missing' }, 'missing_ref'],
    [{ definitions: { loop: { $ref: '#/definitions/loop' } }, $ref: '#/definitions/loop' }, 'cyclic_ref'],
    [{ type: 'string', format: 'email' }, 'unsupported_format'],
    [{ $id: 'https://example.invalid/schema' }, 'external_schema_id'],
    [{ $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object' }, 'schema_dialect']
  ]) {
    await problem(() => validateDocument({ ...document(), dataSchema: schema }), code, 'schema');
  }
});

test('custom elements URL actions and remote host capabilities cannot enter a standard card', async () => {
  for (const element of [{ type: 'Contoso.Widget' }, { type: 'Image', url: 'https://example.invalid/a.png' }]) {
    const source = document();
    source.card.body = [element];
    await assert.rejects(() => validateDocument(source), error =>
      ['card_invalid', 'unsupported_element'].includes(error.code));
  }
  const url = document();
  url.card.actions = [{ type: 'Action.OpenUrl', title: 'Open', url: 'https://example.invalid/' }];
  await problem(() => validateDocument(url), 'unsupported_element', 'capability', '/actions/0');
  for (const feature of ['refresh', 'authentication']) {
    const source = document();
    source.card[feature] = {};
    await assert.rejects(() => validateDocument(source), error =>
      ['card_invalid', 'unsupported_feature'].includes(error.code));
  }
});

test('document bytes depth and expanded-element limits enforce both sides of each boundary', async () => {
  const exact = document();
  exact.data.padding = '';
  exact.data.padding = 'x'.repeat(262144 - Buffer.byteLength(JSON.stringify(exact)));
  assert.equal(Buffer.byteLength(JSON.stringify(exact)), 262144);
  assert.equal((await validateDocument(exact)).expanded.body[0].text, 'Concrete content');
  exact.data.padding += 'x';
  await problem(() => validateDocument(exact), 'size_limit', 'contract', '/');

  const depth = document();
  let nested = 7;
  for (let i = 0; i < 31; i++) nested = { child: nested };
  depth.data = nested;
  assert.equal((await validateDocument(depth)).expanded.version, '1.5');
  depth.data = { child: nested };
  await problem(() => validateDocument(depth), 'depth_limit', 'contract');

  const elements = document();
  elements.card.body = Array.from({ length: 499 }, (_, i) => ({ type: 'TextBlock', text: String(i) }));
  assert.equal((await validateDocument(elements)).expanded.body.length, 499);
  elements.card.body.push({ type: 'TextBlock', text: 'overflow' });
  await problem(() => validateDocument(elements), 'element_limit', 'card', '/body/499');
});

test('unsafe JSON keys nonfinite numbers and non-JSON values are rejected before expansion', async () => {
  for (const key of ['__proto__', 'prototype', 'constructor']) {
    const source = document();
    source.data = JSON.parse(`{"${key}":{"polluted":true}}`);
    await problem(() => validateDocument(source), 'unsafe_key', 'contract', `/data/${key}`);
  }
  for (const value of [NaN, Infinity, -Infinity]) {
    await problem(() => validateDocument({ ...document(), data: { value } }), 'invalid_number', 'contract', '/data/value');
  }
  await problem(() => validateDocument({ ...document(), data: { value: undefined } }), 'not_json', 'contract', '/data/value');
  assert.equal({}.polluted, undefined);
});

test('duplicate input action and workshop quote identities fail without ambiguity', async () => {
  const input = example('workshop', 'duplicate-input');
  input.template.body.push({ type: 'Input.Text', id: 'notes' });
  await problem(() => validateDocument(input), 'input_id', 'card');
  const action = example('workshop', 'duplicate-action');
  action.template.actions.push({ type: 'Action.Submit', id: 'review', title: 'Duplicate' });
  await problem(() => validateDocument(action), 'action_contract', 'action');
  const quote = example('workshop', 'duplicate-quote');
  quote.data.quotes[1].id = 'studio';
  await problem(() => validateDocument(quote), 'duplicate_quote', 'data', '/quotes');
});
