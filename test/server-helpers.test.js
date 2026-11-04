import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildView } from '../src/server/view.js';
import { loadJson, saveJsonAtomic } from '../src/server/persist.js';
import { pkcePair, parsePlayback } from '../src/integrations/spotify.js';
import { initialState } from '../src/server/store.js';

const dex = new Map([[184, { i: 184, n: 'azumarill', d: 'Azumarill', s: 184, t: ['water', 'fairy'] }]]);

test('buildView enriches team, theme, weaknesses, elo delta', () => {
  const s = initialState();
  s.team.members = [{ id: 184, shadow: true }];
  s.elo.current = 2550; s.session = { active: true, startElo: 2500, startedAt: 1 };
  const v = buildView(s, dex);
  assert.deepEqual(v.team.view[0], { id: 184, name: 'Azumarill', types: ['water', 'fairy'], shadow: true, sprite: '/sprite/184' });
  assert.equal(v.theme.primary, 'water');
  assert.equal(v.elo.delta, 50);
  assert.ok(Array.isArray(v.weaknesses));
  assert.equal(v.teamHash, '184s');
});

test('loadJson backs up corrupt files and returns fallback', () => {
  const dir = mkdtempSync(join(tmpdir(), 'psk-'));
  const f = join(dir, 'state.json');
  writeFileSync(f, '{oops');
  assert.deepEqual(loadJson(f, { ok: 1 }), { ok: 1 });
  assert.ok(readdirSync(dir).some((n) => n.startsWith('state.json.corrupt-')));
  saveJsonAtomic(f, { a: 1 });
  assert.deepEqual(JSON.parse(readFileSync(f, 'utf8')), { a: 1 });
  assert.deepEqual(loadJson(join(dir, 'missing.json'), 7), 7);
});

test('PKCE pair: verifier 43-128 chars, challenge is base64url sha256', async () => {
  const { verifier, challenge } = pkcePair();
  assert.match(verifier, /^[A-Za-z0-9_-]{43,128}$/);
  const { createHash } = await import('node:crypto');
  assert.equal(challenge, createHash('sha256').update(verifier).digest('base64url'));
});

test('parsePlayback maps tracks, hides ads/episodes/nulls', () => {
  const t = parsePlayback({
    is_playing: true, progress_ms: 1000, currently_playing_type: 'track',
    item: { name: 'Song', duration_ms: 5000, artists: [{ name: 'A' }, { name: 'B' }],
      album: { name: 'Alb', images: [{ url: 'big', width: 640 }, { url: 'small', width: 64 }, { url: 'mid', width: 300 }] },
      external_urls: { spotify: 'u' } },
  });
  assert.equal(t.status, 'playing');
  assert.equal(t.track.artists, 'A, B');
  assert.equal(t.track.art, 'mid');
  assert.equal(parsePlayback(null).status, 'idle');
  assert.equal(parsePlayback({ is_playing: true, currently_playing_type: 'ad', item: null }).status, 'idle');
  assert.equal(parsePlayback({ is_playing: false, progress_ms: 1, currently_playing_type: 'track', item: { name: 'x', duration_ms: 2, artists: [], album: { images: [] } } }).status, 'paused');
});
