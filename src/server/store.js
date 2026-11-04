// Pure state model + command reducer. Persistence and broadcast are injected.
export const VERSION = 1;
const SET_SIZE = 5;
const UNDO_LIMIT = 30;

export class OpError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const invalid = (msg) => new OpError('INVALID', msg);

export function initialState() {
  return {
    version: VERSION,
    rev: 0,
    elo: { current: null },
    session: { active: false, startElo: null, startedAt: null },
    record: { wins: 0, losses: 0, history: [] },
    team: { name: '', members: [] },
  };
}

const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

// Accepts anything read from disk; returns a valid current-version state.
export function migrate(raw) {
  const base = initialState();
  const r = obj(raw);
  const elo = obj(r.elo), ses = obj(r.session), rec = obj(r.record), team = obj(r.team);
  const s = {
    version: VERSION,
    rev: isInt(r.rev, 0, Number.MAX_SAFE_INTEGER) ? r.rev : 0,
    elo: { current: isInt(elo.current, 0, 9999) ? elo.current : null },
    session: {
      active: ses.active === true,
      startElo: isInt(ses.startElo, 0, 9999) ? ses.startElo : null,
      startedAt: Number.isFinite(ses.startedAt) ? ses.startedAt : null,
    },
    record: {
      wins: isInt(rec.wins, 0, SET_SIZE) ? rec.wins : 0,
      losses: isInt(rec.losses, 0, SET_SIZE) ? rec.losses : 0,
      history: Array.isArray(rec.history)
        ? rec.history.filter((h) => isInt(h?.wins, 0, SET_SIZE) && isInt(h?.losses, 0, SET_SIZE)).slice(-200)
        : [],
    },
    team: {
      name: typeof team.name === 'string' ? team.name.slice(0, 40) : '',
      members: Array.isArray(team.members)
        ? team.members.filter((m) => isInt(m?.id, 1, 99999)).slice(0, 3).map((m) => ({ id: m.id, shadow: m.shadow === true }))
        : [],
    },
  };
  if (s.record.wins + s.record.losses > SET_SIZE) s.record = { ...base.record, history: s.record.history };
  return s;
}

export function teamHash(members) {
  return members.map((m) => `${m.id}${m.shadow ? 's' : ''}`).join('.');
}

export function parseMembers(members, ctx) {
  if (!Array.isArray(members) || members.length > 3) throw invalid('team must have 0-3 members');
  return members.map((m) => {
    if (!isInt(m?.id, 1, 99999) || !ctx.hasPokemon(m.id)) throw invalid(`unknown pokemon id ${m?.id}`);
    return { id: m.id, shadow: m.shadow === true };
  });
}

// Pure: returns a new state or throws OpError. `undo` is handled by Store.
export function applyOp(state, cmd, ctx) {
  const s = structuredClone(state);
  const rec = s.record;
  switch (cmd?.op) {
    case 'elo.set':
      if (!isInt(cmd.value, 0, 9999)) throw invalid('elo must be an integer 0-9999');
      s.elo.current = cmd.value;
      break;
    case 'session.start':
      s.session = { active: true, startElo: s.elo.current, startedAt: ctx.now() };
      break;
    case 'session.end':
      s.session.active = false;
      break;
    case 'record.win':
    case 'record.loss':
      if (rec.wins + rec.losses >= SET_SIZE) throw new OpError('SET_FULL', 'set is complete — end the set first');
      if (cmd.op === 'record.win') rec.wins++; else rec.losses++;
      break;
    case 'record.set':
      if (!isInt(cmd.wins, 0, SET_SIZE) || !isInt(cmd.losses, 0, SET_SIZE) || cmd.wins + cmd.losses > SET_SIZE) {
        throw invalid('wins/losses must be integers 0-5 with wins + losses <= 5');
      }
      rec.wins = cmd.wins; rec.losses = cmd.losses;
      break;
    case 'record.endSet':
      if (rec.wins + rec.losses > 0) rec.history = [...rec.history, { wins: rec.wins, losses: rec.losses, endedAt: ctx.now() }].slice(-200);
      rec.wins = 0; rec.losses = 0;
      break;
    case 'record.clearHistory':
      rec.history = [];
      break;
    case 'team.set':
      s.team.members = parseMembers(cmd.members, ctx);
      s.team.name = typeof cmd.name === 'string' ? cmd.name.slice(0, 40) : '';
      break;
    default:
      throw invalid(`unknown op ${String(cmd?.op).slice(0, 40)}`);
  }
  s.rev = state.rev + 1;
  return s;
}

// Stateful wrapper: undo stack, persistence, change notification.
export class Store {
  constructor({ state, ctx, save = () => {}, onChange = () => {} }) {
    Object.assign(this, { state, ctx, save, onChange, undoStack: [] });
  }

  apply(cmd) {
    const prev = this.state;
    let next;
    if (cmd?.op === 'undo') {
      if (!this.undoStack.length) throw new OpError('NOTHING_TO_UNDO', 'nothing to undo');
      next = { ...this.undoStack.pop(), rev: prev.rev + 1 };
    } else {
      next = applyOp(prev, cmd, this.ctx);
      this.undoStack.push(prev);
      if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    }
    this.state = next;
    this.save(next);
    this.onChange(next, prev);
    return next;
  }
}
