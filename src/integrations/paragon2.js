// paragon2 bridge. Contract (see docs/INTEGRATIONS.md):
//   outbound  POST <paragon2.url>  { teamHash, league, members:[{id,name,slug,types,shadow}] }
//   inbound   reply body and/or later POST /api/analysis
//             { teamHash, league?, weaknesses?, notes?, threats?, matrix?, winRate? }
// Analysis for another team or league is dropped as stale. Analyses for the same
// team+league merge, so a fast reply (matrix) and a slow follow-up (winRate) combine.
import { TYPES } from '../../public/shared/typechart.js';

const MAX_THREATS = 8;
const SLUG = /^[a-z0-9-]{1,60}$/;
const num = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const str = (v, max) => typeof v === 'string' && v.length >= 1 && v.length <= max;

export class Paragon2 {
  constructor({ cfg, publish, fetchImpl = fetch, resolveSlug = () => null }) {
    Object.assign(this, { cfg, publish, fetch: fetchImpl, resolveSlug, teamHash: null, league: null, size: 0, current: null });
  }

  // { name, slug?, shadow? } -> { name, shadow, id? } (id = PokeAPI id, for /sprite/:id)
  mon(m) {
    if (!str(m?.name, 40) || (m.slug !== undefined && !SLUG.test(m.slug)) || (m.shadow !== undefined && typeof m.shadow !== 'boolean')) return null;
    const id = m.slug ? this.resolveSlug(m.slug) : null;
    return { name: m.name, shadow: m.shadow === true, ...(id && { id }) };
  }

  // Returns the validated fields of `a`, or null if any present field is invalid.
  parse(a) {
    const out = {};
    if (a.weaknesses !== undefined) {
      if (!Array.isArray(a.weaknesses) || a.weaknesses.length > 18) return null;
      if (!a.weaknesses.every((w) => TYPES.includes(w?.type) && (w.severity === undefined || Number.isFinite(w.severity)))) return null;
      out.weaknesses = a.weaknesses.map((w) => ({ type: w.type, ...(w.severity !== undefined && { severity: w.severity }) }));
    }
    if (a.notes !== undefined) {
      if (typeof a.notes !== 'string' || a.notes.length > 500) return null;
      out.notes = a.notes;
    }
    if (a.winRate !== undefined) {
      if (!num(a.winRate, 0, 1)) return null;
      out.winRate = a.winRate;
    }
    if (a.threats !== undefined) {
      if (!Array.isArray(a.threats) || a.threats.length > MAX_THREATS) return null;
      out.threats = [];
      for (const t of a.threats) {
        const m = this.mon(t);
        if (!m || (t.beatShare !== undefined && !num(t.beatShare, 0, 1)) || (t.rating !== undefined && !num(t.rating, 0, 1000))) return null;
        out.threats.push({ ...m, ...(t.beatShare !== undefined && { beatShare: t.beatShare }), ...(t.rating !== undefined && { rating: Math.round(t.rating) }) });
      }
    }
    if (a.matrix !== undefined) {
      const { foes, ratings } = a.matrix ?? {};
      if (!Array.isArray(foes) || !foes.length || foes.length > MAX_THREATS) return null;
      if (!Array.isArray(ratings) || ratings.length !== this.size) return null;
      const okRow = (row) => Array.isArray(row) && row.length === foes.length
        && row.every((c) => Array.isArray(c) && c.length === 3 && c.every((r) => num(r, 0, 1000)));
      if (!ratings.every(okRow)) return null;
      const fs = foes.map((f) => this.mon(f));
      if (fs.includes(null)) return null;
      out.matrix = { foes: fs, ratings: ratings.map((row) => row.map((c) => c.map(Math.round))) };
    }
    return Object.keys(out).length ? out : null;
  }

  accept(a) {
    if (!a || typeof a !== 'object' || a.teamHash !== this.teamHash) return false;
    if (a.league !== undefined && a.league !== this.league) return false;
    const fields = this.parse(a);
    if (!fields) return false;
    this.current = { ...(this.current ?? { teamHash: this.teamHash, league: this.league, source: 'paragon2', notes: '' }), ...fields };
    this.publish(this.current);
    return true;
  }

  async onTeamChange(teamHash, members, league = 'great') {
    Object.assign(this, { teamHash, league, size: members.length, current: null });
    this.publish(null);
    const { url, timeoutMs = 3000 } = this.cfg.paragon2 ?? {};
    if (!url || !members.length) return;
    try {
      let timer;
      const timeout = new Promise((_, rej) => { timer = setTimeout(() => rej(Object.assign(new Error('timeout'), { name: 'TimeoutError' })), timeoutMs); });
      const res = await Promise.race([
        this.fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ teamHash, league, members: members.map(({ id, name, slug, types, shadow }) => ({ id, name, slug, types, shadow })) }),
          signal: AbortSignal.timeout(timeoutMs),
        }),
        timeout,
      ]).finally(() => clearTimeout(timer));
      if (!res.ok) return;
      const body = await res.json().catch(() => null);
      // The reply answers this request only: drop it if team or league moved on meanwhile.
      if (body && this.teamHash === teamHash && this.league === league) this.accept(body);
    } catch (e) {
      console.warn(`[paragon2] ${e.name === 'TimeoutError' ? 'timeout' : e.message}`);
    }
  }
}
