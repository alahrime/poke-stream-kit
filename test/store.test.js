import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, applyOp, migrate, teamHash, Store } from '../src/server/store.js';

const dexIds = new Set([184, 10180, 1]);
const ctx = { hasPokemon: (id) => dexIds.has(id), now: () => 1000 };
const run = (ops, s = initialState()) => ops.reduce((st, op) => applyOp(st, op, ctx), s);

test('record: win/loss increment and rev bumps', () => {
  const s = run([{ op: 'record.win' }, { op: 'record.loss' }, { op: 'record.win' }]);
  assert.deepEqual([s.record.wins, s.record.losses], [2, 1]);
  assert.equal(s.rev, 3);
});

test('record: blocked once wins+losses = 5', () => {
  const s = run([{ op: 'record.set', wins: 3, losses: 2 }]);
  assert.throws(() => applyOp(s, { op: 'record.win' }, ctx), { code: 'SET_FULL' });
  assert.throws(() => applyOp(s, { op: 'record.loss' }, ctx), { code: 'SET_FULL' });
});

test('record.set validates integers 0-5 summing to <= 5', () => {
  for (const bad of [{ wins: 6, losses: 0 }, { wins: -1, losses: 0 }, { wins: 1.5, losses: 0 }, { wins: 3, losses: 3 }, { wins: '2', losses: 1 }]) {
    assert.throws(() => run([{ op: 'record.set', ...bad }]), { code: 'INVALID' });
  }
});

test('record.endSet archives non-empty set and resets', () => {
  const s = run([{ op: 'record.set', wins: 4, losses: 1 }, { op: 'record.endSet' }]);
  assert.deepEqual([s.record.wins, s.record.losses], [0, 0]);
  assert.deepEqual(s.record.history, [{ wins: 4, losses: 1, endedAt: 1000 }]);
  assert.equal(run([{ op: 'record.endSet' }]).record.history.length, 0);
});

test('elo: set validates, session baseline gives delta and survives as data', () => {
  const s = run([{ op: 'elo.set', value: 2500 }, { op: 'session.start' }, { op: 'elo.set', value: 2537 }]);
  assert.equal(s.elo.current, 2537);
  assert.equal(s.session.startElo, 2500);
  assert.equal(s.session.active, true);
  assert.throws(() => run([{ op: 'elo.set', value: 'abc' }]), { code: 'INVALID' });
  assert.throws(() => run([{ op: 'elo.set', value: 100000 }]), { code: 'INVALID' });
  const ended = applyOp(s, { op: 'session.end' }, ctx);
  assert.equal(ended.session.active, false);
});

test('team.set: up to 3 known members, shadow flag', () => {
  const s = run([{ op: 'team.set', members: [{ id: 184 }, { id: 10180, shadow: true }] }]);
  assert.deepEqual(s.team.members, [{ id: 184, shadow: false }, { id: 10180, shadow: true }]);
  assert.throws(() => run([{ op: 'team.set', members: [{ id: 1 }, { id: 1 }, { id: 1 }, { id: 1 }] }]), { code: 'INVALID' });
  assert.throws(() => run([{ op: 'team.set', members: [{ id: 99999 }] }]), { code: 'INVALID' });
});

test('unknown op rejected', () => {
  assert.throws(() => run([{ op: 'nope' }]), { code: 'INVALID' });
});

test('teamHash is order-sensitive and shadow-sensitive', () => {
  assert.notEqual(teamHash([{ id: 1, shadow: false }]), teamHash([{ id: 1, shadow: true }]));
  assert.equal(teamHash([{ id: 1, shadow: false }]), teamHash([{ id: 1, shadow: false }]));
});

test('migrate fills defaults and drops garbage', () => {
  const s = migrate({ elo: { current: 2400 }, record: 'bad' });
  assert.equal(s.elo.current, 2400);
  assert.equal(s.record.wins, 0);
  assert.equal(s.version, initialState().version);
  assert.deepEqual(migrate(null), initialState());
});

test('Store: undo restores previous state, persists via save hook', () => {
  const saved = [];
  const st = new Store({ state: initialState(), ctx, save: (s) => saved.push(s) });
  st.apply({ op: 'record.win' });
  st.apply({ op: 'record.win' });
  st.apply({ op: 'undo' });
  assert.equal(st.state.record.wins, 1);
  assert.ok(st.state.rev > 2, 'rev keeps increasing after undo');
  assert.equal(saved.length, 3);
  st.apply({ op: 'undo' });
  assert.equal(st.state.record.wins, 0);
  assert.throws(() => st.apply({ op: 'undo' }), { code: 'NOTHING_TO_UNDO' });
});

test('league.set: great/ultra/master only, defaults to great, undoable', () => {
  assert.equal(initialState().league, 'great');
  assert.equal(run([{ op: 'league.set', league: 'ultra' }]).league, 'ultra');
  for (const league of ['little', '', undefined, 'ULTRA']) {
    assert.throws(() => run([{ op: 'league.set', league }]), /league/);
  }
  const store = new Store({ state: initialState(), ctx });
  store.apply({ op: 'league.set', league: 'master' });
  store.apply({ op: 'undo' });
  assert.equal(store.state.league, 'great');
});

test('migrate keeps a valid league and resets garbage to great', () => {
  assert.equal(migrate({ league: 'master' }).league, 'master');
  assert.equal(migrate({ league: 'premier' }).league, 'great');
  assert.equal(migrate(null).league, 'great');
});
