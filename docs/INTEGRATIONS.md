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
| `undo` | — |

## Hotkeys / Stream Deck — `GET /api/hotkey?op=<op>&token=<controlToken>`

These need a `controlToken`. Allowed ops: `record.win`, `record.loss`, `record.endSet`, `undo`, `session.start`, `session.end`. In Stream Deck, use the *Website* action with "GET request in background".

## Live data — `GET /events` (SSE)

Topics: `state` (full view: elo, record, team.view, theme, weaknesses, teamHash), `spotify`, `analysis`. A snapshot of every topic is sent on connect.

## paragon2

Set `"paragon2": { "url": "http://127.0.0.1:<port>/team" }` in `data/config.local.json`.

1. **On every team change** we `POST` to that URL:
   ```json
   { "teamHash": "10180.184.308s", "members": [{ "id": 10180, "name": "Galarian Stunfisk", "types": ["ground","steel"], "shadow": false }] }
   ```
2. **paragon2 replies** with the response body, or later with a `POST /api/analysis`:
   ```json
   { "teamHash": "10180.184.308s", "weaknesses": [{ "type": "fighting", "severity": 2 }], "notes": "Weak to Medicham mirrors" }
   ```
   A reply whose `teamHash` isn't the current team is rejected (409). The team changed, so the analysis is stale.

The `analysis` overlay shows paragon2's result when present, otherwise the built-in GO type-chart result.
