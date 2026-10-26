import {createWorker} from '../worker/index.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const bindingNames = ['FOLLOWKIT_API_ENABLED', 'APP_ORIGIN', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY'];
const pendingGates = [
  'native_postgres_concurrency', 'live_provider_lifecycle', 'direct_rls_isolation',
  'token_revocation_bound', 'restore_reconciliation', 'device_accessibility',
  'approved_staging_target_and_budget',
];

// Offline validation of an operator-supplied plan. Never proves provider state or authorizes deployment.
export async function stagingPreflight(plan) {
  const errors = [];
  const fail = code => errors.push(code);
  if (!object(plan) || !object(plan.bindings) || !object(plan.provider) || !object(plan.worker)) {
    return {configurationValid: false, releaseReady: false, errors: ['invalid_plan_shape'], pendingGates};
  }
  const {bindings, provider, worker} = plan;
  if (Object.keys(bindings).some(key => !bindingNames.includes(key))) fail('unexpected_binding');
  if (bindingNames.some(key => typeof bindings[key] !== 'string')) fail('missing_or_nonstring_binding');
  let app;
  try {
    app = new URL(bindings.APP_ORIGIN);
    if (app.protocol !== 'https:' || app.username || app.password || app.pathname !== '/' || app.search || app.hash) throw Error();
  } catch { app = undefined; fail('invalid_app_origin'); }
  if (app && app.origin !== 'null') {
    // Exercise the actual Worker configuration guard without provider or asset requests.
    const candidate = createWorker({fetcher: async () => { throw Error('Network forbidden in preflight'); }});
    const result = await candidate.fetch(new Request(new URL('/auth/config', app.origin)), bindings);
    if (result.status !== 200) fail('worker_configuration_rejected');
  } else fail('worker_configuration_rejected');
  try { if (app && app.origin === new URL(bindings.SUPABASE_URL).origin) fail('app_provider_origin_collision'); } catch { /* Worker guard reports invalid provider origins. */ }
  if (provider.emailConfirmationRequired !== true) fail('email_confirmation_required');
  if (provider.anonymousSignInEnabled !== false) fail('anonymous_signin_must_be_disabled');
  if (app) {
    const expected = [new URL('/auth/callback', app).href, new URL('/auth/recovery', app).href];
    const actual = provider.redirectUrls;
    if (!Array.isArray(actual) || actual.length !== 2 || new Set(actual).size !== 2 ||
        !expected.every(url => actual.includes(url))) fail('redirect_allowlist_mismatch');
  }
  if (worker.workers_dev !== false || worker.preview_urls !== false) fail('alternate_worker_urls_must_be_disabled');
  const assets = worker.assets;
  if (!object(assets) || assets.directory !== 'auth-dist' || assets.binding !== 'ASSETS' ||
      assets.run_worker_first !== true || assets.html_handling !== 'none') fail('asset_routing_mismatch');
  return {configurationValid: errors.length === 0, releaseReady: false, errors, pendingGates};
}
