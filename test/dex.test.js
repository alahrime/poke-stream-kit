import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dex = JSON.parse(readFileSync(new URL('../public/shared/dex.json', import.meta.url)));
const by = (n) => dex.find((p) => p.n === n);

test('dex has forms keyed by pokemon id with types', () => {
  assert.ok(dex.length > 1000);
  assert.deepEqual(by('stunfisk-galar').t, ['ground', 'steel']);
  assert.equal(by('stunfisk-galar').d, 'Galarian Stunfisk');
  assert.equal(by('stunfisk-galar').s, 618);
  assert.ok(by('stunfisk-galar').i > 10000);
  assert.deepEqual(by('azumarill').t, ['water', 'fairy']);
  assert.equal(by('azumarill').d, 'Azumarill');
});

test('dex excludes non-GO forms', () => {
  assert.equal(dex.find((p) => p.n.includes('-totem')), undefined);
  assert.equal(dex.find((p) => p.n.endsWith('-gmax')), undefined);
});
