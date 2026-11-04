// Committed defaults (config/config.json) deep-merged with per-device overrides (data/config.local.json).
import { join } from 'node:path';
import { loadJson } from './persist.js';

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
export function merge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b ?? {})) out[k] = isObj(v) && isObj(a?.[k]) ? merge(a[k], v) : v;
  return out;
}

export function loadConfig({ configDir, dataDir, overrides = {} }) {
  const env = {};
  if (process.env.PSK_PORT) env.port = Number(process.env.PSK_PORT);
  if (process.env.PSK_HOST) env.host = process.env.PSK_HOST;
  if (process.env.PSK_CONTROL_TOKEN) env.controlToken = process.env.PSK_CONTROL_TOKEN;
  return [loadJson(join(configDir, 'config.json'), {}), loadJson(join(dataDir, 'config.local.json'), {}), env, overrides]
    .reduce(merge, { port: 7878, host: '127.0.0.1', allowedHosts: [], controlToken: '', spotify: {}, paragon2: {}, sprites: {} });
}
