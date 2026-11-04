# poke-stream-kit — Claude guide

Twitch/OBS overlay toolkit for Pokémon GO PvP streams. Zero-dependency Node 22 server + browser-source overlays + a control panel.

## Context Saving

* Before reading an entire file, search with grep and read only what you need.
* To explore the project, use a sub-agent and bring me just the summary.
* Show me the diff, not the full file.
* Don't repeat what we've already decided in this session.
* If we switch tasks, suggest / compact or a new session.
* Short responses, by default.

## Decisions (don't re-litigate)

- **No npm dependencies.** Node built-ins only (`http`, `fs`, `crypto`, `node:test`). Server→overlay push uses **SSE**, not WebSockets.
- **One process, one port** (default `7878`, bind `127.0.0.1`). OBS browser sources point at `http://127.0.0.1:7878/overlay/<name>`.
- **State** lives in `data/state.json` (gitignored, per-device). **Config + saved teams** live in `config/` (committed → portable). **Secrets** (Spotify refresh token) in `data/secrets.json` (gitignored).
- **Pokédex is bundled** (`public/shared/dex.json`, built by `scripts/build-dex.mjs` from PokeAPI CSVs). Sprites hotlinked from PokeAPI's GitHub sprite repo.
- **Set record** values are integers clamped to 0–5.
- **Integrations** (Spotify, paragon2, future Twitch EventSub) live in `src/integrations/` and talk to the core only via the event bus (`src/server/bus.js`).

## Layout

- `src/server/` — http server, routes, state store, SSE bus
- `src/integrations/` — spotify, paragon2 hook
- `public/overlays/` — one HTML per OBS browser source
- `public/control/` — control panel (open on phone/laptop)
- `public/shared/` — overlay client, theme engine, dex
- `docs/plans/` — plans and reviews

## Commands

- `npm start` — run server
- `npm test` — node:test suite
- `npm run build:dex` — regenerate bundled Pokédex
