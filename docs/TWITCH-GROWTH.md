# Twitch growth roadmap

Ordered by what you can use **today**, with features that need Affiliate later.

## Now (no Affiliate needed)
- **Consistent schedule**, with the same title format each time, e.g. `GBL Open Great League | 2614 → 2800? | !team`. The ELO and set widgets make every stream a visible "run", which gives viewers a reason to stay.
- **Chat commands** via a local bot like Streamer.bot, or Nightbot/StreamElements: `!team`, `!elo`, `!record`, `!discord`. Streamer.bot runs on your PC and can read `http://127.0.0.1:7878/api/state` for live answers. A cloud bot can't reach your PC.
- **Follow / raid alerts** with StreamElements or Streamer.bot as a browser source. Thank every raid by name.
- **Clips + shorts**: big comebacks (0-2 → 3-2) are your best clips. The record widget makes them self-explanatory on TikTok/Shorts.
- **Networking**: raid other GO PvP streamers at the end of a stream, and join GO community Discords.

## Affiliate (50 followers, 500 minutes across 7+ days, average 3 viewers within 30 days)
- **Channel points** redemptions that hook into this kit, e.g. "Pick my lead", "Viewer picks the next team" (from saved teams), "Shadow-only set".
- **Predictions**: "Will this set be 3-2 or better?" can be resolved from the record widget.
- **Emotes**: Affiliates get emote slots. A shiny-sparkle emote and a "3-2 hype" emote suit the content.

## Phase 2 in this repo (planned)
`src/integrations/twitch.js` will use Twitch EventSub over WebSocket, so no public URL is needed. It will publish `alert` events on the same SSE bus for an `alerts` overlay, and map redemptions to commands (`team.set` from a preset, and so on).
