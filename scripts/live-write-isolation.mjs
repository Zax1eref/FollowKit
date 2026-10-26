import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {checkIsolation} from './live-isolation.mjs';
const app = 'https://followkit.hakimihaika219.workers.dev';
const db = 'https://kfnputowvfxozdiuhpzo.supabase.co';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function checkWriteIsolation(tokens, {fetcher = fetch, disposableAccounts = false} = {}) {
  const checks = [], created = [], cleanup = [];
  const marker = 'FK-ISOLATION-' + randomUUID();
  let stage = 'confirmation', key, ambiguousCreate = false, failed = false;
  const verify = (name, ok) => {checks.push({name, passed: Boolean(ok)}); if (!ok) throw Error();};
  async function request(base, path, index, method = 'GET', body) {
    const response = await fetcher(base + path, {method, redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(10000),
      headers: {'User-Agent': 'FollowKit-Write-Isolation/1.0', Authorization: 'Bearer ' + tokens[index],
        'Content-Type': 'application/json', ...(base === db ? {apikey: key} : {})},
      ...(body === undefined ? {} : {body: JSON.stringify(body)})});
    if (response.status >= 300 && response.status < 400) throw Error();
    const reader = response.body?.getReader(); const chunks = []; let size = 0;
    if (reader) {try {while (true) {const {value, done} = await reader.read(); if (done) break;
      size += value.byteLength; if (size > 262144) {await reader.cancel(); throw Error();} chunks.push(value);
    }} finally {reader.releaseLock();}}
    return {status: response.status, data: size ? JSON.parse(Buffer.concat(chunks).toString()) : null};
  }
  try {
    if (!disposableAccounts) throw Error();
    stage = 'read_preflight';
    const preflight = await checkIsolation(tokens, {fetcher});
    verify('read_preflight', preflight.passed);
    const config = await request(app, '/auth/config', 0);
    verify('configuration', config.status === 200 && config.data.url === db && config.data.appOrigin === app && /^sb_publishable_[\w-]+$/.test(config.data.publishableKey));
    key = config.data.publishableKey;
    for (const index of [0, 1]) {
      stage = `create_${index + 1}`;
      const account = await request(app, '/api/account', index);
      verify(stage + '_owner', account.status === 200 && uuid.test(account.data.id));
      // No retry: an interrupted create may have committed without returning its ID.
      ambiguousCreate = true;
      const result = await request(app, '/api/customers', index, 'POST', {name: marker, contact: marker});
      verify(stage, result.status === 201 && uuid.test(result.data?.id) && result.data.account_id === account.data.id && result.data.name === marker && result.data.contact === marker);
      created.push({index, id: result.data.id, owner: account.data.id, name: marker});
      ambiguousCreate = false;
    }
    for (const item of created) {
      stage = `account_${item.index + 1}`;
      const path = '/api/customers/' + item.id;
      const name = marker + '-own';
      const own = await request(app, path, item.index, 'PATCH', {name, contact: marker});
      verify(stage + '_own_patch', own.status === 200 && own.data.name === name);
      item.name = name;
      const foreign = 1 - item.index;
      const probes = [
        ['worker_patch', app, path, 'PATCH', {name: marker + '-foreign', contact: marker}, 404],
        ['worker_delete', app, path, 'DELETE', undefined, 404],
        ['rpc_patch', db, '/rest/v1/rpc/fk_save_customer', 'POST', {p_id: item.id, p_name: marker + '-foreign', p_contact: marker}, 400],
        ['rpc_delete', db, '/rest/v1/rpc/fk_delete_customer', 'POST', {p_id: item.id}, 400],
        ['table_patch', db, '/rest/v1/fk_customers?id=eq.' + item.id, 'PATCH', {name: marker + '-foreign'}, 403],
        ['table_delete', db, '/rest/v1/fk_customers?id=eq.' + item.id, 'DELETE', undefined, 403]
      ];
      for (const [label, base, route, method, body, status] of probes) {
        const result = await request(base, route, foreign, method, body);
        // A generic validation/server error is not evidence of an ownership denial.
        verify(stage + '_' + label + '_denied', result.status === status &&
          (label.startsWith('rpc') ? result.data?.message === 'not_found' : label.startsWith('table') ? result.data?.code === '42501' : result.data?.error?.code === 'not_found'));
        const retained = await request(app, path, item.index);
        verify(stage + '_' + label + '_unchanged', retained.status === 200 && retained.data.id === item.id && retained.data.account_id === item.owner && retained.data.name === item.name && retained.data.contact === marker);
      }
    }
  } catch {failed = true;}
  finally {
    // Delete only server-returned IDs from this run, after rechecking ownership and marker.
    for (const item of created) {
      let removed = false;
      try {
        const path = '/api/customers/' + item.id;
        const current = await request(app, path, item.index);
        if (current.status === 404) removed = true;
        else if (current.status === 200 && current.data.id === item.id && current.data.account_id === item.owner && current.data.contact === marker && current.data.name.startsWith(marker)) {
          const deletion = await request(app, path, item.index, 'DELETE');
          const after = await request(app, path, item.index);
          removed = deletion.status === 204 && after.status === 404;
        }
      } catch { /* Report cleanup failure without credentials or provider details. */ }
      cleanup.push({account: item.index + 1, removed});
    }
  }
  const cleanupComplete = !ambiguousCreate && cleanup.every(x => x.removed);
  return {passed: !failed && cleanupComplete, scope: 'disposable_customer_write_isolation',
    ...(failed ? {stoppedAt: stage} : {}), checks, cleanup, cleanupComplete,
    ...(!cleanupComplete ? {manualCleanupMarker: marker} : {})};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const tokens = [process.env.FOLLOWKIT_TEST_TOKEN_A, process.env.FOLLOWKIT_TEST_TOKEN_B];
  delete process.env.FOLLOWKIT_TEST_TOKEN_A; delete process.env.FOLLOWKIT_TEST_TOKEN_B;
  const result = await checkWriteIsolation(tokens, {disposableAccounts: process.argv.includes('--disposable-test-accounts')});
  console.log(JSON.stringify(result, null, 2)); process.exitCode = result.passed ? 0 : 2;
}
