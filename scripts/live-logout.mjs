import {pathToFileURL} from 'node:url';
const app = 'https://followkit.hakimihaika219.workers.dev';
const db = 'https://kfnputowvfxozdiuhpzo.supabase.co';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function measureLogout(token, {fetcher = fetch, logoutTestAccount = false, waitUntilExpiry = false,
  now = () => Date.now(), sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), progress = () => {}} = {}) {
  let stage = 'input', key, owner, expires, logoutAccepted = false, logoutAt;
  const samples = [];
  async function request(base, path, method = 'GET', authenticated = true) {
    const response = await fetcher(base + path, {method, redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(10000),
      headers: {'User-Agent': 'FollowKit-Logout-Check/1.0', ...(authenticated ? {Authorization: 'Bearer ' + token} : {}),
        ...(base === db ? {apikey: key} : {})}});
    if (response.status >= 300 && response.status < 400) throw Error();
    const chunks = []; let size = 0; const reader = response.body?.getReader();
    if (reader) {try {while (true) {const {done, value} = await reader.read(); if (done) break;
      size += value.byteLength; if (size > 65536) {await reader.cancel(); throw Error();} chunks.push(value);
    }} finally {reader.releaseLock();}}
    return {status: response.status, data: size ? JSON.parse(Buffer.concat(chunks).toString()) : null};
  }
  async function sample(label) {
    const started = now();
    const worker = await request(app, '/api/account');
    const direct = await request(db, '/rest/v1/fk_accounts?' + new URLSearchParams({select: 'id', id: 'eq.' + owner, limit: '1'}));
    function classify(r, direct = false) {
      if ([401, 403].includes(r.status)) return 'denied';
      if (r.status === 200 && (direct ? Array.isArray(r.data) && r.data.length === 1 && r.data[0].id === owner : r.data?.id === owner)) return 'accessible';
      return 'inconclusive';
    }
    const result = {label, startedAt: new Date(started).toISOString(), finishedAt: new Date(now()).toISOString(),
      ...(logoutAt === undefined ? {} : {secondsAfterLogout: Math.max(0, Math.ceil((now() - logoutAt) / 1000))}),
      worker: {status: worker.status, access: classify(worker)}, directDataApi: {status: direct.status, access: classify(direct, true)}};
    samples.push(result);
    if ([result.worker.access, result.directDataApi.access].includes('inconclusive')) throw Error();
    return result;
  }
  const both = (s, value) => s.worker.access === value && s.directDataApi.access === value;
  try {
    if (!logoutTestAccount || typeof token !== 'string' || token.length > 8192 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) throw Error();
    const claim = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    if (claim.role !== 'authenticated' || claim.iss !== db + '/auth/v1' || !uuid.test(claim.sub) || !Number.isFinite(claim.exp)) throw Error();
    owner = claim.sub; expires = claim.exp * 1000;
    if (expires - now() < 30000 || expires - now() > 7200000) throw Error();
    stage = 'configuration';
    const config = await request(app, '/auth/config', 'GET', false);
    if (config.status !== 200 || config.data.enabled !== true || config.data.url !== db || config.data.appOrigin !== app || !/^sb_publishable_[\w-]+$/.test(config.data.publishableKey)) throw Error();
    key = config.data.publishableKey;
    stage = 'identity';
    const user = await request(db, '/auth/v1/user');
    if (user.status !== 200 || user.data.id !== owner || !user.data.email_confirmed_at || user.data.is_anonymous === true) throw Error();
    stage = 'before_logout';
    if (!both(await sample('before_logout'), 'accessible')) throw Error();
    if (expires - now() < 15000) throw Error();
    stage = 'logout';
    const logout = await request(db, '/auth/v1/logout?scope=global', 'POST');
    if (logout.status !== 204) throw Error();
    logoutAccepted = true; logoutAt = now();
    stage = 'after_logout';
    const immediate = await sample('after_logout');
    const immediateRevocation = both(immediate, 'denied');
    let final = immediate;
    if (!immediateRevocation && waitUntilExpiry) {
      stage = 'waiting_for_expiry';
      const target = expires + 65000;
      // Local user-run wait, no refresh-token use or repeated network polling.
      while (now() < target) {
        const remaining = target - now();
        progress({phase: stage, remainingSeconds: Math.ceil(remaining / 1000)});
        await sleep(Math.min(30000, remaining));
      }
      stage = 'after_expiry'; final = await sample('after_expiry');
    }
    const rejectionObserved = both(final, 'denied');
    return {scope: 'single_test_account_global_logout', measurementComplete: true, logoutAccepted,
      immediateRevocation, rejectionObserved, expiryCheckPerformed: final.label === 'after_expiry',
      tokenExpiresAt: new Date(expires).toISOString(), samples,
      ...(rejectionObserved ? {rejectionObservedBySeconds: final.secondsAfterLogout} : {}),
      conclusion: immediateRevocation ? 'both_denied_on_first_post_logout_sample' : rejectionObserved ? 'access_persisted_after_logout_but_both_denied_at_expiry_check' : 'post_logout_access_remains_rejection_time_not_established'};
  } catch {
    return {scope: 'single_test_account_global_logout', measurementComplete: false, stoppedAt: stage, logoutAccepted, samples};
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const token = process.env.FOLLOWKIT_TEST_TOKEN_A; delete process.env.FOLLOWKIT_TEST_TOKEN_A;
  const result = await measureLogout(token, {logoutTestAccount: process.argv.includes('--logout-test-account'),
    waitUntilExpiry: process.argv.includes('--wait-until-expiry'), progress: value => console.error(JSON.stringify(value))});
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.measurementComplete && result.rejectionObserved ? 0 : 2;
}
