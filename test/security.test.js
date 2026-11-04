import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRequest, checkHotkey, validateConfig } from '../src/server/security.js';

const cfg = { port: 7878, host: '127.0.0.1', allowedHosts: [], controlToken: '' };
const req = (method, headers) => ({ method, headers: { host: '127.0.0.1:7878', ...headers } });
const json = { 'content-type': 'application/json' };

test('GET from allowed host passes; unknown Host (DNS rebinding) rejected', () => {
  assert.equal(checkRequest(req('GET', {}), cfg), null);
  assert.equal(checkRequest(req('GET', { host: 'localhost:7878' }), cfg), null);
  assert.equal(checkRequest(req('GET', { host: 'evil.com:7878' }), cfg).status, 403);
});

test('POST requires JSON content-type (blocks simple-form CSRF)', () => {
  assert.equal(checkRequest(req('POST', { 'content-type': 'text/plain' }), cfg).status, 415);
  assert.equal(checkRequest(req('POST', json), cfg), null);
});

test('POST with foreign Origin rejected; same-origin accepted', () => {
  assert.equal(checkRequest(req('POST', { ...json, origin: 'https://evil.com' }), cfg).status, 403);
  assert.equal(checkRequest(req('POST', { ...json, origin: 'null' }), cfg).status, 403);
  assert.equal(checkRequest(req('POST', { ...json, origin: 'http://127.0.0.1:7878' }), cfg), null);
});

test('controlToken enforced on POST when configured', () => {
  const c = { ...cfg, controlToken: 's3cret-token' };
  assert.equal(checkRequest(req('POST', json), c).status, 401);
  assert.equal(checkRequest(req('POST', { ...json, 'x-control-token': 'wrong' }), c).status, 401);
  assert.equal(checkRequest(req('POST', { ...json, 'x-control-token': 's3cret-token' }), c), null);
});

test('hotkey GET needs a configured, matching token', () => {
  assert.equal(checkHotkey('anything', cfg).status, 403);
  const c = { ...cfg, controlToken: 's3cret-token' };
  assert.equal(checkHotkey('nope', c).status, 401);
  assert.equal(checkHotkey('s3cret-token', c), null);
});

test('LAN binding without token refuses to start', () => {
  assert.throws(() => validateConfig({ ...cfg, host: '0.0.0.0' }), /controlToken/);
  assert.throws(() => validateConfig({ ...cfg, host: '0.0.0.0', controlToken: 'short' }), /controlToken/);
  assert.doesNotThrow(() => validateConfig({ ...cfg, host: '0.0.0.0', controlToken: 'long-enough-token' }));
  assert.doesNotThrow(() => validateConfig(cfg));
});

test('LAN allowedHosts are honored', () => {
  const c = { ...cfg, host: '0.0.0.0', controlToken: 'long-enough-token', allowedHosts: ['192.168.1.20:7878'] };
  assert.equal(checkRequest(req('GET', { host: '192.168.1.20:7878' }), c), null);
});
