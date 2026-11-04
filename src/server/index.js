#!/usr/bin/env node
import { createApp } from './app.js';

try {
  const app = await createApp();
  const { port, host } = app.cfg;
  const base = `http://127.0.0.1:${port}`;
  console.log(`poke-stream-kit running
  Control panel : ${base}/control/
  OBS sources   : ${base}/overlay/{elo,record,team,spotify,analysis,scene}
  Bound to      : ${host}:${port}`);
  const shutdown = async () => { await app.close(); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch (e) {
  console.error(`Failed to start: ${e.code === 'EADDRINUSE' ? 'port already in use (is another copy running?)' : e.message}`);
  process.exit(1);
}
