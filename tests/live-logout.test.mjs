import test from 'node:test';
import assert from 'node:assert/strict';
import {measureLogout} from '../scripts/live-logout.mjs';
const owner = '11111111-1111-4111-8111-111111111111', db = 'https://kfnputowvfxozdiuhpzo.supabase.co';
const initial = Date.parse('2026-10-27T00:00:00Z');
const expires = initial + 60000;
const token = 'e30.' + Buffer.from(JSON.stringify({sub: owner, role: 'authenticated', iss: db + '/auth/v1', exp: expires / 1000})).toString('base64url') + '.fixture';
function fixture({immediate = false, outage = false, logoutFailure = false, persists = false, identityFailure = false} = {}) {
  let time = initial, loggedOut = false; const calls = [], waits = [];
  return {calls, waits, now: () => time, sleep: async ms => {waits.push(ms); time += ms;}, fetcher: async (input, init) => {
    const url = new URL(input); calls.push({url, init}); assert.equal(init.redirect, 'error');
    assert.ok([db, 'https://followkit.hakimihaika219.workers.dev'].includes(url.origin));
    const reply = (data, status = 200) => status === 204 ? new Response(null, {status}) : Response.json(data, {status});
    if (url.pathname === '/auth/config') {assert.equal(init.headers.Authorization, undefined); return reply({enabled: true, appOrigin: url.origin, url: db, publishableKey: 'sb_publishable_fixture'});}
    assert.equal(init.headers.Authorization, 'Bearer ' + token);
    if (url.pathname === '/auth/v1/user') return reply({id: owner, email_confirmed_at: '2026-01-01'}, identityFailure ? 401 : 200);
    if (url.pathname === '/auth/v1/logout') {
      assert.equal(init.method, 'POST'); assert.equal(url.search, '?scope=global');
      if (logoutFailure) return reply({}, 503); loggedOut = true; return reply(null, 204);
    }
    assert.equal(init.method, 'GET');
    if (loggedOut && outage) return reply({}, 503);
    if (loggedOut && (immediate || (time >= expires && !persists))) return reply({error: 'unauthorized'}, 401);
    return reply(url.pathname === '/api/account' ? {id: owner} : [{id: owner}]);
  }};
}
test('logout observer records immediate residual access and later expiry denial without token refresh', async () => {
  const f = fixture(), r = await measureLogout(token, {...f, logoutTestAccount: true, waitUntilExpiry: true});
  assert.equal(r.measurementComplete, true); assert.equal(r.immediateRevocation, false); assert.equal(r.rejectionObserved, true);
  assert.equal(r.expiryCheckPerformed, true); assert.equal(r.rejectionObservedBySeconds, 125);
  assert.equal(r.samples.length, 3); assert.ok(f.waits.every(ms => ms <= 30000));
  assert.equal(f.calls.filter(c => c.init.method === 'POST').length, 1);
  assert.equal(JSON.stringify(r).includes(token), false); assert.equal(JSON.stringify(r).includes(owner), false);
});
test('logout observer skips waiting when both endpoints deny on first sample', async () => {
  const f = fixture({immediate: true}), r = await measureLogout(token, {...f, logoutTestAccount: true, waitUntilExpiry: true});
  assert.equal(r.immediateRevocation, true); assert.equal(r.expiryCheckPerformed, false); assert.equal(f.waits.length, 0);
});
test('immediate-only measurement never claims an expiry bound', async () => {
  const r = await measureLogout(token, {...fixture(), logoutTestAccount: true});
  assert.equal(r.measurementComplete, true); assert.equal(r.rejectionObserved, false); assert.equal(r.rejectionObservedBySeconds, undefined);
});
test('outages and failed logout are inconclusive, not successful revocation', async () => {
  for (const options of [{outage: true}, {logoutFailure: true}, {identityFailure: true}]) {
    const r = await measureLogout(token, {...fixture(options), logoutTestAccount: true});
    assert.equal(r.measurementComplete, false); assert.equal(r.rejectionObserved, undefined);
  }
});
test('continued access after expiry is reported without a successful bound', async () => {
  const r = await measureLogout(token, {...fixture({persists: true}), logoutTestAccount: true, waitUntilExpiry: true});
  assert.equal(r.expiryCheckPerformed, true); assert.equal(r.rejectionObserved, false);
});
test('logout observer requires explicit acknowledgement and a valid short-lived user token', async () => {
  for (const [value, acknowledgement] of [[token, false], ['invalid', true]]) {
    const f = fixture(), r = await measureLogout(value, {...f, logoutTestAccount: acknowledgement});
    assert.equal(r.measurementComplete, false); assert.equal(f.calls.length, 0);
  }
});
test('logout observer sanitizes transport errors and rejects redirects', async () => {
  for (const fetcher of [async () => {throw Error(token);}, async () => new Response(null, {status: 302})]) {
    const r = await measureLogout(token, {fetcher, now: () => initial, logoutTestAccount: true});
    assert.equal(r.measurementComplete, false); assert.equal(JSON.stringify(r).includes(token), false);
  }
});
