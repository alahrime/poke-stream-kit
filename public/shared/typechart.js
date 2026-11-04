// Pokémon GO type chart. Multipliers: super 1.6, resisted 0.625, "immune" 0.390625 (double resist).
const C = {
  normal:   { se: [], nve: ['rock', 'steel'], imm: ['ghost'] },
  fire:     { se: ['grass', 'ice', 'bug', 'steel'], nve: ['fire', 'water', 'rock', 'dragon'] },
  water:    { se: ['fire', 'ground', 'rock'], nve: ['water', 'grass', 'dragon'] },
  electric: { se: ['water', 'flying'], nve: ['electric', 'grass', 'dragon'], imm: ['ground'] },
  grass:    { se: ['water', 'ground', 'rock'], nve: ['fire', 'grass', 'poison', 'flying', 'bug', 'dragon', 'steel'] },
  ice:      { se: ['grass', 'ground', 'flying', 'dragon'], nve: ['fire', 'water', 'ice', 'steel'] },
  fighting: { se: ['normal', 'ice', 'rock', 'dark', 'steel'], nve: ['poison', 'flying', 'psychic', 'bug', 'fairy'], imm: ['ghost'] },
  poison:   { se: ['grass', 'fairy'], nve: ['poison', 'ground', 'rock', 'ghost'], imm: ['steel'] },
  ground:   { se: ['fire', 'electric', 'poison', 'rock', 'steel'], nve: ['grass', 'bug'], imm: ['flying'] },
  flying:   { se: ['grass', 'fighting', 'bug'], nve: ['electric', 'rock', 'steel'] },
  psychic:  { se: ['fighting', 'poison'], nve: ['psychic', 'steel'], imm: ['dark'] },
  bug:      { se: ['grass', 'psychic', 'dark'], nve: ['fire', 'fighting', 'poison', 'flying', 'ghost', 'steel', 'fairy'] },
  rock:     { se: ['fire', 'ice', 'flying', 'bug'], nve: ['fighting', 'ground', 'steel'] },
  ghost:    { se: ['psychic', 'ghost'], nve: ['dark'], imm: ['normal'] },
  dragon:   { se: ['dragon'], nve: ['steel'], imm: ['fairy'] },
  dark:     { se: ['psychic', 'ghost'], nve: ['fighting', 'dark', 'fairy'] },
  steel:    { se: ['ice', 'rock', 'fairy'], nve: ['fire', 'water', 'electric', 'steel'] },
  fairy:    { se: ['fighting', 'dragon', 'dark'], nve: ['fire', 'poison', 'steel'] },
};
export const TYPES = Object.keys(C);

export function effectiveness(attack, defendTypes) {
  const row = C[attack];
  let m = 1;
  for (const d of defendTypes) {
    if (row.se.includes(d)) m *= 1.6;
    else if (row.nve.includes(d)) m *= 0.625;
    else if (row.imm?.includes(d)) m *= 0.390625;
  }
  return m;
}

// Attacking types that hit 2+ members super-effectively and are resisted by none.
export function teamWeaknesses(teamTypes) {
  return TYPES.map((type) => {
    const mults = teamTypes.map((t) => effectiveness(type, t));
    return { type, weak: mults.filter((m) => m > 1).length, resisted: mults.filter((m) => m < 1).length };
  })
    .filter((x) => x.weak >= 2 && x.resisted === 0)
    .sort((a, b) => b.weak - a.weak);
}
