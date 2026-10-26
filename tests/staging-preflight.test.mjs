import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {stagingPreflight} from '../src/server/staging-preflight.mjs';
const fixture = () => ({
  bindings: {FOLLOWKIT_API_ENABLED:'true', APP_ORIGIN:'https://app.test', SUPABASE_URL:'https://db.test', SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'},
  provider: {emailConfirmationRequired:true, anonymousSignInEnabled:false, redirectUrls:['https://app.test/auth/callback','https://app.test/auth/recovery']},
  worker: {workers_dev:false, preview_urls:false, assets:{directory:'auth-dist',binding:'ASSETS',run_worker_first:true,html_handling:'none'}},
});
test('valid offline configuration does not certify release readiness', async () => {
  const r = await stagingPreflight(fixture());
  assert.equal(r.configurationValid, true); assert.equal(r.releaseReady, false);
  assert.deepEqual(r.errors, []); assert.ok(r.pendingGates.includes('native_postgres_concurrency'));
});
test('disabled config, secret keys and invalid origins fail actual Worker guard', async () => {
  for (const change of [{FOLLOWKIT_API_ENABLED:'false'}, {SUPABASE_PUBLISHABLE_KEY:'sb_secret_DO_NOT_LOG'}, {SUPABASE_URL:'https://db.test/path'}, {APP_ORIGIN:'https://user:DO_NOT_LOG@app.test'}, {APP_ORIGIN:'mailto:fixture@example.test'}, {APP_ORIGIN:'not a URL'}]) {
    const p=fixture();Object.assign(p.bindings,change); const r=await stagingPreflight(p);
    assert.equal(r.configurationValid,false);assert.doesNotMatch(JSON.stringify(r),/DO_NOT_LOG/);
  }
});
test('redirect wildcards, foreign URLs, duplicates and extra callbacks fail', async () => {
  for (const urls of [['https://app.test/**'], ['https://evil.test/auth/callback','https://app.test/auth/recovery'], ['https://app.test/auth/callback','https://app.test/auth/callback'], [...fixture().provider.redirectUrls,'https://app.test/other']]) {
    const p=fixture();p.provider.redirectUrls=urls;assert.ok((await stagingPreflight(p)).errors.includes('redirect_allowlist_mismatch'));
  }
});
test('provider verification and asset routing must be explicit', async () => {
  const p=fixture();p.provider.emailConfirmationRequired=false;p.provider.anonymousSignInEnabled=true;
  p.worker.assets.run_worker_first=false;p.worker.preview_urls=true;
  assert.deepEqual((await stagingPreflight(p)).errors, ['email_confirmation_required','anonymous_signin_must_be_disabled','alternate_worker_urls_must_be_disabled','asset_routing_mismatch']);
});
test('unexpected bindings and invalid plan shapes are rejected without values', async () => {
  for(const p of [null,[],{}, {bindings:[]}]) assert.equal((await stagingPreflight(p)).configurationValid,false);
  const p=fixture();p.bindings.SERVICE_ROLE_KEY='DO_NOT_LOG';const r=await stagingPreflight(p);
  assert.ok(r.errors.includes('unexpected_binding'));assert.doesNotMatch(JSON.stringify(r),/DO_NOT_LOG/);
});
test('CLI rejects malformed or oversized stdin without leaking supplied content', () => {
  for(const input of ['{"secret":"DO_NOT_LOG",', 'DO_NOT_LOG'.repeat(8000)]) {
    const r=spawnSync(process.execPath,['scripts/staging-preflight.mjs'],{input,encoding:'utf8'});
    assert.equal(r.status,2);assert.doesNotMatch(r.stdout+r.stderr,/DO_NOT_LOG/);
    assert.deepEqual(JSON.parse(r.stdout).errors,['invalid_or_oversized_input']);
  }
});

test('equivalent app/provider origins cannot bypass collision check with a default port', async () => {
  const p=fixture();p.bindings.SUPABASE_URL='https://app.test:443/';
  assert.ok((await stagingPreflight(p)).errors.includes('app_provider_origin_collision'));
});

test('workers.dev is allowed only as the explicitly named primary staging origin', async () => {
  const p=fixture();p.bindings.APP_ORIGIN='https://followkit.example.workers.dev';
  p.provider.redirectUrls=['/auth/callback','/auth/recovery'].map(path=>p.bindings.APP_ORIGIN+path);
  p.worker.name='followkit';p.worker.workers_dev=true;
  assert.equal((await stagingPreflight(p)).configurationValid,true);
  p.worker.name='other';assert.equal((await stagingPreflight(p)).configurationValid,false);
  p.worker.name='followkit';p.worker.preview_urls=true;
  assert.equal((await stagingPreflight(p)).configurationValid,false);
});
test('workers.dev cannot be enabled as an alias for a custom-domain app', async () => {
  const p=fixture();p.worker.name='followkit';p.worker.workers_dev=true;
  assert.ok((await stagingPreflight(p)).errors.includes('alternate_worker_urls_must_be_disabled'));
});
