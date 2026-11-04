// State -> render-ready view broadcast to overlays.
import { themeFor } from '../../public/shared/theme.js';
import { teamWeaknesses } from '../../public/shared/typechart.js';
import { teamHash } from './store.js';

export function buildView(state, dex) {
  const view = state.team.members.map((m) => {
    const p = dex.get(m.id);
    return { id: m.id, name: p?.d ?? `#${m.id}`, slug: p?.n ?? null, types: p?.t ?? [], shadow: m.shadow, sprite: `/sprite/${m.id}` };
  });
  const { current } = state.elo;
  const { active, startElo } = state.session;
  return {
    ...state,
    elo: { ...state.elo, delta: active && current != null && startElo != null ? current - startElo : null },
    team: { ...state.team, view },
    teamHash: teamHash(state.team.members),
    theme: themeFor(view),
    weaknesses: view.length >= 2 ? teamWeaknesses(view.map((v) => v.types)) : [],
  };
}
