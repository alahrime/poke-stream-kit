// Fuzzy-ish prefix search over the bundled dex. Every query word must prefix-match a word of the name.
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9#\s-]/g, '');
const words = (p) => [...new Set([...norm(p.d).split(/\s+/), ...p.n.split('-')])];

export function searchDex(dex, query, limit = 8) {
  const q = norm(query).trim();
  if (!q) return [];
  const num = q.match(/^#?(\d{1,4})$/);
  if (num) return dex.filter((p) => p.s === Number(num[1])).slice(0, limit);
  const qs = q.split(/[\s-]+/).filter(Boolean);
  const hits = [];
  for (const p of dex) {
    const ws = words(p);
    if (!qs.every((t) => ws.some((w) => w.startsWith(t)))) continue;
    const name = norm(p.d);
    const rank = name === q ? 0 : name.startsWith(q) || p.n.startsWith(q.replace(/\s+/g, '-')) ? 1 : 2;
    hits.push([rank, p.i > 10000 ? 1 : 0, p.s, p.n.length, p]);
  }
  hits.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3]);
  return hits.slice(0, limit).map((h) => h[4]);
}
