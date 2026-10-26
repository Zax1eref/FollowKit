import {test} from 'node:test';
import assert from 'node:assert/strict';
import {localAdminUrl} from './config.mjs';

test('accept disposable admin URLs only on loopback', () => {
  for (const host of ['127.0.0.1', 'localhost', '[::1]']) {
    const raw = `postgresql://tester:fixture@${host}:5432/postgres`;
    assert.equal(localAdminUrl(raw), raw);
  }
});
test('reject remote hosts, other databases and connection option overrides', () => {
  for (const raw of [
    'postgres://tester:fixture@db.example/postgres',
    'postgres://tester:fixture@127.0.0.1/app',
    'postgres://tester:fixture@127.0.0.1/postgres?host=db.example',
    'postgres://tester:fixture@127.0.0.1/postgres#fragment',
    'https://127.0.0.1/postgres',
    'postgres://127.0.0.1.example/postgres',
  ]) assert.throws(() => localAdminUrl(raw), /Only loopback/);
});
test('malformed and missing values fail without echoing secrets', () => {
  for (const raw of [undefined, '', 'postgres://tester:DO_NOT_LOG@[invalid/postgres']) {
    assert.throws(() => localAdminUrl(raw), error => {
      assert.doesNotMatch(error.stack, /DO_NOT_LOG/);
      return true;
    });
  }
});
