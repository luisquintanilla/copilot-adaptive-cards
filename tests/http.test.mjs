import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { startServer } from '../build/extension/core.mjs';
import { fixture } from './helpers.mjs';

async function serverFixture(t) {
  const calls = [];
  const { store, directory } = await fixture(t, async prompt => { calls.push(prompt); return 'unexpected'; });
  await store.open('http');
  const reports = [];
  const server = await startServer(store, 'http', { sessionLabel: 'PRIVATE_SESSION_SENTINEL', report: error => reports.push(error) });
  t.after(() => server.close());
  const url = new URL(server.url);
  const token = url.hash.slice(1);
  return { store, directory, server, origin: url.origin, token, calls, reports };
}

function http(host, path, { method = 'GET', headers = {}, raw, json, authenticated = true } = {}) {
  const body = json === undefined ? raw : JSON.stringify(json);
  return new Promise((resolve, reject) => {
    const req = request(new URL(path, host.origin), {
      method,
      headers: {
        ...(authenticated ? { Authorization: `Bearer ${host.token}` } : {}),
        ...(method === 'POST' ? { Origin: host.origin, 'Content-Type': 'application/json' } : {}),
        ...(body === undefined ? {} : { 'Content-Length': Buffer.byteLength(body) }),
        ...headers
      },
      agent: false
    }, response => {
      const parts = [];
      response.on('data', chunk => parts.push(chunk));
      response.on('error', reject);
      response.on('end', () => {
        const text = Buffer.concat(parts).toString('utf8');
        resolve({
          status: response.statusCode, headers: response.headers, text,
          body: response.headers['content-type']?.startsWith('application/json') ? JSON.parse(text) : undefined
        });
      });
    });
    req.setTimeout(15000, () => req.destroy(new Error('Local HTTP test timed out')));
    req.on('error', reject);
    req.end(body);
  });
}

test('HTTP binds loopback and requires the exact capability token without accepting query tokens for API state', async t => {
  const host = await serverFixture(t);
  assert.equal(new URL(host.server.url).hostname, '127.0.0.1');
  assert.match(host.token, /^[A-Za-z0-9_-]{43}$/);
  for (const options of [
    { authenticated: false },
    { headers: { Authorization: 'Bearer wrong' } },
    { headers: { Authorization: `Bearer ${'x'.repeat(43)}` } }
  ]) {
    const result = await http(host, '/api/state', options);
    assert.equal(result.status, 401);
    assert.equal(result.body.code, 'unauthorized');
    assert.equal(result.body.document, undefined);
    assert.ok(!result.text.includes(host.token));
  }
  const query = await http(host, `/api/state?cap=${host.token}`, { authenticated: false });
  assert.equal(query.status, 401);
  const result = await http(host, '/api/state');
  assert.equal(result.status, 200);
  assert.equal(result.body.document.documentId, 'http');
  assert.equal(result.body.sessionLabel, 'PRIVATE_SESSION_SENTINEL');
  assert.deepEqual(host.calls, []);
});

test('HTTP rejects forged Host foreign Origin cross-site fetch and missing POST Origin', async t => {
  const host = await serverFixture(t);
  for (const [path, options, code] of [
    ['/api/state', { headers: { Host: 'attacker.invalid' } }, 'host_rejected'],
    ['/', { authenticated: false, headers: { Host: 'attacker.invalid' } }, 'host_rejected'],
    ['/api/state', { headers: { Origin: 'https://attacker.invalid' } }, 'origin_rejected'],
    ['/api/state', { headers: { 'Sec-Fetch-Site': 'cross-site' } }, 'origin_rejected'],
    ['/api/draft', { method: 'POST', headers: { Origin: '' }, json: { expectedRevision: 1, inputs: {} } }, 'origin_rejected'],
    ['/api/draft', { method: 'POST', headers: { Origin: 'https://attacker.invalid' }, json: { expectedRevision: 1, inputs: {} } }, 'origin_rejected']
  ]) {
    const result = await http(host, path, options);
    assert.equal(result.status, 403);
    assert.equal(result.body.code, code);
  }
  const allowed = await http(host, '/api/state', { headers: { Origin: host.origin, 'Sec-Fetch-Site': 'same-origin' } });
  assert.equal(allowed.status, 200);
  assert.equal((await host.store.get('http')).revision, 1);
  assert.deepEqual(host.reports, []);
});

test('HTTP enforces JSON media type object syntax and the exact 256 KiB body boundary', async t => {
  const host = await serverFixture(t);
  for (const [raw, headers, status, code] of [
    ['{}', { 'Content-Type': 'text/plain' }, 415, 'content_type'],
    ['{', {}, 400, 'invalid_json'],
    ['[]', {}, 400, 'invalid_body']
  ]) {
    const result = await http(host, '/api/draft', { method: 'POST', raw, headers });
    assert.equal(result.status, status);
    assert.equal(result.body.code, code);
  }
  // An unknown endpoint avoids confusing transport bounds with the smaller draft limit.
  const small = '{"expectedRevision":1,"padding":""}';
  const exact = JSON.stringify({ expectedRevision: 1, padding: 'x'.repeat(262144 - Buffer.byteLength(small)) });
  assert.equal(Buffer.byteLength(exact), 262144);
  const accepted = await http(host, '/api/unknown', { method: 'POST', raw: exact });
  assert.equal(accepted.status, 404);
  assert.equal(accepted.body.code, 'not_found');
  const overflow = await http(host, '/api/unknown', { method: 'POST', raw: `${exact} ` });
  assert.equal(overflow.status, 413);
  assert.equal(overflow.body.code, 'body_limit');
  assert.equal((await host.store.get('http')).revision, 1);
});

