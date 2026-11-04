// JSON persistence: atomic writes (tmp + rename, Windows EPERM retry), corrupt-file backup.
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function loadJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    const backup = `${path}.corrupt-${Date.now()}`;
    try { copyFileSync(path, backup); } catch {}
    console.warn(`[persist] ${path} unreadable (${e.message}); backed up to ${backup}`);
    return fallback;
  }
}

export function saveJsonAtomic(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  for (let i = 0; ; i++) {
    try { return renameSync(tmp, path); } catch (e) {
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(e.code) || i >= 4) throw e;
      const until = Date.now() + 25 * (i + 1); while (Date.now() < until); // brief sync backoff (AV/indexer locks)
    }
  }
}

// Coalesces bursts of writes (e.g. rapid W/L clicks) into one write.
export function debouncedSaver(path, ms = 150) {
  let timer = null, pending;
  const flush = () => { clearTimeout(timer); timer = null; if (pending !== undefined) { saveJsonAtomic(path, pending); pending = undefined; } };
  const save = (data) => { pending = data; if (!timer) timer = setTimeout(flush, ms); };
  save.flush = flush;
  return save;
}
