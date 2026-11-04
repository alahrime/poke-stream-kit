// Spotify "now playing": Authorization Code + PKCE, refresh-token rotation, polite polling.
import { randomBytes, createHash } from 'node:crypto';

const AUTH = 'https://accounts.spotify.com/authorize';
const TOKEN = 'https://accounts.spotify.com/api/token';
const NOW = 'https://api.spotify.com/v1/me/player/currently-playing';
const SCOPE = 'user-read-currently-playing';

export function pkcePair() {
  const verifier = randomBytes(64).toString('base64url').slice(0, 96);
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

export function parsePlayback(json) {
  const item = json?.item;
  if (!item || json.currently_playing_type !== 'track') return { status: 'idle', track: null, at: Date.now() };
  const images = [...(item.album?.images ?? [])].sort((a, b) => Math.abs(a.width - 300) - Math.abs(b.width - 300));
  return {
    status: json.is_playing ? 'playing' : 'paused',
    at: Date.now(),
    track: {
      title: item.name,
      artists: (item.artists ?? []).map((a) => a.name).join(', '),
      album: item.album?.name ?? '',
      art: images[0]?.url ?? null,
      url: item.external_urls?.spotify ?? null,
      durationMs: item.duration_ms,
      progressMs: json.progress_ms ?? 0,
    },
  };
}

export class Spotify {
  constructor({ cfg, secrets, saveSecrets, publish, hasListeners, fetchImpl = fetch }) {
    Object.assign(this, { cfg, secrets, saveSecrets, publish, hasListeners, fetch: fetchImpl });
    this.pending = new Map(); // oauth state -> { verifier, exp }
    this.access = null; // { token, exp }
    this.backoff = 0;
    this.timer = null;
  }

  get clientId() { return this.cfg.spotify?.clientId ?? ''; }
  get redirectUri() { return `http://127.0.0.1:${this.cfg.port}/spotify/callback`; }
  get refreshToken() { return this.secrets.spotify?.refreshToken ?? null; }

  loginUrl() {
    const { verifier, challenge } = pkcePair();
    const state = randomBytes(16).toString('hex');
    this.pending.set(state, { verifier, exp: Date.now() + 10 * 60e3 });
    const q = new URLSearchParams({
      client_id: this.clientId, response_type: 'code', redirect_uri: this.redirectUri,
      code_challenge_method: 'S256', code_challenge: challenge, scope: SCOPE, state,
    });
    return `${AUTH}?${q}`;
  }

  async handleCallback({ code, state, error }) {
    const p = this.pending.get(state);
    this.pending.delete(state);
    if (error) throw new Error(`Spotify said: ${error}`);
    if (!p || p.exp < Date.now()) throw new Error('login expired or state mismatch — try again');
    await this.tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: this.redirectUri, code_verifier: p.verifier });
    this.schedule(0);
  }

  async tokenRequest(params) {
    const res = await this.fetch(TOKEN, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: this.clientId, ...params }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (json.error === 'invalid_grant') this.logout();
      throw new Error(`token ${res.status} ${json.error ?? ''}`);
    }
    this.access = { token: json.access_token, exp: Date.now() + (json.expires_in - 60) * 1000 };
    if (json.refresh_token && json.refresh_token !== this.refreshToken) {
      this.secrets.spotify = { refreshToken: json.refresh_token }; // rotation: persist every new token
      this.saveSecrets(this.secrets);
    }
  }

  async token() {
    if (!this.access || this.access.exp < Date.now()) {
      await this.tokenRequest({ grant_type: 'refresh_token', refresh_token: this.refreshToken });
    }
    return this.access.token;
  }

  logout() {
    this.access = null;
    delete this.secrets.spotify;
    this.saveSecrets(this.secrets);
    this.publish({ status: 'unauthed', track: null, at: Date.now() });
  }

  start() { this.schedule(0); }
  stop() { clearTimeout(this.timer); }
  schedule(ms) { clearTimeout(this.timer); this.timer = setTimeout(() => this.tick(), ms); this.timer.unref?.(); }

  async tick() {
    const pollMs = this.cfg.spotify?.pollMs ?? 5000;
    if (!this.clientId || !this.refreshToken) {
      this.publish({ status: this.clientId ? 'unauthed' : 'disabled', track: null, at: Date.now() });
      return this.schedule(30e3);
    }
    if (!this.hasListeners()) return this.schedule(pollMs); // nobody watching: don't spend rate limit
    try {
      let res = await this.fetch(NOW, { headers: { authorization: `Bearer ${await this.token()}` } });
      if (res.status === 401) { this.access = null; res = await this.fetch(NOW, { headers: { authorization: `Bearer ${await this.token()}` } }); }
      if (res.status === 429) {
        const wait = Math.max(1, Number(res.headers.get('retry-after')) || 30) * 1000;
        return this.schedule(wait);
      }
      if (res.status === 204) { this.publish(parsePlayback(null)); this.backoff = 0; return this.schedule(pollMs * 3); }
      if (!res.ok) throw new Error(`now-playing ${res.status}`);
      const data = parsePlayback(await res.json());
      this.publish(data);
      this.backoff = 0;
      this.schedule(data.status === 'playing' ? pollMs : pollMs * 3);
    } catch (e) {
      this.backoff = Math.min(60e3, (this.backoff || 2500) * 2);
      if (this.refreshToken) this.publish({ status: 'error', track: null, at: Date.now(), message: e.message });
      this.schedule(this.backoff);
    }
  }
}
