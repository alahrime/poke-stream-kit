import { searchDex } from '/shared/search.js';
import { TYPE_COLORS } from '/shared/theme.js';

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };

let state = null;
let dex = [];
let dexById = new Map();
let selectedSlot = 0;

// ---- API ----
const tokenKey = 'psk-token';
const getToken = () => { try { return localStorage.getItem(tokenKey) ?? ''; } catch { return ''; } };
async function api(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-control-token': getToken() },
    body: JSON.stringify(body ?? {}),
  });
  if (res.status === 401) {
    const t = prompt('Control token (from data/config.local.json):');
    if (t) { try { localStorage.setItem(tokenKey, t); } catch {} return api(path, body); }
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) { toast(json.error ?? `Error ${res.status}`); throw new Error(json.error); }
  return json;
}
const op = (o) => api('/api/op', o).catch(() => {});

let toastTimer;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

// ---- Render ----
function render() {
  if (!state) return;
  const { record, elo, session } = state;
  $('score').textContent = `${record.wins} - ${record.losses}`;
  const full = record.wins + record.losses >= 5;
  $('win').disabled = $('loss').disabled = full;
  $('endSet').classList.toggle('primary', full);
  $('history').replaceChildren(...record.history.slice(-6).reverse().map((h) =>
    el('li', { className: h.wins > h.losses ? 'w' : 'l', textContent: `${h.wins} - ${h.losses}` })));

  $('eloNow').textContent = elo.current ?? '—';
  $('eloDelta').textContent = elo.delta == null ? '' : `${elo.delta >= 0 ? '+' : ''}${elo.delta} this stream`;
  $('eloDelta').className = `delta ${elo.delta > 0 ? 'up' : elo.delta < 0 ? 'down' : ''}`;
  $('session').textContent = session.active ? 'End stream' : 'Start stream';
  $('session').classList.toggle('live', session.active);

  if (document.activeElement !== $('league')) $('league').value = state.league ?? 'great';
  renderSlots();
}

function renderSlots() {
  const members = state.team.view;
  $('slots').replaceChildren(...[0, 1, 2].map((i) => {
    const m = members[i];
    const slot = el('div', { className: `slot${i === selectedSlot ? ' selected' : ''}${m?.shadow ? ' shadow' : ''}`, tabIndex: 0 });
    slot.onclick = () => { selectedSlot = i; renderSlots(); $('search').focus(); };
    if (!m) { slot.append(el('div', { className: 'empty', textContent: `Slot ${i + 1}` })); return slot; }
    const img = el('img', { src: m.sprite, alt: '', width: 64, height: 64 });
    const types = el('div', { className: 'types' }, ...m.types.map((t) => el('span', { className: 'type', textContent: t, style: `background:${TYPE_COLORS[t]}` })));
    const shadowBtn = el('button', { className: `mini${m.shadow ? ' on' : ''}`, textContent: 'Shadow', title: 'Toggle shadow' });
    shadowBtn.onclick = (e) => { e.stopPropagation(); setTeam(members.map((x, j) => ({ id: x.id, shadow: j === i ? !x.shadow : x.shadow }))); };
    const rm = el('button', { className: 'mini ghost', textContent: '✕', title: 'Remove', ariaLabel: `Remove ${m.name}` });
    rm.onclick = (e) => { e.stopPropagation(); setTeam(members.filter((_, j) => j !== i).map(({ id, shadow }) => ({ id, shadow }))); };
    slot.append(img, el('div', { className: 'name', textContent: m.name }), types, el('div', { className: 'row tight' }, shadowBtn, rm));
    return slot;
  }));
}

const setTeam = (members, name = '') => op({ op: 'team.set', members, name });

function pick(p) {
  const members = state.team.view.map(({ id, shadow }) => ({ id, shadow }));
  const slot = Math.min(selectedSlot, members.length);
  members[slot] = { id: p.i, shadow: false };
  setTeam(members.slice(0, 3));
  selectedSlot = Math.min(slot + 1, 2);
  $('search').value = ''; $('results').replaceChildren();
}

// ---- Search ----
let active = 0, hits = [];
function showResults() {
  hits = searchDex(dex, $('search').value);
  active = 0;
  $('results').replaceChildren(...hits.map((p, i) => {
    const li = el('li', { role: 'option', className: i === active ? 'active' : '' },
      el('img', { src: `/sprite/${p.i}`, alt: '', width: 32, height: 32, loading: 'lazy' }),
      el('span', { textContent: p.d }),
      el('small', { textContent: p.t.join(' / ') }));
    li.onmousedown = (e) => { e.preventDefault(); pick(p); };
    return li;
  }));
}
$('search').addEventListener('input', showResults);
$('search').addEventListener('keydown', (e) => {
  if (!hits.length) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    active = (active + (e.key === 'ArrowDown' ? 1 : hits.length - 1)) % hits.length;
    [...$('results').children].forEach((li, i) => li.classList.toggle('active', i === active));
  } else if (e.key === 'Enter') { e.preventDefault(); pick(hits[active]); }
  else if (e.key === 'Escape') { $('results').replaceChildren(); }
});
$('search').addEventListener('blur', () => setTimeout(() => $('results').replaceChildren(), 150));

