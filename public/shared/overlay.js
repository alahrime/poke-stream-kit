// Overlay runtime: one SSE connection per page, widgets render slices of the view.
// Query params: ?demo=1 (fake data, no server), ?theme=0 (ignore type theme).
import { TYPE_COLORS } from './theme.js';

const $ = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const bump = (el) => { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); };
const typeChip = (t) => { const c = $('span', 'type', t); c.style.background = TYPE_COLORS[t] ?? '#666'; return c; };

const widgets = {
  elo: {
    mount(root) {
      const card = $('div', 'card elo');
      card.append($('div', 'label', 'ELO'), $('div', 'big value', '—'), $('div', 'delta'));
      root.append(card);
      return card;
    },
    update(card, { state }) {
      if (!state) return;
      const v = card.querySelector('.value'), d = card.querySelector('.delta');
      const text = state.elo.current ?? '—';
      if (v.textContent !== String(text)) { v.textContent = text; bump(v); }
      const delta = state.elo.delta;
      d.textContent = delta == null ? '' : `${delta >= 0 ? '+' : ''}${delta} today`;
      d.className = `delta ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}`;
    },
  },

  record: {
    mount(root) {
      const card = $('div', 'card record');
      card.append($('div', 'label', 'SET'), $('div', 'big score', '0 - 0'), $('div', 'pips'), $('div', 'sets'));
      root.append(card);
      return card;
    },
    update(card, { state }) {
      if (!state) return;
      const { wins, losses, history } = state.record;
      const s = card.querySelector('.score');
      const text = `${wins} - ${losses}`;
      if (s.textContent !== text) { s.textContent = text; bump(s); }
      const pips = card.querySelector('.pips');
      pips.replaceChildren(...Array.from({ length: 5 }, (_, i) => $('i', i < wins ? 'w' : i < wins + losses ? 'l' : '')));
      const since = state.session.active ? state.session.startedAt : 0;
      const sets = history.filter((h) => h.endedAt >= since);
      const won = sets.filter((h) => h.wins > h.losses).length;
      card.querySelector('.sets').textContent = sets.length ? `Sets ${won}-${sets.length - won}` : '';
    },
  },

  team: {
    mount(root) {
      const card = $('div', 'card team');
      root.append(card);
      return card;
    },
    update(card, { state }) {
      if (!state) return;
      const key = state.teamHash;
      if (card.dataset.key === key) return;
      card.dataset.key = key;
      card.hidden = !state.team.view.length;
      card.replaceChildren(...state.team.view.map((m) => {
        const slot = $('div', `mon${m.shadow ? ' shadow' : ''}`);
        const img = $('img'); img.src = m.sprite; img.alt = m.name;
        const types = $('div', 'types'); types.append(...m.types.map(typeChip));
        slot.append(img, $('div', 'name', (m.shadow ? 'Shadow ' : '') + m.name), types);
        return slot;
      }));
      bump(card);
    },
  },

  analysis: {
    mount(root) {
      const card = $('div', 'card analysis');
      card.append($('div', 'label', 'TEAM WEAK TO'), $('div', 'chips'), $('div', 'notes'));
      root.append(card);
      return card;
    },
    update(card, { state, analysis }) {
      if (!state) return;
      const ext = analysis && analysis.teamHash === state.teamHash ? analysis : null;
      const list = ext ? ext.weaknesses : state.weaknesses;
      card.hidden = !state.team.view.length;
      card.querySelector('.chips').replaceChildren(...(list.length ? list.map((w) => typeChip(w.type)) : [$('span', 'muted', 'No shared weaknesses')]));
      card.querySelector('.notes').textContent = ext?.notes ?? '';
    },
  },

  spotify: {
    mount(root) {
      const card = $('div', 'card spotify');
      const art = $('img', 'art'); art.alt = '';
      const meta = $('div', 'meta');
      meta.append($('div', 'title'), $('div', 'artist'), $('div', 'bar'));
      meta.querySelector('.bar').append($('i'));
      card.append(art, meta);
      card.hidden = true;
      root.append(card);
      // Progress bar: animate only while playing and visible (OBS sources stay loaded for hours).
      const bar = card.querySelector('.bar i');
      const pctOf = (sp) => Math.min(100, ((sp.track.progressMs + (sp.status === 'playing' ? Date.now() - sp.at : 0)) / sp.track.durationMs) * 100);
      const tick = () => {
        const sp = card._sp;
        if (!sp?.track || card.hidden) { card._raf = null; return; }
        bar.style.width = `${pctOf(sp).toFixed(1)}%`;
        card._raf = sp.status === 'playing' ? requestAnimationFrame(tick) : null;
      };
      card._kick = () => { if (!card._raf) card._raf = requestAnimationFrame(tick); };
      return card;
    },
    update(card, { spotify }) {
      if (!spotify) return;
      card._sp = spotify;
      const show = (spotify.status === 'playing' || spotify.status === 'paused') && spotify.track;
      card.hidden = !show;
      if (!show) return;
      card._kick();
      card.classList.toggle('paused', spotify.status === 'paused');
      const t = spotify.track;
      if (card.querySelector('.title').textContent !== t.title) bump(card);
      card.querySelector('.title').textContent = t.title;
      card.querySelector('.artist').textContent = t.artists;
      const art = card.querySelector('.art');
      if (t.art && art.src !== t.art) art.src = t.art;
      art.hidden = !t.art;
    },
  },

  background: {
    mount(root) { const bg = $('div', 'bg'); bg.append($('i', 'b1'), $('i', 'b2')); root.append(bg); return bg; },
    update() {},
  },
};

const DEMO = {
  state: {
    elo: { current: 2614, delta: 37 },
    session: { active: true, startedAt: 0 },
    record: { wins: 3, losses: 1, history: [{ wins: 4, losses: 1, endedAt: 1 }, { wins: 2, losses: 3, endedAt: 2 }] },
    teamHash: 'demo',
    team: { view: [
      { id: 10180, name: 'Galarian Stunfisk', types: ['ground', 'steel'], shadow: false, sprite: '/sprite/10180' },
      { id: 184, name: 'Azumarill', types: ['water', 'fairy'], shadow: false, sprite: '/sprite/184' },
      { id: 308, name: 'Medicham', types: ['fighting', 'psychic'], shadow: true, sprite: '/sprite/308' },
    ] },
    theme: { vars: { '--accent': TYPE_COLORS.water, '--accent-2': TYPE_COLORS.steel } },
    weaknesses: [{ type: 'ground' }],
  },
  spotify: { status: 'playing', at: Date.now(), track: { title: 'Victory Road (Lo-fi)', artists: 'Stream Beats', progressMs: 42000, durationMs: 180000, art: null } },
  analysis: null,
};

export function boot(names) {
  const params = new URLSearchParams(location.search);
  const root = document.getElementById('root');
  const mounted = names.map((n) => [widgets[n], widgets[n].mount(root)]);
  const data = { state: null, spotify: null, analysis: null };
  const render = () => {
    if (data.state?.theme && params.get('theme') !== '0') {
      for (const [k, v] of Object.entries(data.state.theme.vars)) document.documentElement.style.setProperty(k, v);
    }
    for (const [w, el] of mounted) w.update(el, data);
  };
  if (params.get('demo') === '1') { Object.assign(data, DEMO); return render(); }
  const es = new EventSource('/events'); // auto-reconnects; last frame stays on screen meanwhile
  for (const topic of Object.keys(data)) {
    es.addEventListener(topic, (e) => { data[topic] = JSON.parse(e.data); render(); });
  }
}
