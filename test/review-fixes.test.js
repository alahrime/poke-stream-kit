import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, unlinkSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { debouncedSaver } from '../src/server/persist.js';
import { Sprites } from '../src/server/sprites.js';
import { Spotify } from '../src/integrations/spotify.js';
import { Bus } from '../src/server/bus.js';

const tmp = () => mkdtempSync(join(tmpdir(), 'psk-fix-'));
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20), Buffer.from('IEND'), Buffer.alloc(4)]);

test('A1: failed debounced write does not throw and retries later', async () => {
  const dir = tmp();
  const blocker = join(dir, 'blocker');
  writeFileSync(blocker, 'x'); // parent path is a file -> write fails
  const save = debouncedSaver(join(blocker, 'state.json'), 10, 30);
  save({ a: 1 });
  assert.doesNotThrow(() => save.flush());
  unlinkSync(blocker); mkdirSync(blocker);
  await new Promise((r) => setTimeout(r, 120));
  assert.deepEqual(JSON.parse(readFileSync(join(blocker, 'state.json'), 'utf8')), { a: 1 });
});

test('A2: truncated cached sprite is re-downloaded, not served', async () => {
  const dir = tmp();
  mkdirSync(join(dir, 'sprite-cache'));
  writeFileSync(join(dir, 'sprite-cache', 'home-184.png'), PNG.subarray(0, 10));
  let fetched = 0;
  const s = new Sprites({ dataDir: dir, dex: new Map(), cfg: { sprites: { style: 'home' } }, fetchImpl: async () => { fetched++; return { ok: true, arrayBuffer: async () => PNG }; } });
  const r = await s.get(184);
  assert.equal(fetched, 1);
  assert.equal(r.body.length, PNG.length);
});

function mkSpotify(tokenHandler) {
  const calls = { token: 0 };
  const secrets = { spotify: { refreshToken: 'r1' } };
  const fetchImpl = async (url, opts) => {
    if (url.includes('/api/token')) { calls.token++; await new Promise((r) => setTimeout(r, 20)); return tokenHandler(opts); }
    return { status: 204, ok: true, headers: new Headers() };
  };
  const sp = new Spotify({ cfg: { port: 7878, spotify: { clientId: 'c', pollMs: 5000 } }, secrets, saveSecrets: () => {}, publish: () => {}, hasListeners: () => true, fetchImpl });
  return { sp, calls, secrets };
}

test('A3: concurrent ticks share one token refresh', async () => {
  const { sp, calls } = mkSpotify(() => ({ ok: true, json: async () => ({ access_token: 'a', expires_in: 3600, refresh_token: 'r2' }) }));
  await Promise.all([sp.tick(), sp.tick(), sp.token()]);
  sp.stop();
  assert.equal(calls.token, 1);
});

test('A4: invalid_grant on authorization_code exchange keeps existing login', async () => {
  const { sp, secrets } = mkSpotify(() => ({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) }));
  sp.pending.set('st', { verifier: 'v', exp: Date.now() + 1e5 });
  await assert.rejects(sp.handleCallback({ code: 'old', state: 'st' }));
  sp.stop();
  assert.equal(secrets.spotify?.refreshToken, 'r1');
});

test('A6: bus counts overlay connections only (control panels do not trigger Spotify polling)', () => {
  const bus = new Bus();
  const fakeRes = () => ({ writeHead() {}, write() {}, end() {} });
  const fakeReq = (url) => ({ url, on() {} });
  bus.attach(fakeReq('/events?role=control'), fakeRes());
  assert.equal(bus.overlayCount, 0);
  bus.attach(fakeReq('/events'), fakeRes());
  assert.equal(bus.overlayCount, 1);
  bus.close();
});

test('B3: pending Spotify logins are capped (hostile pages cannot grow memory)', () => {
  const { sp } = mkSpotify(() => ({}));
  for (let i = 0; i < 100; i++) sp.loginUrl();
  sp.stop();
  assert.ok(sp.pending.size <= 20);
});

test('B2: every color-mix() in overlay.css has a plain fallback declaration first (older OBS CEF)', () => {
  const css = readFileSync(new URL('../public/shared/overlay.css', import.meta.url), 'utf8');
  const decls = css.replace(/\/\*[\s\S]*?\*\//g, '').split(/[;{}]/).map((d) => d.trim());
  decls.forEach((d, i) => {
    if (!d.includes('color-mix(')) return;
    const prop = d.split(':')[0];
    assert.ok(decls[i - 1]?.startsWith(prop + ':') && !decls[i - 1].includes('color-mix('), `no fallback before: ${d.slice(0, 60)}`);
  });
});
