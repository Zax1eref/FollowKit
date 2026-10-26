import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {checkIsolation} from './live-isolation.mjs';
const app = 'https://followkit.hakimihaika219.workers.dev';
const db = 'https://kfnputowvfxozdiuhpzo.supabase.co';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function checkQuoteIsolation(tokens, {fetcher = fetch, disposableAccounts = false} = {}) {
  const checks = [], created = [], cleanup = [];
  const marker = 'FK-QUOTE-TEST-' + randomUUID();
  const day = new Date().toISOString().slice(0, 10);
  let stage = 'confirmation', key, ambiguousCreate = false, failed = false, preflightFailure;
  const verify = (name, ok) => {checks.push({name, passed: Boolean(ok)}); if (!ok) throw Error();};
  async function request(base, path, index, method = 'GET', body, extra = {}) {
    const response = await fetcher(base + path, {method, redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(10000),
      headers: {'User-Agent': 'FollowKit-Quote-Isolation/1.0', Authorization: 'Bearer ' + tokens[index],
        'Content-Type': 'application/json', ...(base === db ? {apikey: key} : {}), ...extra},
      ...(body === undefined ? {} : {body: JSON.stringify(body)})});
    if (response.status >= 300 && response.status < 400) throw Error();
    const reader = response.body?.getReader(); const chunks = []; let size = 0;
    if (reader) {try {while (true) {const {value, done} = await reader.read(); if (done) break;
      size += value.byteLength; if (size > 262144) {await reader.cancel(); throw Error();} chunks.push(value);
    }} finally {reader.releaseLock();}}
    return {status: response.status, data: size ? JSON.parse(Buffer.concat(chunks).toString()) : null};
  }
  async function snapshot(item) {
    const quote = await request(app, '/api/quotes/' + item.quote, item.index);
    const history = await request(app, '/api/quotes/' + item.quote + '/followups', item.index);
    if (quote.status !== 200 || history.status !== 200 || !Array.isArray(history.data?.items)) throw Error();
    return {quote: quote.data, history: history.data.items};
  }
  try {
    if (!disposableAccounts) throw Error();
    stage = 'read_preflight';
    const preflight = await checkIsolation(tokens, {fetcher});
    if (!preflight.passed) preflightFailure = preflight;
    verify('read_preflight', preflight.passed);
    const config = await request(app, '/auth/config', 0);
    verify('configuration', config.status === 200 && config.data.url === db && config.data.appOrigin === app && /^sb_publishable_[\w-]+$/.test(config.data.publishableKey));
    key = config.data.publishableKey;
    for (const index of [0, 1]) {
      stage = `create_${index + 1}`;
      const account = await request(app, '/api/account', index);
      verify(stage + '_owner', account.status === 200 && uuid.test(account.data.id));
      ambiguousCreate = true;
      const customer = await request(app, '/api/customers', index, 'POST', {name: marker, contact: marker});
      verify(stage + '_customer', customer.status === 201 && uuid.test(customer.data?.id) && customer.data.account_id === account.data.id && customer.data.name === marker && customer.data.contact === marker);
      const item = {index, customer: customer.data.id, owner: account.data.id}; created.push(item);
      ambiguousCreate = false;
      ambiguousCreate = true;
      const quote = await request(app, '/api/quotes', index, 'POST', {customer_id: item.customer, title: marker, amount_satang: 1, sent_on: day, due_on: day, status: 'pending'}, {'Idempotency-Key': randomUUID()});
      // Explicit quota rejection is a known non-create; timeout/malformed response is uncertain.
      if (quote.status === 409 && quote.data?.error?.code === 'plan_limit') ambiguousCreate = false;
      verify(stage + '_quote', quote.status === 201 && uuid.test(quote.data?.id) && quote.data.account_id === item.owner && quote.data.customer_id === item.customer && quote.data.title === marker);
      item.quote = quote.data.id; ambiguousCreate = false;
      const ownPatch = await request(app, '/api/quotes/' + item.quote, index, 'PATCH', {amount_satang: 2});
      verify(stage + '_own_patch', ownPatch.status === 200 && ownPatch.data.amount_satang === 2);
      const ownFollow = await request(app, '/api/quotes/' + item.quote + '/followups', index, 'POST', {note: marker, next_due: day, idempotency_key: randomUUID()});
      verify(stage + '_own_followup', ownFollow.status === 201 && ownFollow.data.account_id === item.owner && ownFollow.data.quote_id === item.quote && uuid.test(ownFollow.data.id));
      item.followup = ownFollow.data.id;
      item.baseline = await snapshot(item);
      verify(stage + '_snapshot', item.baseline.quote.id === item.quote && item.baseline.quote.account_id === item.owner && item.baseline.history.length === 1 && item.baseline.history[0].id === item.followup);
    }
    for (const item of created) {
      stage = `account_${item.index + 1}`;
      const path = '/api/quotes/' + item.quote;
      const foreign = 1 - item.index;
      const probes = [
        ['worker_patch', app, path, 'PATCH', {amount_satang: 3}, 404],
        ['worker_delete', app, path, 'DELETE', undefined, 404],
        ['worker_followup', app, path + '/followups', 'POST', {note: marker + '-foreign', next_due: day, idempotency_key: randomUUID()}, 404],
        ['rpc_patch', db, '/rest/v1/rpc/fk_patch_quote', 'POST', {p_id: item.quote, p_patch: {amount_satang: 3}}, 400],
        ['rpc_delete', db, '/rest/v1/rpc/fk_delete_quote', 'POST', {p_id: item.quote}, 400],
        ['rpc_followup', db, '/rest/v1/rpc/fk_followup', 'POST', {p_quote_id: item.quote, p_key: randomUUID(), p_note: marker + '-foreign', p_next_due: day}, 400],
        ['table_quote_patch', db, '/rest/v1/fk_quotes?id=eq.' + item.quote, 'PATCH', {amount_satang: 3}, 403],
        ['table_quote_delete', db, '/rest/v1/fk_quotes?id=eq.' + item.quote, 'DELETE', undefined, 403],
        ['table_followup_insert', db, '/rest/v1/fk_followups', 'POST', {account_id: created[foreign].owner, quote_id: item.quote, note: marker + '-foreign', next_due: day, request_key: randomUUID()}, 403],
        ['table_followup_patch', db, '/rest/v1/fk_followups?id=eq.' + item.followup, 'PATCH', {note: marker + '-foreign'}, 403],
        ['table_followup_delete', db, '/rest/v1/fk_followups?id=eq.' + item.followup, 'DELETE', undefined, 403]
      ];
      for (const [label, base, route, method, body, status] of probes) {
        const result = await request(base, route, foreign, method, body);
        verify(stage + '_' + label + '_denied', result.status === status &&
          (label.startsWith('rpc') ? result.data?.message === 'not_found' : label.startsWith('table') ? result.data?.code === '42501' : result.data?.error?.code === 'not_found'));
        const retained = await snapshot(item);
        verify(stage + '_' + label + '_unchanged', JSON.stringify(retained) === JSON.stringify(item.baseline));
      }
    }
  } catch {failed = true;}
  finally {
    for (const item of created) {
      let quoteRemoved = !item.quote, historyRemoved = !item.quote, customerRemoved = false;
      try {
        if (item.quote) {
          const path = '/api/quotes/' + item.quote;
          const current = await request(app, path, item.index);
          if (current.status === 404) quoteRemoved = true;
          else if (current.status === 200 && current.data.id === item.quote && current.data.account_id === item.owner && current.data.customer_id === item.customer && current.data.title === marker) {
            const deletion = await request(app, path, item.index, 'DELETE');
            const after = await request(app, path, item.index);
            quoteRemoved = deletion.status === 204 && after.status === 404;
          }
          const history = await request(db, '/rest/v1/fk_followups?' + new URLSearchParams({select: 'id', quote_id: 'eq.' + item.quote, limit: '1'}), item.index);
          historyRemoved = history.status === 200 && Array.isArray(history.data) && history.data.length === 0;
        }
        if (quoteRemoved && historyRemoved && !ambiguousCreate) {
          const path = '/api/customers/' + item.customer;
          const current = await request(app, path, item.index);
          if (current.status === 200 && current.data.id === item.customer && current.data.account_id === item.owner && current.data.name === marker && current.data.contact === marker) {
            const deletion = await request(app, path, item.index, 'DELETE');
            const after = await request(app, path, item.index);
            customerRemoved = deletion.status === 204 && after.status === 404;
          } else if (current.status === 404) customerRemoved = true;
        }
      } catch { /* Sanitized result below. */ }
      cleanup.push({account: item.index + 1, quoteRemoved, historyRemoved, customerRemoved});
    }
  }
  const cleanupComplete = !ambiguousCreate && cleanup.every(x => x.quoteRemoved && x.historyRemoved && x.customerRemoved);
  return {passed: !failed && cleanupComplete, scope: 'disposable_quote_followup_write_isolation',
    ...(failed ? {stoppedAt: stage} : {}), ...(preflightFailure ? {preflightFailure} : {}), checks, cleanup, cleanupComplete,
    retainedMetadata: 'Quote creation idempotency records remain in the private database table; this runner does not purge them.',
    ...(!cleanupComplete ? {manualCleanupMarker: marker} : {})};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const tokens = [process.env.FOLLOWKIT_TEST_TOKEN_A, process.env.FOLLOWKIT_TEST_TOKEN_B];
  delete process.env.FOLLOWKIT_TEST_TOKEN_A; delete process.env.FOLLOWKIT_TEST_TOKEN_B;
  const result = await checkQuoteIsolation(tokens, {disposableAccounts: process.argv.includes('--disposable-test-accounts')});
  console.log(JSON.stringify(result, null, 2)); process.exitCode = result.passed ? 0 : 2;
}
