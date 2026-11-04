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

// ---- league + rich analysis (paragon2 battle sim / matrix) ----
const TEAM = [
  { id: 10180, name: 'Galarian Stunfisk', slug: 'stunfisk-galar', types: ['ground', 'steel'], shadow: false, sprite: '/sprite/10180' },
  { id: 184, name: 'Azumarill', slug: 'azumarill', types: ['water', 'fairy'], shadow: false, sprite: '/sprite/184' },
];
const SLUGS = { medicham: 308, 'stunfisk-galar': 10180 };
const mkRich = (fetchImpl = async () => ({ ok: false })) => {
  const published = [];
  const p = new Paragon2({ cfg: { paragon2: { url: 'http://x/team', timeoutMs: 50 } }, publish: (d) => published.push(d), fetchImpl, resolveSlug: (s) => SLUGS[s] ?? null });
  return { p, published };
};
const ratings = (n) => Array.from({ length: n }, () => [[400, 520, 610]]);

test('payload carries league and PokeAPI slug; no sprite leaks', async () => {
  let body;
  const { p } = mkRich(async (_u, o) => { body = JSON.parse(o.body); return { ok: false }; });
  await p.onTeamChange('10180.184', TEAM, 'ultra');
  assert.equal(body.league, 'ultra');
  assert.deepEqual(body.members[0], { id: 10180, name: 'Galarian Stunfisk', slug: 'stunfisk-galar', types: ['ground', 'steel'], shadow: false });
});

test('reply without weaknesses but with threats/matrix/winRate is published, slugs resolve to sprite ids', async () => {
  const reply = {
    teamHash: 'h', league: 'great', winRate: 0.62,
    threats: [{ name: 'Medicham', slug: 'medicham', shadow: true, beatShare: 0.4, rating: 380 }, { name: 'Mystery', slug: 'not-in-dex' }],
    matrix: { foes: [{ name: 'Medicham', slug: 'medicham' }], ratings: [[[300, 420, 499.6]], [[700, 650, 600]]] },
  };
  const { p, published } = mkRich(async () => ({ ok: true, json: async () => reply }));
  await p.onTeamChange('h', TEAM, 'great');
  const a = published.at(-1);
  assert.equal(a.league, 'great');
  assert.equal(a.winRate, 0.62);
  assert.deepEqual(a.threats[0], { name: 'Medicham', shadow: true, id: 308, beatShare: 0.4, rating: 380 });
  assert.deepEqual(a.threats[1], { name: 'Mystery', shadow: false });
  assert.deepEqual(a.matrix.foes, [{ name: 'Medicham', shadow: false, id: 308 }]);
  assert.deepEqual(a.matrix.ratings[0][0], [300, 420, 500], 'ratings rounded');
  assert.equal(a.weaknesses, undefined);
});

test('league mismatch is stale; omitted league is accepted (v1 contract)', () => {
  const { p } = mkRich();
  Object.assign(p, { teamHash: 'h', league: 'great', size: 2 });
  assert.equal(p.accept({ teamHash: 'h', league: 'ultra', winRate: 0.5 }), false);
  assert.equal(p.accept({ teamHash: 'h', league: 'great', winRate: 0.5 }), true);
  assert.equal(p.accept({ teamHash: 'h', weaknesses: [{ type: 'ice' }] }), true);
});

test('rich fields are validated', () => {
  const { p } = mkRich();
  Object.assign(p, { teamHash: 'h', league: 'great', size: 2 });
  const bad = [
    {}, // nothing to show
    { winRate: 1.5 },
    { threats: 'x' },
    { threats: Array.from({ length: 9 }, () => ({ name: 'A' })) },
    { threats: [{ name: '' }] },
    { threats: [{ name: 'A', slug: '../x' }] },
    { threats: [{ name: 'A', rating: 1001 }] },
    { threats: [{ name: 'A', beatShare: -0.1 }] },
    { matrix: { foes: [{ name: 'A' }], ratings: ratings(1) } }, // 1 row for a 2-member team
    { matrix: { foes: [{ name: 'A' }], ratings: [[[1, 2]], [[1, 2, 3]]] } }, // cell needs 3 shield scenarios
    { matrix: { foes: [], ratings: [[], []] } },
    { matrix: { foes: [{ name: 'A' }], ratings: [[[1, 2, NaN]], [[1, 2, 3]]] } },
  ];
  for (const b of bad) assert.equal(p.accept({ teamHash: 'h', ...b }), false, JSON.stringify(b));
  assert.equal(p.accept({ teamHash: 'h', matrix: { foes: [{ name: 'A' }], ratings: ratings(2) } }), true);
});

test('later POSTs merge into the analysis for the same team+league', () => {
  const { p, published } = mkRich();
  Object.assign(p, { teamHash: 'h', league: 'great', size: 2 });
  p.accept({ teamHash: 'h', weaknesses: [{ type: 'fighting', severity: 2 }], matrix: { foes: [{ name: 'A' }], ratings: ratings(2) } });
  p.accept({ teamHash: 'h', league: 'great', winRate: 0.55, threats: [{ name: 'B' }], notes: 'slow sim done' });
  const a = published.at(-1);
  assert.deepEqual(a.weaknesses, [{ type: 'fighting', severity: 2 }]);
  assert.equal(a.matrix.foes[0].name, 'A');
  assert.equal(a.winRate, 0.55);
  assert.equal(a.notes, 'slow sim done');
});

test('a reply that arrives after the league switched is dropped', async () => {
  let release;
  const { p, published } = mkRich(() => new Promise((r) => { release = () => r({ ok: true, json: async () => ({ teamHash: 'h', winRate: 0.9 }) }); }));
  const slow = p.onTeamChange('h', TEAM, 'great');
  await new Promise((r) => setImmediate(r));
  const fire = release;
  p.fetch = async () => ({ ok: false });
  await p.onTeamChange('h', TEAM, 'ultra');
  fire();
  await slow;
  assert.ok(published.every((a) => a?.winRate !== 0.9));
});