// ---- Presets ----
let presets = [];
async function loadPresets(data) {
  presets = (data ?? await (await fetch('/api/teams')).json()).teams;
  const sel = $('presetSelect'), cur = sel.value;
  sel.replaceChildren(el('option', { value: '', textContent: 'Saved teams…' }),
    ...presets.map((t) => el('option', { value: t.name, textContent: `${t.name} — ${t.members.map((m) => dexById.get(m.id)?.d ?? m.id).join(', ')}` })));
  sel.value = presets.some((t) => t.name === cur) ? cur : '';
}
$('presetLoad').onclick = () => { const t = presets.find((x) => x.name === $('presetSelect').value); if (t) setTeam(t.members, t.name); };
$('presetSelect').onchange = () => $('presetLoad').click();
$('presetDelete').onclick = async () => {
  const name = $('presetSelect').value;
  if (name && confirm(`Delete saved team "${name}"?`)) loadPresets(await api('/api/teams/delete', { name }));
};
$('presetForm').onsubmit = async (e) => {
  e.preventDefault();
  const members = state.team.view.map(({ id, shadow }) => ({ id, shadow }));
  if (!members.length) return toast('Pick some Pokémon first');
  const name = $('presetName').value.trim();
  await loadPresets(await api('/api/teams/save', { name, members }));
  $('presetSelect').value = name; $('presetName').value = ''; toast(`Saved "${name}"`);
};

// ---- Buttons & keys ----
$('win').onclick = () => op({ op: 'record.win' });
$('loss').onclick = () => op({ op: 'record.loss' });
$('endSet').onclick = () => op({ op: 'record.endSet' });
$('undo').onclick = () => op({ op: 'undo' });
$('session').onclick = () => {
  if (state.session.active) { if (confirm('End stream session? (resets "today" ELO delta)')) op({ op: 'session.end' }); }
  else op({ op: 'session.start' });
};
$('league').onchange = (e) => op({ op: 'league.set', league: e.target.value });
$('eloForm').onsubmit = (e) => { e.preventDefault(); op({ op: 'elo.set', value: Number($('eloInput').value) }).then(() => { $('eloInput').value = ''; }); };
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, select, textarea')) return;
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); return $('undo').click(); }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 'w') $('win').click(); else if (k === 'l') $('loss').click(); else if (k === 'e') $('endSet').click();
});

// ---- Spotify ----
const SPOTIFY_TEXT = {
  disabled: 'Not configured — add spotify.clientId to data/config.local.json (see docs/SETUP.md).',
  unauthed: 'Not connected. Click Connect (must be done on the streaming PC).',
  idle: 'Connected — nothing playing.', playing: 'Playing', paused: 'Paused', error: 'Connection problem — retrying…',
};
function renderSpotify(sp) {
  const s = SPOTIFY_TEXT[sp.status] ?? sp.status;
  $('spotifyStatus').textContent = sp.track ? `${s}: ${sp.track.title} — ${sp.track.artists}` : s;
  $('spotifyLogin').hidden = !['unauthed'].includes(sp.status);
  $('spotifyLogout').hidden = ['unauthed', 'disabled'].includes(sp.status);
}
$('spotifyLogout').onclick = () => api('/api/spotify/logout');

// ---- OBS sources ----
const SOURCES = [['scene', 1920, 1080, 'All widgets, top-right'], ['background', 1920, 1080, 'Type-themed backdrop'], ['elo', 360, 140], ['record', 300, 160], ['team', 440, 200], ['analysis', 440, 420], ['spotify', 480, 110]];
$('sources').replaceChildren(...SOURCES.map(([n, w, h, note]) => {
  const url = `${location.origin.replace('localhost', '127.0.0.1')}/overlay/${n}`;
  const copy = el('button', { className: 'mini', textContent: 'Copy' });
  copy.onclick = () => navigator.clipboard?.writeText(url).then(() => toast('Copied'), () => toast(url));
  return el('tr', {}, el('td', {}, el('a', { href: `/overlay/${n}?demo=1`, target: '_blank', textContent: n })), el('td', { textContent: `${w}×${h}` }), el('td', { className: 'muted', textContent: note ?? '' }), el('td', {}, copy));
}));

// ---- Boot ----
dex = await (await fetch('/shared/dex.json')).json();
dexById = new Map(dex.map((p) => [p.i, p]));
loadPresets();
const es = new EventSource('/events?role=control');
es.onopen = () => $('conn').classList.add('on');
es.onerror = () => $('conn').classList.remove('on');
es.addEventListener('state', (e) => { state = JSON.parse(e.data); render(); });
es.addEventListener('spotify', (e) => renderSpotify(JSON.parse(e.data)));
