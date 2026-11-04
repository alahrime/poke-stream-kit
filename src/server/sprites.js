// /sprite/:id — disk-cached proxy over PokeAPI's sprite repo with a fallback chain.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const RAW = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/';
const PLACEHOLDER = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><circle cx="48" cy="48" r="40" fill="#fff" fill-opacity=".15" stroke="#fff" stroke-opacity=".5" stroke-width="4"/><path d="M8 48h80" stroke="#fff" stroke-opacity=".5" stroke-width="4"/><circle cx="48" cy="48" r="10" fill="#fff" fill-opacity=".6"/></svg>',
);

export function spriteUrls(id, speciesId, style = 'home') {
  const ids = speciesId && speciesId !== id ? [id, speciesId] : [id];
  const paths = (i) => (style === 'home' ? [`other/home/${i}.png`, `${i}.png`] : [`${i}.png`, `other/home/${i}.png`]);
  return ids.flatMap(paths).map((p) => RAW + p);
}

export class Sprites {
  constructor({ dataDir, dex, cfg, fetchImpl = fetch }) {
    Object.assign(this, { dir: join(dataDir, 'sprite-cache'), dex, cfg, fetch: fetchImpl });
    this.inflight = new Map();
    this.misses = new Map(); // id -> retryAfter (don't hammer GitHub while offline)
  }

  async get(id) {
    const style = this.cfg.sprites?.style ?? 'home';
    const file = join(this.dir, `${style}-${id}.png`);
    try { return { type: 'image/png', body: await readFile(file) }; } catch {}
    if ((this.misses.get(id) ?? 0) > Date.now()) return { type: 'image/svg+xml', body: PLACEHOLDER, temp: true };
    if (!this.inflight.has(id)) this.inflight.set(id, this.download(id, style, file).finally(() => this.inflight.delete(id)));
    return this.inflight.get(id);
  }

  async download(id, style, file) {
    for (const url of spriteUrls(id, this.dex.get(id)?.s, style)) {
      try {
        const res = await this.fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) continue;
        const body = Buffer.from(await res.arrayBuffer());
        await mkdir(this.dir, { recursive: true });
        await writeFile(file, body);
        return { type: 'image/png', body };
      } catch {}
    }
    this.misses.set(id, Date.now() + 60e3);
    return { type: 'image/svg+xml', body: PLACEHOLDER, temp: true };
  }
}
