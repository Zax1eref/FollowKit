import test from 'node:test';
import assert from 'node:assert/strict';
import {checkQuoteIsolation} from '../scripts/live-quote-isolation.mjs';
const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
const db = 'https://kfnputowvfxozdiuhpzo.supabase.co';
const tokens = ids.map(sub => 'e30.' + Buffer.from(JSON.stringify({sub, role: 'authenticated', iss: db + '/auth/v1', exp: Date.now()/1000+600})).toString('base64url') + '.test');
function fixture({leak = '', lostQuote = false, quota = false, cleanupFailure = false, preflightFailure = false, falseDenial = false} = {}) {
  const customers = new Map(), quotes = new Map(), followups = new Map(); let serial = 0, mutations = 0;
  const next = () => `33333333-3333-4333-8333-${String(++serial).padStart(12, '0')}`;
  return {customers, quotes, followups, get mutations() {return mutations;}, fetcher: async (input, init) => {
    const url = new URL(input), path = url.pathname, method = init.method;
    assert.ok([db, 'https://followkit.hakimihaika219.workers.dev'].includes(url.origin)); assert.equal(init.redirect, 'error');
    const owner = ids[tokens.indexOf(init.headers.Authorization?.replace('Bearer ', ''))];
    const body = init.body ? JSON.parse(init.body) : {};
    const reply = (data, status = 200) => status === 204 ? new Response(null, {status}) : Response.json(data, {status});
    if (method !== 'GET') mutations++;
    if (path === '/auth/config') return reply({enabled: true, appOrigin: url.origin, url: db, publishableKey: 'sb_publishable_fixture'});
    if (path === '/auth/v1/user') return reply({id: owner, email_confirmed_at: '2026-01-01'}, preflightFailure ? 401 : 200);
    if (path === '/api/account') return reply({id: owner});
    if (path.startsWith('/rest/v1/') && method === 'GET') {
      if (url.searchParams.has('quote_id')) return reply([...followups.values()].filter(f => f.quote_id === url.searchParams.get('quote_id').slice(3) && f.account_id === owner));
      const col = path.endsWith('fk_accounts') ? 'id' : 'account_id';
      return reply(url.searchParams.get(col) === 'eq.' + owner ? [{id: owner, account_id: owner}] : []);
    }
    if (['/api/customers', '/api/quotes'].includes(path) && method === 'POST') {
      if (path.endsWith('quotes') && quota) return reply({error: {code: 'plan_limit'}}, 409);
      const row = {id: next(), account_id: owner, ...body};
      (path.endsWith('quotes') ? quotes : customers).set(row.id, row);
      if (path.endsWith('quotes')) {assert.match(init.headers['Idempotency-Key'], /^[\w-]+$/); if (lostQuote) throw Error('lost response');}
      return reply(row, 201);
    }
    const rpc = path.includes('/rpc/'), table = path.startsWith('/rest/v1/fk_');
    const id = path.startsWith('/api/') ? path.split('/')[3] : body.p_id || body.p_quote_id || url.searchParams.get('id')?.slice(3);
    const collection = path.includes('customer') ? customers : quotes, row = collection.get(id);
    const isFollow = path.endsWith('/followups') || path.endsWith('/fk_followup');
    if (method === 'GET') {
      if (row?.account_id === owner) return reply(isFollow ? {items: [...followups.values()].filter(f => f.quote_id === id)} : row);
      if (id === owner) return reply({id});
      return reply({error: {code: 'not_found'}}, 404);
    }
    if (table) return reply({code: '42501'}, 403);
    const foreign = row?.account_id !== owner;
    const bypass = foreign && ((leak === 'patch' && method === 'PATCH') || (leak === 'followup' && isFollow) || (leak === 'delete' && method === 'DELETE'));
    if (foreign && !bypass) return rpc ? reply({message: 'not_found'}, 400) : reply({error: {code: falseDenial ? 'invalid_fields' : 'not_found'}}, 404);
    if (method === 'DELETE' || path.endsWith('fk_delete_quote')) {
      if (cleanupFailure && !foreign) return reply({}, 503);
      collection.delete(id); for (const [key, f] of followups) if (f.quote_id === id) followups.delete(key);
      return reply(null, 204);
    }
    if (isFollow) {
      const f = {id: next(), account_id: owner, quote_id: id, note: body.note || body.p_note, next_due: body.next_due || body.p_next_due};
      followups.set(f.id, f); return reply(f, 201);
    }
    Object.assign(row, rpc ? body.p_patch : body); return reply(row);
  }};
}
test('quote checker probes both directions, preserves snapshots, and cleans all created application rows', async () => {
  const f = fixture(), r = await checkQuoteIsolation(tokens, {...f, disposableAccounts: true});
  assert.equal(r.passed, true); assert.equal(r.checks.length, 58); assert.equal(r.cleanupComplete, true);
  for (const rows of [f.customers, f.quotes, f.followups]) assert.equal(rows.size, 0);
  for (const secret of [...ids, ...tokens]) assert.equal(JSON.stringify(r).includes(secret), false);
});
test('quote checker refuses writes without acknowledgement or passing preflight and retains safe diagnostics', async () => {
  for (const disposableAccounts of [false, true]) {
    const f = fixture({preflightFailure: true}), r = await checkQuoteIsolation(tokens, {...f, disposableAccounts});
    assert.equal(r.passed, false); assert.equal(f.mutations, 0);
    if (disposableAccounts) assert.equal(r.preflightFailure.passed, false);
  }
});
test('quote checker detects cross-account patch/delete/followup bypasses and cleans fixtures', async () => {
  for (const leak of ['patch', 'delete', 'followup']) {
    const f = fixture({leak}), r = await checkQuoteIsolation(tokens, {...f, disposableAccounts: true});
    assert.equal(r.passed, false); assert.equal(r.cleanupComplete, true);
    assert.equal(f.quotes.size + f.followups.size + f.customers.size, 0);
  }
});
test('quote checker rejects unrelated errors as proof of isolation', async () => {
  const r = await checkQuoteIsolation(tokens, {...fixture({falseDenial: true}), disposableAccounts: true});
  assert.equal(r.passed, false); assert.equal(r.cleanupComplete, true);
});
test('quota rejection fails safely and cleans the preceding customer', async () => {
  const f = fixture({quota: true}), r = await checkQuoteIsolation(tokens, {...f, disposableAccounts: true});
  assert.equal(r.passed, false); assert.equal(r.cleanupComplete, true); assert.equal(f.customers.size, 0);
});
test('ambiguous quote creation is not retried and leaves a manual cleanup marker', async () => {
  const f = fixture({lostQuote: true}), r = await checkQuoteIsolation(tokens, {...f, disposableAccounts: true});
  assert.equal(r.passed, false); assert.equal(r.cleanupComplete, false); assert.equal(f.quotes.size, 1); assert.match(r.manualCleanupMarker, /^FK-QUOTE-TEST-/);
});
test('failed cleanup cannot produce a passing result', async () => {
  const r = await checkQuoteIsolation(tokens, {...fixture({cleanupFailure: true}), disposableAccounts: true});
  assert.equal(r.passed, false); assert.equal(r.cleanupComplete, false);
});
