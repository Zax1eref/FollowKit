import {pathToFileURL} from 'node:url';

// Fixed reviewed targets: credentials must never be forwarded to arbitrary origins.
const app = 'https://followkit.hakimihaika219.workers.dev';
const provider = 'https://kfnputowvfxozdiuhpzo.supabase.co';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const tables = ['fk_accounts', 'fk_customers', 'fk_quotes', 'fk_followups', 'fk_subscriptions'];
const ownerColumn = table => table === 'fk_accounts' ? 'id' : 'account_id';
function subject(token) {
  if (typeof token !== 'string' || token.length > 8192 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) throw Error();
  const claim = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  if (claim.role !== 'authenticated' || !uuid.test(claim.sub) || claim.iss !== provider + '/auth/v1' || !Number.isFinite(claim.exp) || claim.exp * 1000 <= Date.now()) throw Error();
  return claim.sub; // Untrusted until the actual provider verifies this token below.
}
export async function checkIsolation(tokens, {fetcher = fetch} = {}) {
  const checks = [];
  let stage = 'input';
  const require = (ok, name) => { checks.push({name, passed: Boolean(ok)}); if (!ok) throw Error(); };
  async function get(url, token, key) {
    const response = await fetcher(url, {method: 'GET', redirect: 'error', credentials: 'omit',
      signal: AbortSignal.timeout(10000), headers: {'User-Agent': 'FollowKit-Isolation-Check/1.0',
        ...(token ? {Authorization: 'Bearer ' + token} : {}), ...(key ? {apikey: key} : {})}});
    if (response.status >= 300 && response.status < 400) throw Error();
    const reader = response.body?.getReader();
    if (!reader) throw Error();
    let size = 0; const chunks = [];
    try { while (true) { const {done, value} = await reader.read(); if (done) break;
      size += value.byteLength; if (size > 262144) { await reader.cancel(); throw Error(); } chunks.push(value); }
    } finally { reader.releaseLock(); }
    return {status: response.status, data: JSON.parse(Buffer.concat(chunks).toString())};
  }
  try {
    if (!Array.isArray(tokens) || tokens.length !== 2) throw Error();
    const owners = tokens.map(subject);
    require(owners[0] !== owners[1], 'distinct_accounts');
    stage = 'configuration';
    const config = await get(app + '/auth/config');
    require(config.status === 200 && config.data.enabled === true && config.data.appOrigin === app && config.data.url === provider && /^sb_publishable_[\w-]+$/.test(config.data.publishableKey), 'reviewed_origins');
    const key = config.data.publishableKey;
    const fixtures = [{}, {}];
    for (const i of [0, 1]) {
      stage = `account_${i + 1}_positive_controls`;
      const user = await get(provider + '/auth/v1/user', tokens[i], key);
      require(user.status === 200 && user.data.id === owners[i] && Boolean(user.data.email_confirmed_at) && user.data.is_anonymous !== true, `${stage}_identity`);
      const account = await get(app + '/api/account', tokens[i]);
      require(account.status === 200 && account.data.id === owners[i], `${stage}_worker`);
      for (const table of tables) {
        const col = ownerColumn(table), select = table === 'fk_subscriptions' ? col : [...new Set(['id', col])].join(',');
        const result = await get(provider + '/rest/v1/' + table + '?' + new URLSearchParams({select, [col]: 'eq.' + owners[i], limit: '1'}), tokens[i], key);
        require(result.status === 200 && Array.isArray(result.data) && result.data.length === 1 && result.data[0][col] === owners[i] && (table === 'fk_subscriptions' || uuid.test(result.data[0].id)), `${stage}_${table}`);
        fixtures[i][table] = result.data[0];
      }
    }
    for (const i of [0, 1]) {
      const other = 1 - i;
      stage = `account_${i + 1}_foreign_reads`;
      for (const table of tables) {
        const col = ownerColumn(table);
        const result = await get(provider + '/rest/v1/' + table + '?' + new URLSearchParams({select: col, [col]: 'eq.' + owners[other], limit: '1'}), tokens[i], key);
        require(result.status === 200 && Array.isArray(result.data) && result.data.length === 0, `${stage}_${table}`);
      }
      for (const entity of ['customers', 'quotes']) {
        const own = fixtures[i]['fk_' + entity].id, foreign = fixtures[other]['fk_' + entity].id;
        const control = await get(app + '/api/' + entity + '/' + own, tokens[i]);
        require(control.status === 200 && control.data.id === own, `${stage}_${entity}_own`);
        const denied = await get(app + '/api/' + entity + '/' + foreign, tokens[i]);
        require(denied.status === 404, `${stage}_${entity}_denied`);
      }
      const history = await get(app + '/api/quotes/' + fixtures[other].fk_quotes.id + '/followups', tokens[i]);
      require(history.status === 404, `${stage}_history_denied`);
    }
    return {passed: true, scope: 'read_only_two_account_http', checks};
  } catch {
    return {passed: false, scope: 'read_only_two_account_http', stoppedAt: stage, checks};
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const tokens = [process.env.FOLLOWKIT_TEST_TOKEN_A, process.env.FOLLOWKIT_TEST_TOKEN_B];
  delete process.env.FOLLOWKIT_TEST_TOKEN_A; delete process.env.FOLLOWKIT_TEST_TOKEN_B;
  const result = await checkIsolation(tokens);
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.passed ? 0 : 2;
}
