#!/usr/bin/env node
// Builds public/shared/dex.json from PokeAPI CSV data (one entry per form).
// Usage: node scripts/build-dex.mjs [localCsvDir]
// Entry: { i: pokemonId, n: identifier, d: displayName, s: speciesId, t: [types] }
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const BASE = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/';
const EXCLUDE = [/-totem/, /-gmax$/, /-starter$/, /-eternamax$/];
const REGION = { alola: 'Alolan', galar: 'Galarian', hisui: 'Hisuian', paldea: 'Paldean' };

async function load(name, dir) {
  if (dir) return readFile(join(dir, `${name}.csv`), 'utf8');
  const res = await fetch(BASE + name + '.csv');
  if (!res.ok) throw new Error(`${name}.csv: HTTP ${res.status}`);
  return res.text();
}

const rows = (csv) => {
  const [head, ...lines] = csv.trim().split(/\r?\n/);
  const keys = head.split(',');
  return lines.map((l) => Object.fromEntries(l.split(',').map((v, i) => [keys[i], v])));
};

const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);

export function displayName(identifier) {
  const parts = identifier.split('-');
  const region = parts.find((p) => REGION[p]);
  const rest = parts.filter((p) => p !== region).map(cap);
  return (region ? `${REGION[region]} ` : '') + rest.join(' ');
}

async function main() {
  const dir = process.argv[2];
  const [pokemon, ptypes, types] = await Promise.all(
    ['pokemon', 'pokemon_types', 'types'].map((n) => load(n, dir).then(rows)),
  );
  const typeName = Object.fromEntries(types.map((t) => [t.id, t.identifier]));
  const typesOf = new Map();
  for (const r of ptypes) {
    const list = typesOf.get(r.pokemon_id) ?? [];
    list[Number(r.slot) - 1] = typeName[r.type_id];
    typesOf.set(r.pokemon_id, list);
  }
  const dex = pokemon
    .filter((p) => !EXCLUDE.some((re) => re.test(p.identifier)))
    .map((p) => ({
      i: Number(p.id),
      n: p.identifier,
      d: displayName(p.identifier),
      s: Number(p.species_id),
      t: (typesOf.get(p.id) ?? []).filter(Boolean),
    }))
    .filter((p) => p.t.length);
  const out = new URL('../public/shared/dex.json', import.meta.url);
  await writeFile(out, JSON.stringify(dex));
  console.log(`dex.json: ${dex.length} entries`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
