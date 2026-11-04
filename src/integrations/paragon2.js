// paragon2 bridge. Contract (see docs/INTEGRATIONS.md):
//   outbound  POST <paragon2.url>  { teamHash, members:[{id,name,types,shadow}] }
//   inbound   reply body OR later POST /api/analysis  { teamHash, weaknesses:[{type, severity?}], notes? }
// Analysis whose teamHash != current team is dropped as stale.
import { TYPES } from '../../public/shared/typechart.js';

export class Paragon2 {
  constructor({ cfg, publish, fetchImpl = fetch }) {
    Object.assign(this, { cfg, publish, fetch: fetchImpl, teamHash: null });
  }

  accept(a) {
    if (!a || a.teamHash !== this.teamHash || !Array.isArray(a.weaknesses) || a.weaknesses.length > 18) return false;
    if (!a.weaknesses.every((w) => TYPES.includes(w?.type) && (w.severity === undefined || Number.isFinite(w.severity)))) return false;
    if (a.notes !== undefined && (typeof a.notes !== 'string' || a.notes.length > 500)) return false;
    this.publish({
      teamHash: a.teamHash, source: 'paragon2', notes: a.notes ?? '',
      weaknesses: a.weaknesses.map((w) => ({ type: w.type, ...(w.severity !== undefined && { severity: w.severity }) })),
    });
    return true;
  }

  async onTeamChange(teamHash, members) {
    this.teamHash = teamHash;
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
          body: JSON.stringify({ teamHash, members }),
          signal: AbortSignal.timeout(timeoutMs),
        }),
        timeout,
      ]).finally(() => clearTimeout(timer));
      if (res.ok) { const body = await res.json().catch(() => null); if (body?.weaknesses) this.accept(body); }
    } catch (e) {
      console.warn(`[paragon2] ${e.name === 'TimeoutError' ? 'timeout' : e.message}`);
    }
  }
}
