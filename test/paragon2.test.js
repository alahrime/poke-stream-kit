import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Paragon2 } from '../src/integrations/paragon2.js';

const mk = (fetchImpl, url = 'http://127.0.0.1:9000/team') => {
  const published = [];
  const p = new Paragon2({ cfg: { paragon2: { url, timeoutMs: 50 } }, publish: (d) => published.push(d), fetchImpl });
  return { p, published };
};

test('team change clears analysis and posts team; reply with matching hash is published', async () => {
  let body;
  const { p, published } = mk(async (_u, o) => { body = JSON.parse(o.body); return { ok: true, json: async () => ({ teamHash: 'h1', weaknesses: [{ type: 'steel', severity: 2 }], notes: 'n' }) }; });
  await p.onTeamChange('h1', [{ id: 184, name: 'Azumarill', types: ['water', 'fairy'], shadow: false }]);
  assert.equal(body.teamHash, 'h1');
  assert.equal(published[0], null);
  assert.deepEqual(published[1].weaknesses, [{ type: 'steel', severity: 2 }]);
  assert.equal(published[1].source, 'paragon2');
});

test('stale or malformed analysis is rejected', () => {
  const { p } = mk(async () => ({ ok: true, json: async () => ({}) }), '');
  p.teamHash = 'h2';
  assert.equal(p.accept({ teamHash: 'old', weaknesses: [] }), false);
  assert.equal(p.accept({ teamHash: 'h2', weaknesses: [{ type: 'notatype' }] }), false);
  assert.equal(p.accept({ teamHash: 'h2', weaknesses: 'x' }), false);
  assert.equal(p.accept({ teamHash: 'h2', weaknesses: [{ type: 'ice' }], notes: 'ok' }), true);
});

test('webhook failure or timeout does not throw', async () => {
  const { p } = mk(() => new Promise(() => {}));
  const t0 = Date.now();
  await p.onTeamChange('h3', [{ id: 1, name: 'x', types: ['grass'], shadow: false }]);
  assert.ok(Date.now() - t0 < 1000, 'returned after timeout');
  const { p: p2 } = mk(async () => { throw new Error('down'); });
  await p2.onTeamChange('h4', [{ id: 1, name: 'x', types: ['grass'], shadow: false }]);
});
