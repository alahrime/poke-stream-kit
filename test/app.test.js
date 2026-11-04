import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { createApp } from '../src/server/app.js';

let app, base, port;
const TOKEN = 'test-token-123456';

before(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'psk-app-'));
  mkdirSync(join(dir, 'config')); mkdirSync(join(dir, 'data'));
  writeFileSync(join(dir, 'config', 'teams.json'), JSON.stringify({ teams: [] }));
  app = await createApp({ configDir: join(dir, 'config'), dataDir: join(dir, 'data'), overrides: { port: 0, controlToken: TOKEN, spotify: { clientId: '' } }, fetchImpl: async () => { throw new Error('offline'); } });
  port = app.server.address().port;
  app.cfg.port = port; // allowed Host list follows the real port
  base = `http://127.0.0.1:${port}`;
});
after(() => app.close());

const post = (path, body, headers = {}) => fetch(base + path, {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-control-token': TOKEN, ...headers }, body: JSON.stringify(body),
});

test('POST /api/op applies commands and returns view', async () => {
  const r = await post('/api/op', { op: 'record.win' });
  assert.equal(r.status, 200);
  const v = await r.json();
  assert.equal(v.record.wins, 1);
  const bad = await post('/api/op', { op: 'record.set', wins: 9, losses: 0 });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).code, 'INVALID');
});

test('CSRF: text/plain and foreign origin rejected, missing token rejected', async () => {
  const r1 = await fetch(base + '/api/op', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{"op":"record.win"}' });
  assert.equal(r1.status, 415);
  const r2 = await post('/api/op', { op: 'record.win' }, { origin: 'https://evil.example' });
  assert.equal(r2.status, 403);
  const r3 = await post('/api/op', { op: 'record.win' }, { 'x-control-token': '' });
  assert.equal(r3.status, 401);
});

test('SSE sends snapshot of state on connect', async () => {
  const text = await new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/events' }, (res) => {
      assert.equal(res.headers['content-type'], 'text/event-stream');
      let buf = '';
      res.on('data', (c) => { buf += c; if (buf.includes('event: state') && buf.includes('event: spotify')) { req.destroy(); resolve(buf); } });
    });
    req.on('error', (e) => (e.code === 'ECONNRESET' ? null : reject(e)));
  });
  assert.match(text, /retry: \d+/);
  assert.match(text, /event: state\ndata: \{/);
  assert.match(text, /event: spotify/);
});

test('team presets save/list/delete with validation', async () => {
  assert.equal((await post('/api/teams/save', { name: 'GL core', members: [{ id: 184 }, { id: 10180, shadow: true }] })).status, 200);
  assert.equal((await post('/api/teams/save', { name: 'bad', members: [{ id: 999999 }] })).status, 400);
  const list = await (await fetch(base + '/api/teams')).json();
  assert.equal(list.teams[0].name, 'GL core');
  assert.equal((await post('/api/teams/delete', { name: 'GL core' })).status, 200);
  assert.equal((await (await fetch(base + '/api/teams')).json()).teams.length, 0);
});

test('hotkey GET works with token, rejects without', async () => {
  assert.equal((await fetch(`${base}/api/hotkey?op=record.loss&token=nope`)).status, 401);
  assert.equal((await fetch(`${base}/api/hotkey?op=team.set&token=${TOKEN}`)).status, 400);
  assert.equal((await fetch(`${base}/api/hotkey?op=undo&token=${TOKEN}`)).status, 200);
});

test('overlays, control and static served no-store; traversal blocked', async () => {
  const r = await fetch(base + '/overlay/record');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal((await fetch(base + '/overlay/..%2F..%2Fpackage')).status, 404);
  assert.equal((await fetch(base + '/shared/../../package.json')).status, 404);
  assert.equal((await fetch(base + '/control/')).status, 200);
});

test('sprite route falls back to placeholder when offline', async () => {
  const r = await fetch(base + '/sprite/184');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /image\/svg\+xml/);
  assert.equal((await fetch(base + '/sprite/abc')).status, 404);
});

test('analysis endpoint drops stale team hashes', async () => {
  await post('/api/op', { op: 'team.set', members: [{ id: 184 }] });
  assert.equal((await post('/api/analysis', { teamHash: 'stale', weaknesses: [] })).status, 409);
  assert.equal((await post('/api/analysis', { teamHash: '184', weaknesses: [{ type: 'grass' }] })).status, 200);
});

test('league.set via op and hotkey; view carries league and member slug', async () => {
  const r = await post('/api/op', { op: 'league.set', league: 'ultra' });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).league, 'ultra');
  assert.equal((await post('/api/op', { op: 'league.set', league: 'little' })).status, 400);
  assert.equal((await fetch(`${base}/api/hotkey?op=league.set&league=master&token=${TOKEN}`)).status, 200);
  assert.equal((await fetch(`${base}/api/hotkey?op=league.set&league=nope&token=${TOKEN}`)).status, 400);
  const v = await (await post('/api/op', { op: 'team.set', members: [{ id: 10180 }] })).json();
  assert.equal(v.league, 'master');
  assert.equal(v.team.view[0].slug, 'stunfisk-galar');
});

test('analysis endpoint rejects a league that is not current', async () => {
  await post('/api/op', { op: 'team.set', members: [{ id: 184 }] });
  await post('/api/op', { op: 'league.set', league: 'great' });
  assert.equal((await post('/api/analysis', { teamHash: '184', league: 'ultra', winRate: 0.5 })).status, 409);
  assert.equal((await post('/api/analysis', { teamHash: '184', league: 'great', winRate: 0.5 })).status, 200);
});
