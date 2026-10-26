import test from 'node:test';
import assert from 'node:assert/strict';
import {checkIsolation} from '../scripts/live-isolation.mjs';
const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
const provider = 'https://kfnputowvfxozdiuhpzo.supabase.co';
const token = (id, role = 'authenticated', exp = Date.now() / 1000 + 600) => 'e30.' + Buffer.from(JSON.stringify({sub: id, role, iss: provider + '/auth/v1', exp})).toString('base64url') + '.fixture';
const tokens = ids.map(id => token(id));
function fixture({leak = false, missing = false, redirect = false} = {}) {
  const calls = [];
  return {calls, fetcher: async (input, init) => {
    const url = new URL(input); calls.push({url, init});
    assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error'); assert.equal(init.credentials, 'omit');
    assert.ok(['https://followkit.hakimihaika219.workers.dev', provider].includes(url.origin));
    const index = tokens.indexOf(init.headers.Authorization?.replace('Bearer ', '')), id = ids[index];
    let data, status = 200;
    if (redirect) return new Response('{}', {status: 302, headers: {Location: 'https://example.invalid'}});
    if (url.pathname === '/auth/config') data = {enabled: true, appOrigin: url.origin, url: provider, publishableKey: 'sb_publishable_fixture'};
    else if (url.pathname === '/auth/v1/user') data = {id, email_confirmed_at: '2026-01-01', is_anonymous: false};
    else if (url.pathname === '/api/account') data = {id};
    else if (url.pathname.startsWith('/rest/v1/')) {
      const col = url.pathname.endsWith('fk_accounts') ? 'id' : 'account_id';
      const requested = url.searchParams.get(col).slice(3);
      data = (requested === id || leak) && !missing ? [{id: requested, account_id: requested}] : [];
    } else if (url.pathname.startsWith('/api/')) {
      if (url.pathname.split('/')[3] === id) data = {id};
      else {status = 404; data = {error: {code: 'not_found'}};}
    } else throw Error('Unexpected request');
    return Response.json(data, {status});
  }};
}
test('live isolation checker requires positive controls and tests both directions using GET only', async () => {
  const f = fixture(), result = await checkIsolation(tokens, f);
  assert.equal(result.passed, true); assert.equal(result.checks.length, 36);
  assert.equal(f.calls.length, 35);
  const output = JSON.stringify(result);
  for (const secret of [...tokens, ...ids]) assert.equal(output.includes(secret), false);
});
test('live isolation checker fails when foreign data leaks or positive fixtures are absent', async () => {
  for (const options of [{leak: true}, {missing: true}, {redirect: true}]) {
    assert.equal((await checkIsolation(tokens, fixture(options))).passed, false);
  }
});
test('live isolation checker rejects duplicate accounts, privileged and expired tokens before network', async () => {
  for (const input of [[tokens[0], tokens[0]], [token(ids[0], 'service_role'), tokens[1]], [token(ids[0], 'authenticated', 1), tokens[1]], ['', tokens[1]], []]) {
    const f = fixture(); assert.equal((await checkIsolation(input, f)).passed, false); assert.equal(f.calls.length, 0);
  }
});
test('live isolation checker sanitizes transport errors and bounds response bodies', async () => {
  for (const fetcher of [async () => {throw Error(tokens[0]);}, async () => new Response('x'.repeat(262145))]) {
    const result = await checkIsolation(tokens, {fetcher});
    assert.equal(result.passed, false); assert.equal(JSON.stringify(result).includes(tokens[0]), false);
  }
});