test('HTTP does not treat an application/json lookalike media type as JSON', async t => {
  const host = await serverFixture(t);
  const result = await http(host, '/api/draft', {
    method: 'POST', headers: { 'Content-Type': 'application/jsonp' },
    json: { expectedRevision: 1, inputs: { notes: 'Must not save under a false JSON media type' } }
  });
  assert.equal(result.status, 415);
  assert.equal(result.body.code, 'content_type');
  assert.equal((await host.store.get('http')).revision, 1);
});

test('HTTP state draft and submit match durable Store revisions normalized inputs and recalculation', async t => {
  const host = await serverFixture(t);
  const draft = await http(host, '/api/draft', {
    method: 'POST', json: { expectedRevision: 1, inputs: { selection: 'studio', notes: 'HTTP human notes' } }
  });
  assert.equal(draft.status, 200);
  assert.equal(draft.body.revision, 2);
  const submitted = await http(host, '/api/submit', {
    method: 'POST', json: { expectedRevision: 2, actionId: 'parameters', inputs: { attendees: '50', budget: '3000' } }
  });
  assert.equal(submitted.status, 200);
  assert.equal(submitted.body.revision, 3);
  assert.equal(submitted.body.evidenceRevision, 2);
  assert.deepEqual(submitted.body.submissions[0].inputs, { attendees: 50, budget: 3000 });
  assert.equal(submitted.body.draft.notes, 'HTTP human notes');
  assert.equal(submitted.body.document.data.costs[0].summary, '$2950.00 USD; within budget; capacity fits');
  const state = await http(host, '/api/state');
  const direct = await host.store.get('http');
  for (const field of ['revision', 'evidenceRevision', 'draft', 'document', 'expanded', 'submissions']) {
    assert.deepEqual(state.body[field], direct[field]);
    assert.deepEqual(submitted.body[field], direct[field]);
  }
  const stale = await http(host, '/api/submit', {
    method: 'POST', json: { expectedRevision: 2, actionId: 'review', inputs: { selection: 'hall', notes: '' } }
  });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.code, 'revision_conflict');
  assert.equal((await host.store.get('http')).submissions.length, 1);
  assert.deepEqual(host.calls, []);
});

test('HTTP static assets exclude capability and private state while CSP allows renderer styles but not inline scripts', async t => {
  const host = await serverFixture(t);
  await host.store.saveDraft('http', 1, { notes: 'PRIVATE_DRAFT_SENTINEL' });
  for (const [path, type] of [
    ['/', 'text/html'], ['/app.js', 'text/javascript'], ['/adapter.js', 'text/javascript'],
    ['/styles.css', 'text/css'], ['/adaptivecards.js', 'text/javascript']
  ]) {
    const result = await http(host, path, { authenticated: false });
    assert.equal(result.status, 200);
    assert.ok(result.headers['content-type'].startsWith(type));
    assert.ok(result.text.length > 20);
    for (const secret of [host.token, 'PRIVATE_SESSION_SENTINEL', 'PRIVATE_DRAFT_SENTINEL', host.directory]) {
      assert.ok(!result.text.includes(secret), `${path} leaked ${secret}`);
    }
    assert.equal(result.headers['cache-control'], 'no-store');
    assert.equal(result.headers['referrer-policy'], 'no-referrer');
    assert.equal(result.headers['x-content-type-options'], 'nosniff');
    const directives = result.headers['content-security-policy'].split('; ').sort();
    assert.deepEqual(directives, [
      "default-src 'none'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
      "connect-src 'self'", "img-src 'none'", "font-src 'self'", "base-uri 'none'",
      "form-action 'none'", "object-src 'none'"
    ].sort());
  }
  const privateFile = await http(host, '/http.json', { authenticated: false });
  assert.equal(privateFile.status, 401);
  const secretPath = await http(host, '/package.json');
  assert.equal(secretPath.status, 405);
  assert.deepEqual(host.calls, []);
});

test('HTTP event stream accepts its query capability and closes cleanly with a ready event', async t => {
  const host = await serverFixture(t);
  const denied = await http(host, '/events?cap=wrong', { authenticated: false });
  assert.equal(denied.status, 401);
  const ready = await new Promise((resolve, reject) => {
    const req = request(`${host.origin}/events?cap=${host.token}`, { agent: false }, response => {
      let text = '';
      response.on('data', chunk => {
        text += chunk.toString();
        if (text.includes('\n\n')) {
          resolve({ status: response.statusCode, type: response.headers['content-type'], text });
          response.destroy();
          req.destroy();
        }
      });
      response.on('error', reject);
    });
    req.setTimeout(15000, () => req.destroy(new Error('No SSE ready event')));
    req.on('error', reject);
    t.after(() => req.destroy());
    req.end();
  });
  assert.equal(ready.status, 200);
  assert.match(ready.type, /^text\/event-stream/);
  assert.equal(ready.text, 'event: ready\ndata: {}\n\n');
  assert.ok(!ready.text.includes(host.token));
});
