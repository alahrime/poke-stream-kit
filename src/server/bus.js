// Server-Sent Events hub. Every connect gets a snapshot of each topic (OBS sources reconnect often).
export class Bus {
  constructor({ heartbeatMs = 15000 } = {}) {
    this.clients = new Set();
    this.overlays = new Set(); // clients that render overlays (control panels connect with ?role=control)
    this.last = new Map();
    this.hb = setInterval(() => this.write(': ping\n\n'), heartbeatMs);
    this.hb.unref();
  }
  get size() { return this.clients.size; }
  get overlayCount() { return this.overlays.size; }
  frame(topic, data) { return `event: ${topic}\ndata: ${JSON.stringify(data)}\n\n`; }
  write(chunk) { for (const res of this.clients) res.write(chunk); }
  publish(topic, data) { this.last.set(topic, data); this.write(this.frame(topic, data)); }
  attach(req, res) {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    res.write('retry: 2000\n\n');
    for (const [topic, data] of this.last) res.write(this.frame(topic, data));
    this.clients.add(res);
    if (!/[?&]role=control\b/.test(req.url ?? '')) this.overlays.add(res);
    req.on('close', () => { this.clients.delete(res); this.overlays.delete(res); });
  }
  close() { clearInterval(this.hb); for (const res of this.clients) res.end(); this.clients.clear(); this.overlays.clear(); }
}
