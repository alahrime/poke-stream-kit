import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { searchDex } from '../public/shared/search.js';

const dex = JSON.parse(readFileSync(new URL('../public/shared/dex.json', import.meta.url)));

test('prefix search ranks base form first', () => {
  assert.equal(searchDex(dex, 'azu')[0].n, 'azumarill');
  assert.equal(searchDex(dex, 'Medicham')[0].n, 'medicham');
});

test('regional forms reachable by either word order', () => {
  assert.equal(searchDex(dex, 'galarian stun')[0].n, 'stunfisk-galar');
  assert.equal(searchDex(dex, 'stunfisk gal')[0].n, 'stunfisk-galar');
});

test('dex number search and limits', () => {
  assert.equal(searchDex(dex, '#184')[0].n, 'azumarill');
  assert.equal(searchDex(dex, '').length, 0);
  assert.ok(searchDex(dex, 'a', 8).length <= 8);
});
