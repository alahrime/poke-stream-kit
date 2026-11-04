# poke-stream-kit

OBS overlays for Pokémon GO PvP streams, driven from a control panel you can open on your laptop or phone.

| Overlay | What it shows |
|---|---|
| `elo` | Current rating + "+37 today" since you pressed **Start stream** |
| `record` | Current set as `x - y` (GBL set = 5 battles), pips, sets won today |
| `team` | 3 sprites of your active party (search by name, form or dex #; Shadow toggle; saved teams) |
| `analysis` | Types that hit 2+ of your team super-effectively (built-in GO type chart, or paragon2) |
| `spotify` | Now playing (art, title, artist, progress) |
| `background` | Full-screen backdrop that recolours to your team's types |
| `scene` | All widgets on one 1920×1080 transparent layer (one source = easiest on a laptop) |

```bash
npm start            # then open http://127.0.0.1:7878/control/
```

No `npm install` is needed. It has zero dependencies and requires Node 20+.

- Setup on a new machine, OBS, Spotify and phone control: **[docs/SETUP.md](docs/SETUP.md)**
- paragon2 / Stream Deck / hotkeys: **[docs/INTEGRATIONS.md](docs/INTEGRATIONS.md)**
- Growing the channel (Twitch features roadmap): **[docs/TWITCH-GROWTH.md](docs/TWITCH-GROWTH.md)**
