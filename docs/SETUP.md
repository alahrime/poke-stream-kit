# Setup

## 1. Each machine (desktop + laptop)

1. Install Node.js 20+ (LTS).
2. `git clone <your repo>` and run `npm start`. On Windows you can double-click `start.bat`; on macOS/Linux run `./start.sh`.
3. Open http://127.0.0.1:7878/control/

**What travels with git:** `config/config.json` (defaults) and `config/teams.json` (saved teams). Run `git pull` on the other machine and your teams are there.
**What stays per-device in `data/` (gitignored):** live state (ELO, set), Spotify login, the sprite cache, and `data/config.local.json` overrides.

## 2. OBS

Add a **Browser** source for each overlay URL shown in the control panel's "OBS browser sources" table, at the listed width/height.
- Leave "Custom CSS" **empty**. OBS's default CSS is fine because the overlays are already transparent.
- Leave "Shutdown source when not visible" **off** if you like instant updates. If it's on, the overlay still resyncs on reconnect.
- Laptop tip: use just `scene` (one source) plus optionally `background`. That saves CPU.
- Preview any overlay with demo data: `http://127.0.0.1:7878/overlay/team?demo=1`.

**Moving OBS between machines:** in OBS go to *Scene Collection → Export*, then *Import* on the other machine. Every URL is `127.0.0.1:7878`, so it works unchanged.

## 3. Spotify (once per machine)

1. Go to https://developer.spotify.com/dashboard, create an app, and choose **Web API**.
2. Add the Redirect URI **exactly**: `http://127.0.0.1:7878/spotify/callback`. Spotify rejects `localhost`.
3. Copy the Client ID into `data/config.local.json`:
   ```json
   { "spotify": { "clientId": "YOUR_CLIENT_ID" } }
   ```
4. Restart, then click **Connect Spotify** in the control panel **on the streaming PC**.

Notes: development-mode Spotify apps need the app owner to have Premium, and other users must be added in the dashboard's *User Management*. Only the `user-read-currently-playing` scope is requested. The overlay hides itself when nothing is playing.

## 4. Control from your phone (optional)

Your phone controls the server over Wi-Fi, so the server must listen on your LAN **with a token**. Put this in `data/config.local.json`:
```json
{ "host": "0.0.0.0", "controlToken": "pick-a-long-random-string", "allowedHosts": ["192.168.1.20:7878"] }
```
(use your PC's LAN IP). On the phone, open `http://192.168.1.20:7878/control/` and enter the token once. The server refuses to start on the LAN without a 12+ character token.

## Troubleshooting

- **Port in use**: another copy is running, or set `PSK_PORT=7879`. If you change the port, OBS URLs and the Spotify redirect URI change too.
- **Sprites show a Poké Ball outline**: the first download failed (offline). It retries after a minute, and once cached a sprite works offline.
- **Corrupt `data/state.json`**: it's backed up as `state.json.corrupt-<time>` and a fresh state starts.
