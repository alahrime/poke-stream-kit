// Team types -> overlay theme (CSS custom properties). Shared by server and browser.
export const TYPE_COLORS = {
  normal: '#9fa19f', fire: '#e62829', water: '#2980ef', electric: '#fac000', grass: '#3fa129',
  ice: '#3dcef3', fighting: '#ff8000', poison: '#9141cb', ground: '#915121', flying: '#81b9ef',
  psychic: '#ef4179', bug: '#91a119', rock: '#afa981', ghost: '#704170', dragon: '#5060e1',
  dark: '#624d4e', steel: '#60a1b8', fairy: '#ef70ef',
};
const NEUTRAL = { accent: '#7c5cff', accent2: '#2ad4c4' };

export function themeFor(members) {
  const counts = new Map(); // insertion order = lead first, used as tiebreak
  for (const m of members) for (const t of m.types ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t); // stable sort
  const primary = ranked[0] ?? null;
  const secondary = ranked[1] ?? primary;
  return {
    primary,
    secondary,
    vars: {
      '--accent': primary ? TYPE_COLORS[primary] : NEUTRAL.accent,
      '--accent-2': secondary ? TYPE_COLORS[secondary] : NEUTRAL.accent2,
    },
  };
}
