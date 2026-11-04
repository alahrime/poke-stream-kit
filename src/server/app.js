// HTTP app: static overlays/control, JSON command API, SSE, sprites, Spotify auth, paragon2 bridge.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { loadJson, saveJsonAtomic, debouncedSaver } from './persist.js';
import { Store, migrate, parseMembers, OpError, teamHash } from './store.js';
import { buildView } from './view.js';
import { Bus } from './bus.js';
import { Sprites } from './sprites.js';
import { checkRequest, checkHotkey, validateConfig } from './security.js';
import { Spotify } from '../integrations/spotify.js';
import { Paragon2 } from '../integrations/paragon2.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PUBLIC = join(ROOT, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const HOTKEY_OPS = new Set(['record.win', 'record.loss', 'record.endSet', 'undo', 'session.start', 'session.end', 'league.set']);
const MAX_BODY = 64 * 1024;

export async function createApp({ configDir = join(ROOT, 'config'), dataDir = join(ROOT, 'data'), overrides, fetchImpl = fetch } = {}) {
  const cfg = loadConfig({ configDir, dataDir, overrides });
  validateConfig(cfg);

  const dexList = JSON.parse(readFileSync(join(PUBLIC, 'shared', 'dex.json'), 'utf8'));
  const dex = new Map(dexList.map((p) => [p.i, p]));
  const ctx = { hasPokemon: (id) => dex.has(id), now: () => Date.now() };

  const bus = new Bus();
  const statePath = join(dataDir, 'state.json');
  const secretsPath = join(dataDir, 'secrets.json');
  const teamsPath = join(configDir, 'teams.json');
  const saveState = debouncedSaver(statePath);
  const secrets = loadJson(secretsPath, {});

  const slugs = new Map(dexList.map((p) => [p.n, p.i]));
  const paragon2 = new Paragon2({ cfg, publish: (a) => bus.publish('analysis', a), fetchImpl, resolveSlug: (s) => slugs.get(s) ?? null });
  const store = new Store({
    state: migrate(loadJson(statePath, null)),
    ctx,
    save: saveState,
    onChange: (next, prev) => {
      const view = buildView(next, dex);
      bus.publish('state', view);
      if (view.teamHash !== teamHash(prev.team.members) || next.league !== prev.league) paragon2.onTeamChange(view.teamHash, view.team.view, next.league);
    },
  });
  const initial = buildView(store.state, dex);
  bus.publish('state', initial);
  paragon2.onTeamChange(initial.teamHash, initial.team.view, initial.league);

  const spotify = new Spotify({
    cfg, secrets, fetchImpl,
    saveSecrets: (s) => saveJsonAtomic(secretsPath, s),
    publish: (d) => bus.publish('spotify', d),
    hasListeners: () => bus.overlayCount > 0,
  });
  bus.publish('spotify', { status: cfg.spotify?.clientId ? (spotify.refreshToken ? 'idle' : 'unauthed') : 'disabled', track: null, at: Date.now() });
  spotify.start();

  const sprites = new Sprites({ dataDir, dex, cfg, fetchImpl });

  const send = (res, status, body, headers = {}) => {
    const isBuf = Buffer.isBuffer(body) || typeof body === 'string';
    res.writeHead(status, { 'content-type': isBuf ? 'text/plain; charset=utf-8' : 'application/json', 'cache-control': 'no-store', ...headers });
    res.end(isBuf ? body : JSON.stringify(body));
  };
  const fail = (res, e) => send(res, e instanceof OpError ? (e.code === 'SET_FULL' || e.code === 'NOTHING_TO_UNDO' ? 409 : 400) : 500, { code: e.code ?? 'ERROR', error: e.message });

  const readBody = (req) => new Promise((ok, bad) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { bad(new OpError('INVALID', 'body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { ok(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { bad(new OpError('INVALID', 'invalid JSON')); } });
    req.on('error', bad);
  });

  async function serveFile(res, base, rel) {
    const file = resolve(base, rel);
    if (!file.startsWith(base + sep)) return send(res, 404, 'not found');
    try {
      const body = await readFile(file);
      send(res, 200, body, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': file.endsWith('dex.json') ? 'max-age=3600' : 'no-store' });
    } catch { send(res, 404, 'not found'); }
  }

  const teams = () => loadJson(teamsPath, { teams: [] });

  async function route(req, res) {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    const deny = checkRequest(req, cfg);
    if (deny) return send(res, deny.status, { error: deny.msg });

    if (req.method === 'GET') {
      if (p === '/') return send(res, 302, '', { location: '/control/' });
      if (p === '/events') return bus.attach(req, res);
      if (p === '/api/state') return send(res, 200, buildView(store.state, dex));
      if (p === '/api/teams') return send(res, 200, teams());
      if (p === '/api/info') return send(res, 200, { port: cfg.port, tokenRequired: !!cfg.controlToken, spotifyConfigured: !!cfg.spotify?.clientId, paragon2: !!cfg.paragon2?.url });
      if (p === '/api/hotkey') {
        const d = checkHotkey(url.searchParams.get('token'), cfg);
        if (d) return send(res, d.status, { error: d.msg });
        const op = url.searchParams.get('op');
        if (!HOTKEY_OPS.has(op)) return send(res, 400, { error: `hotkey ops: ${[...HOTKEY_OPS].join(', ')}` });
        try { store.apply(op === 'league.set' ? { op, league: url.searchParams.get('league') } : { op }); return send(res, 200, { ok: true }); } catch (e) { return fail(res, e); }
      }
      let m;
      if ((m = p.match(/^\/sprite\/(\d{1,5})$/))) {
        const s = await sprites.get(Number(m[1]));
        return send(res, 200, s.body, { 'content-type': s.type, 'cache-control': s.temp ? 'no-store' : 'max-age=86400' });
      }
      if (p.startsWith('/sprite/')) return send(res, 404, 'not found');
      if ((m = p.match(/^\/overlay\/([a-z0-9-]+)$/))) return serveFile(res, join(PUBLIC, 'overlays'), `${m[1]}.html`);
      if (p === '/control' || p === '/control/') return serveFile(res, join(PUBLIC, 'control'), 'index.html');
      if (p.startsWith('/control/')) return serveFile(res, join(PUBLIC, 'control'), decodeURIComponent(p.slice(9)));
      if (p.startsWith('/shared/')) return serveFile(res, join(PUBLIC, 'shared'), decodeURIComponent(p.slice(8)));
      if (p === '/spotify/login') {
        if (!cfg.spotify?.clientId) return send(res, 400, 'Spotify is not configured: add spotify.clientId to data/config.local.json (see docs/SETUP.md).');
        if (!String(req.headers.host).startsWith('127.0.0.1:')) return send(res, 302, '', { location: `http://127.0.0.1:${cfg.port}/spotify/login` });
        return send(res, 302, '', { location: spotify.loginUrl() });
      }
      if (p === '/spotify/callback') {
        try {
          await spotify.handleCallback(Object.fromEntries(url.searchParams));
          return send(res, 200, '<!doctype html><meta charset="utf-8"><body style="font:16px system-ui;padding:2rem">Spotify connected ✔ — you can close this tab.', { 'content-type': 'text/html; charset=utf-8' });
        } catch (e) { return send(res, 400, `Spotify login failed: ${e.message}`); }
      }
      return send(res, 404, 'not found');
    }

    if (req.method === 'POST') {
      try {
        const body = await readBody(req);
        if (p === '/api/op') return send(res, 200, buildView(store.apply(body), dex));
        if (p === '/api/teams/save') {
          const name = typeof body.name === 'string' ? body.name.trim().slice(0, 40) : '';
          if (!name) throw new OpError('INVALID', 'preset needs a name');
          const members = parseMembers(body.members, ctx);
          const t = teams();
          t.teams = [...t.teams.filter((x) => x.name !== name), { name, members }].sort((a, b) => a.name.localeCompare(b.name));
          saveJsonAtomic(teamsPath, t);
          return send(res, 200, t);
        }
        if (p === '/api/teams/delete') {
          const t = teams();
          t.teams = t.teams.filter((x) => x.name !== body.name);
          saveJsonAtomic(teamsPath, t);
          return send(res, 200, t);
        }
        if (p === '/api/analysis') return paragon2.accept(body) ? send(res, 200, { ok: true }) : send(res, 409, { error: 'stale or invalid analysis' });
        if (p === '/api/spotify/logout') { spotify.logout(); return send(res, 200, { ok: true }); }
        return send(res, 404, { error: 'not found' });
      } catch (e) { return fail(res, e); }
    }
    send(res, 405, { error: 'method not allowed' });
  }

  const server = http.createServer((req, res) => route(req, res).catch((e) => { console.error(e); if (!res.headersSent) send(res, 500, { error: 'internal' }); }));
  await new Promise((ok) => server.listen(cfg.port, cfg.host, ok));

  const close = () => new Promise((ok) => { spotify.stop(); saveState.flush(); bus.close(); server.close(() => ok()); server.closeAllConnections?.(); });
  return { server, cfg, store, bus, close };
}
