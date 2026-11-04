// Request guards for a localhost control API: DNS-rebinding (Host), CSRF (Origin + JSON), optional token.
import { timingSafeEqual, createHash } from 'node:crypto';

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);
const MIN_TOKEN = 12;

export function allowedHosts(cfg) {
  const hosts = new Set([`127.0.0.1:${cfg.port}`, `localhost:${cfg.port}`, `[::1]:${cfg.port}`]);
  if (cfg.host && cfg.host !== '0.0.0.0' && !LOOPBACK.has(cfg.host)) hosts.add(`${cfg.host}:${cfg.port}`);
  for (const h of cfg.allowedHosts ?? []) hosts.add(String(h).toLowerCase());
  return hosts;
}

const sameToken = (a, b) => {
  const h = (s) => createHash('sha256').update(String(s)).digest();
  return timingSafeEqual(h(a), h(b));
};

export function validateConfig(cfg) {
  if (!LOOPBACK.has(cfg.host) && (cfg.controlToken ?? '').length < MIN_TOKEN) {
    throw new Error(`host "${cfg.host}" exposes the server to your network: set a controlToken of ${MIN_TOKEN}+ characters in data/config.local.json`);
  }
}

// Returns null when allowed, else { status, msg }.
export function checkRequest(req, cfg) {
  const hosts = allowedHosts(cfg);
  const host = String(req.headers.host ?? '').toLowerCase();
  if (!hosts.has(host)) return { status: 403, msg: 'host not allowed' };
  if (req.method === 'GET' || req.method === 'HEAD') return null;

  const origin = req.headers.origin;
  if (origin !== undefined && !Array.from(hosts).some((h) => origin === `http://${h}`)) {
    return { status: 403, msg: 'origin not allowed' };
  }
  if (!String(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
    return { status: 415, msg: 'content-type must be application/json' };
  }
  if (cfg.controlToken && !sameToken(req.headers['x-control-token'] ?? '', cfg.controlToken)) {
    return { status: 401, msg: 'control token required' };
  }
  return null;
}

export function checkHotkey(token, cfg) {
  if (!cfg.controlToken) return { status: 403, msg: 'hotkeys need a controlToken in config' };
  if (!sameToken(token ?? '', cfg.controlToken)) return { status: 401, msg: 'bad token' };
  return null;
}
