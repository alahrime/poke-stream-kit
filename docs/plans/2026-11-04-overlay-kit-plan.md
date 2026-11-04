# Plan: poke-stream-kit v1

**Goal:** Portable OBS overlay kit for Pokémon GO PvP streams: ELO, set record, active team sprites (searchable), Spotify now-playing, type-driven theming. It also needs a clean hook for paragon2 (team weakness analysis) and future Twitch engagement.

## Architecture

```
 Control panel (browser: laptop/phone)  ──POST /api/*──►  Node server (127.0.0.1:7878)
                                                          │  state store (data/state.json)
 Spotify Web API  ◄──poll 5s── integrations/spotify ──►   │  event bus ──SSE /events──► OBS browser sources
 paragon2 (separate repo) ◄─webhook / POST /api/analysis─►│                              /overlay/{elo,record,team,spotify,scene}
```

Single process, zero npm deps, SSE for push. Each overlay is a transparent HTML page, so OBS composes them freely. A combined `/overlay/scene` page suits laptops that should run only one browser source.

## Task breakdown (each independently shippable)

| # | Task | Output | Tests |
|---|------|--------|-------|
| T1 | Core server: static files, JSON API, SSE bus, state store with atomic writes | `src/server/*` | state reducer + validation |
| T2 | Bundled Pokédex builder (id, name, display name, types, sprite id) | `scripts/build-dex.mjs`, `public/shared/dex.json` | dex shape |
| T3 | ELO overlay + control (set value, ±delta, shows delta since stream start) | `overlays/elo.html` | elo validation |
| T4 | Set record overlay "x - y", W/L buttons clamp 0–5, "end set" pushes to set history | `overlays/record.html` | clamp, end-set |
| T5 | Team overlay: 3 sprites; control search bar w/ autocomplete over dex; save/load named teams (`config/teams.json`); shadow toggle | `overlays/team.html` | team validation, presets |
| T6 | Theme engine: team types → CSS vars (primary/secondary type colours), applied to every overlay | `shared/theme.js` | type→palette |
| T7 | Spotify: PKCE auth via `/spotify/login` → `/spotify/callback`, refresh token stored, server polls currently-playing, overlay shows art/title/artist + progress | `integrations/spotify.js`, `overlays/spotify.html` | PKCE helpers |
| T8 | paragon2 hook: on team change, POST team to `PARAGON2_URL` if configured; accept `POST /api/analysis` → broadcast; overlay slot renders weaknesses | `integrations/paragon2.js` | payload contract |
| T9 | Portability: `config/config.example.json`, OBS scene-collection template, `docs/SETUP.md` (desktop + laptop), `docs/TWITCH-GROWTH.md` roadmap | docs | — |
| T10 | Verification: run server, Playwright screenshots of overlays + control | screenshots | — |

## Integration points (how pieces fit)

- **Event bus topics:** `state` (full snapshot), `spotify`, `analysis`. Overlays subscribe to `/events` and render the slice they need.
- **Team change** → theme recomputed client-side from dex types → every overlay recolours. paragon2 gets a webhook and replies via `/api/analysis`.
- **Future Twitch (Phase 2, not v1):** `integrations/twitch.js` uses EventSub WebSocket for channel-point redemptions, follows, and raids, then publishes `alert` events on the same bus. Example redemptions: "Viewer picks my lead", "Predict this set" (Twitch Predictions tie into the record widget).

## Security

- Bind 127.0.0.1 by default. If `host` is set to LAN (phone control), a `controlToken` is required on mutating API calls.
- Secrets never in `config/`; `data/` gitignored.

## Out of scope v1

Twitch EventSub implementation, auto-detecting team from game screen (OCR), cloud sync of state.

## Review outcomes (2 senior reviewers: architecture, streaming/security) — adopted

1. **Record rule:** `wins + losses ≤ 5` (GBL set = 5 battles); W/L blocked when the set is full; **Undo** for misclicks.
2. **Commands, not full-state writes:** `POST /api/op {op:"record.win"}`. State carries `rev` and `version` (with migration). Multiple control panels stay in sync via SSE.
3. **SSE:** snapshot of every topic on connect, `retry:`, 15s heartbeat, `Cache-Control: no-store`. Overlays keep their last frame on disconnect.
4. **Security, always on:** Host allowlist (blocks DNS rebinding), Origin check, `Content-Type: application/json` required on POSTs. If bound to LAN, `controlToken` is required. GET hotkey endpoint (Stream Deck) only with a token.
5. **ELO session** is explicit and persisted (Start/End stream), so the delta survives restarts.
6. **Spotify:** redirect `http://127.0.0.1:<port>/spotify/callback`, scope `user-read-currently-playing`. Rotated refresh token saved atomically. 204→idle, 401→refresh once, 429→Retry-After, backoff while offline. Status published so the overlay hides cleanly. Polls only while an overlay is connected. Login happens once per device, on that device.
7. **Dex per form** (PokeAPI pokemon ids, incl. 10xxx regional forms). Shadow is a flag. Sprites go through `/sprite/:id`, with a disk cache in `data/` and a fallback chain (home → default → species → placeholder).
8. **Analysis** is tagged with `teamHash`. Stale replies are dropped and analysis clears on team change. The webhook is non-blocking with a timeout. A **built-in GO type-chart analyzer** gives shared weaknesses until paragon2 is wired in.
9. **Portability:** atomic writes with EPERM retry; a corrupt state file is backed up, not fatal; per-device `data/config.local.json` overrides committed `config/config.json`.
10. **Twitch roadmap reordered:** channel points and predictions need Affiliate (50 followers, 500 min over 7 days, avg 3 viewers). Start with chat commands, follows and raids.
11. `?demo=1` on every overlay for sizing and screenshots.
