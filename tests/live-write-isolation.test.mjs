import test from 'node:test';
import assert from 'node:assert/strict';
import {checkWriteIsolation} from '../scripts/live-write-isolation.mjs';
const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
const db = 'https://kfnputowvfxozdiuhpzo.supabase.co';
const tokens = ids.map(sub => 'e30.' + Buffer.from(JSON.stringify({sub, role: 'authenticated', iss: db + '/auth/v1', exp: Date.now()/1000+600})).toString('base64url') + '.test');
function fixture({leak = false, lostCreate = false, cleanupFailure = false, preflightFailure = false, falseDenial = false} = {}) {
  const rows = new Map(); let creates = 0, mutations = 0;
  return {rows, get mutations() {return mutations;}, fetcher: async (input, init) => {
    assert.equal(init.redirect, 'error');
    const url = new URL(input), path = url.pathname, method = init.method;
    const index = tokens.indexOf(init.headers.Authorization?.replace('Bearer ', '')), owner = ids[index];
    const body = init.body ? JSON.parse(init.body) : {};
    const reply = (data, status = 200) => status === 204 ? new Response(null, {status}) : Response.json(data, {status});
    if (method !== 'GET') mutations++;
    if (path === '/auth/config') return reply({enabled: true, appOrigin: url.origin, url: db, publishableKey: 'sb_publishable_fixture'});
    if (path === '/auth/v1/user') return reply({id: owner, email_confirmed_at: '2026-01-01'}, preflightFailure ? 401 : 200);
    if (path === '/api/account') return reply({id: owner});
    if (path.startsWith('/rest/v1/') && method === 'GET') {
      const col = path.endsWith('fk_accounts') ? 'id' : 'account_id';
      return reply(url.searchParams.get(col) === 'eq.' + owner ? [{id: owner, account_id: owner}] : []);
    }
    if (path === '/api/customers' && method === 'POST') {
      const id = `33333333-3333-4333-8333-${String(++creates).padStart(12, '0')}`;
      const row = {id, account_id: owner, ...body}; rows.set(id, row);
      if (lostCreate) throw Error('lost response');
      return reply(row, 201);
    }
    const id = path.startsWith('/api/') ? path.split('/')[3] : body.p_id || url.searchParams.get('id')?.slice(3);
    const row = rows.get(id);
    if (method === 'GET') {
      if (row?.account_id === owner) return reply(row);
      if (id === owner) return reply({id}); // Read-only fixture positive control.
      return reply({error: {code: 'not_found'}}, 404);
    }
    const foreign = row?.account_id !== owner;
    if (path.startsWith('/rest/v1/fk_')) return reply({code: '42501'}, 403);
    if (foreign && !leak) return path.includes('/rpc/') ? reply({message: 'not_found'}, 400) : reply({error: {code: falseDenial ? 'invalid_fields' : 'not_found'}}, 404);
    if (method === 'DELETE' || path.endsWith('fk_delete_customer')) {
      if (cleanupFailure && !foreign) return reply({}, 503);
      rows.delete(id); return reply(null, 204);
    }
    Object.assign(row, path.includes('/rpc/') ? {name: body.p_name, contact: body.p_contact} : body);
    return reply(row);
  }};
}
test('write checker probes both directions and cleans only its two new customers', async () => {
  const f = fixture(), r = await checkWriteIsolation(tokens, {...f, disposableAccounts: true});
  assert.equal(r.passed, true); assert.equal(r.checks.length, 32); assert.equal(r.cleanupComplete, true); assert.equal(f.rows.size, 0);
  for (const secret of [...ids, ...tokens]) assert.equal(JSON.stringify(r).includes(secret), false);
});
test('write checker refuses mutation without confirmation or successful read preflight', async () => {
  for (const options of [{}, {disposableAccounts: true}]) {
    const f = fixture({preflightFailure: true});
    assert.equal((await checkWriteIsolation(tokens, {...f, ...options})).passed, false); assert.equal(f.mutations, 0);
  }
});
test('write checker detects ownership bypass and still cleans its disposable data', async () => {
  const f = fixture({leak: true}), r = await checkWriteIsolation(tokens, {...f, disposableAccounts: true});
  assert.equal(r.passed, false); assert.equal(r.cleanupComplete, true); assert.equal(f.rows.size, 0);
});
test('write checker does not count arbitrary error as isolation proof', async () => {
  const f = fixture({falseDenial: true}), r = await checkWriteIsolation(tokens, {...f, disposableAccounts: true});
  assert.equal(r.passed, false); assert.equal(r.cleanupComplete, true);
});
test('lost create response is not retried and reports manual cleanup marker', async () => {
  const f = fixture({lostCreate: true}), r = await checkWriteIsolation(tokens, {...f, disposableAccounts: true});
  assert.equal(r.passed, false); assert.equal(r.cleanupComplete, false); assert.equal(f.rows.size, 1); assert.match(r.manualCleanupMarker, /^FK-ISOLATION-/);
});
test('cleanup failure prevents a passing result', async () => {
  const f = fixture({cleanupFailure: true}), r = await checkWriteIsolation(tokens, {...f, disposableAccounts: true});
  assert.equal(r.passed, false); assert.equal(r.cleanupComplete, false); assert.equal(f.rows.size, 2);
});
