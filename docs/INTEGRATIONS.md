# Integrations

All mutating calls are `POST` with `Content-Type: application/json`. If `controlToken` is set, they also need the header `X-Control-Token`.

## Commands — `POST /api/op`

| op | body |
|---|---|
| `elo.set` | `{ "value": 2537 }` |
| `session.start` / `session.end` | — |
| `record.win` / `record.loss` | — (409 once the set has 5 games) |
| `record.set` | `{ "wins": 2, "losses": 1 }` |
| `record.endSet` / `record.clearHistory` | — |
| `team.set` | `{ "members": [{ "id": 10180, "shadow": false }], "name": "GL core" }` (ids = PokeAPI pokemon ids, see `public/shared/dex.json`) |
| `league.set` | `{ "league": "ultra" }` (`great` / `ultra` / `master`; default `great`; re-sends the team to paragon2) |
| `undo` | — |

## Hotkeys / Stream Deck — `GET /api/hotkey?op=<op>&token=<controlToken>`

These need a `controlToken`. Allowed ops: `record.win`, `record.loss`, `record.endSet`, `undo`, `session.start`, `session.end`, `league.set` (add `&league=ultra`). In Stream Deck, use the *Website* action with "GET request in background".

## Live data — `GET /events` (SSE)

Topics: `state` (full view: elo, record, league, team.view, theme, weaknesses, teamHash), `spotify`, `analysis`. A snapshot of every topic is sent on connect.

## paragon2

Set `"paragon2": { "url": "http://127.0.0.1:<port>/team" }` in `data/config.local.json` (optional `"timeoutMs"`, default 3000).

1. **On every team or league change** we `POST` to that URL:
   ```json
   { "teamHash": "10180.184.308s", "league": "great",
     "members": [{ "id": 10180, "name": "Galarian Stunfisk", "slug": "stunfisk-galar", "types": ["ground","steel"], "shadow": false }] }
   ```
   `id` is the PokeAPI pokemon id and `slug` its PokeAPI name. paragon2 maps `slug` to its own speciesId (`stunfisk_galarian`, plus `_shadow` when `shadow` is true).
2. **paragon2 replies** with the response body (within `timeoutMs`), and/or later with one or more `POST /api/analysis`. Every field except `teamHash` is optional, but at least one must be present:
   ```json
   { "teamHash": "10180.184.308s", "league": "great",
     "weaknesses": [{ "type": "fighting", "severity": 2 }],
     "notes": "Weak to Medicham mirrors",
     "winRate": 0.58,
     "threats": [{ "name": "Medicham", "slug": "medicham", "shadow": false, "beatShare": 0.41, "rating": 380 }],
     "matrix": { "foes": [{ "name": "Medicham", "slug": "medicham" }],
                 "ratings": [[[402, 455, 520]], [[486, 512, 540]], [[655, 700, 732]]] } }
   ```
   - `weaknesses`: type-level, max 18 (paragon2 `synergy.weaknessesOf` / `worstSharedWeakness`). `notes`: max 500 chars.
   - `winRate`: 0–1 (paragon2 `analyseTeam().winRate`).
   - `threats`: max 8 opposing Pokémon. `beatShare` 0–1 (paragon2 `weaknessesAgainst`) and/or battle `rating` 0–1000.
   - `matrix`: your team × up to 8 foes (paragon2 `matrixFor` / `topThreats`). `ratings[member][foe]` is `[0-shield, 1-shield, 2-shield]` battle ratings, 0–1000 with 500 even. There must be one row per team member, in team order. The overlay shows the 1-shield value.
   - `name` is shown as-is. `slug` (a PokeAPI name, `[a-z0-9-]`) is resolved through the bundled dex to a sprite; unknown slugs fall back to a text abbreviation.

   **Staleness:** a reply is rejected with 409 if its `teamHash` isn't the current team, or if it echoes a `league` that isn't the current league. Echo `league` on every follow-up POST so a slow result isn't shown after the streamer switches league. A webhook reply is also dropped if the team or league changed while it was in flight.

   **Merging:** analyses for the same team and league merge field by field. So a fast reply (weaknesses + matrix) followed by a slow `POST /api/analysis` (winRate + threats) shows both. Any team or league change clears the analysis.

The `analysis` overlay shows the league, type weaknesses (paragon2's when present, otherwise the built-in GO type chart), the sim win rate, the top threats and the matchup matrix. Preview it with `/overlay/analysis?demo=1`.
