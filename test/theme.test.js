import { test } from 'node:test';
import assert from 'node:assert/strict';
import { themeFor, TYPE_COLORS } from '../public/shared/theme.js';
import { effectiveness, teamWeaknesses } from '../public/shared/typechart.js';

test('theme: most common type wins, lead breaks ties', () => {
  const t = themeFor([{ types: ['water', 'fairy'] }, { types: ['ground', 'steel'] }, { types: ['water'] }]);
  assert.equal(t.primary, 'water');
  assert.equal(t.secondary, 'fairy');
  assert.equal(t.vars['--accent'], TYPE_COLORS.water);
});

test('theme: empty team gives neutral theme', () => {
  assert.equal(themeFor([]).primary, null);
});

test('GO multipliers: 1.6 / 0.625 / 0.390625, dual types multiply', () => {
  assert.equal(effectiveness('electric', ['water']), 1.6);
  assert.equal(effectiveness('electric', ['ground']), 0.390625);
  assert.equal(effectiveness('ice', ['ground', 'flying']), 1.6 * 1.6);
  assert.equal(effectiveness('fire', ['water', 'rock']), 0.625 * 0.625);
});

test('teamWeaknesses: types hitting 2+ members super-effectively and resisted by none', () => {
  const w = teamWeaknesses([['water', 'fairy'], ['grass', 'poison'], ['water', 'ground']]);
  const grass = w.find((x) => x.type === 'grass');
  assert.ok(!grass || grass.weak < 2 || grass.resisted > 0);
  const poison = w.find((x) => x.type === 'poison');
  assert.equal(poison, undefined); // only azumarill weak, others neutral/resist
  const elec = teamWeaknesses([['water'], ['water', 'flying'], ['flying']]).find((x) => x.type === 'electric');
  assert.equal(elec.weak, 3);
  assert.equal(elec.resisted, 0);
});
