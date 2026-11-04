# Handoff — poke-stream-kit

_Last updated: 2026-11-04_

## Status
v1 is complete on branch `feat/v1`. `main` holds only the plan and CLAUDE.md, so merge `feat/v1` into `main` once you've looked it over.
- 48/48 tests pass (`npm test`). Playwright end-to-end check passed: the control panel pushes live updates to the overlays, there are 0 console errors, and the phone layout has no horizontal scroll.
- Process: Superpowers. The plan had 2 senior reviews, then the finished code had 2 final senior reviews. Every Critical/Important finding was fixed test-first.
- Plan and review outcomes: `docs/plans/2026-11-04-overlay-kit-plan.md`

## Not yet verified
- A real Spotify OAuth login, which needs the user's Spotify developer app (see docs/SETUP.md §3).
- OBS itself. Overlays were checked in Chromium only.

## Rulings made during v1 (keep unless there's a reason)
- The scene overlay renders all widgets over one SSE connection, not iframes, because of Chrome's 6-connections-per-host limit.
- Undo is global: it also reverts team and ELO ops.
- `/overlay/background` was added for the "theme changes with team" goal.
- The paragon2 webhook uses a hard `Promise.race` timeout as well as an AbortSignal.

## Deferred minors (from final review)
- After clicking Win/Loss, the button keeps focus, so a Space/Enter press records a second result. Fix with `blur()` or by ignoring those keys.
- `decodeURIComponent` on a malformed `%` path returns 500. It should return 404.
- `POST /api/teams/save` with a JSON `null` body returns 500. It should return 400.
- An oversized body destroys the socket. It should return 413.
- `send()` lacks `X-Content-Type-Options: nosniff`.
- Persist has no fsync. `saveJsonAtomic` busy-waits up to 250ms on an EPERM retry.
- Spotify `retry-after: 0` becomes a 30s wait. A failed `saveSecrets` is never retried.
- `migrate` doesn't validate `history[].endedAt` and doesn't handle a newer `version`.
- The SSE bus ignores backpressure.
- SETUP.md §4 should warn that a DHCP-assigned LAN IP can change, which breaks `allowedHosts`.

## Next work (separate sessions)
1. **paragon2 integration.** The contract is in `docs/INTEGRATIONS.md`, and the user will share the repo.
2. **Twitch Phase 2.** `src/integrations/twitch.js` should use EventSub over WebSocket, publish `alert` on the bus, and map redemptions to ops. See `docs/TWITCH-GROWTH.md`.
3. Pick off the deferred minors above.

## Resume checklist
`git clone`, then `npm test` (expect 48 passing), then `npm start`, then open http://127.0.0.1:7878/control/
