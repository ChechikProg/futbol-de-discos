'use strict';
/* ===== Base de la interfaz: utilidades, controles, entrada, sonido, dibujo y bucle ===== */
const $ = id => document.getElementById(id);
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const k in props) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'hidden') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}
const clearEl = el => { while (el.firstChild) el.removeChild(el.firstChild); };
const clampN = (v, a, b) => (v < a ? a : v > b ? b : v);

const store = {
  get(k, d) { try { const v = localStorage.getItem('fdd-' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('fdd-' + k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } },
  del(k) { try { localStorage.removeItem('fdd-' + k); } catch (e) { /* ok */ } }
};

const COL = { bg: '#111815', box: '#56704a', pitch: '#6e8d5a', line: '#c7e6bd', ink: '#101412', hud: 'rgba(8,12,10,.84)' };
const KIT_DEFAULT = ['#e56e56', '#5689e5'];
const FONT = '"Chakra Petch", system-ui, sans-serif';
const BODY = '"Barlow", system-ui, sans-serif';
const TAU = Math.PI * 2;
const SND = { on: store.get('sound', true) !== false };

/* ---------- Cancha ---------- */
function pitchResolve(spec) {
  if (spec && PITCHES[spec.preset]) { const q = PITCHES[spec.preset]; return { W: q.W, H: q.H, gh: q.gh }; }
  if (spec && spec.W) return { W: +spec.W, H: +spec.H, gh: +spec.gh };
  return { W: 370, H: 170, gh: 64 };
}
function pitchValid(spec) {
  if (spec && PITCHES[spec.preset]) return { preset: spec.preset };
  if (spec && isFinite(+spec.W) && isFinite(+spec.H) && isFinite(+spec.gh)) {
    const H = clampN(Math.round(+spec.H), PITCH_LIMITS.H[0], PITCH_LIMITS.H[1]);
    return { W: clampN(Math.round(+spec.W), PITCH_LIMITS.W[0], PITCH_LIMITS.W[1]), H, gh: clampN(Math.round(+spec.gh), PITCH_LIMITS.gh[0], Math.min(PITCH_LIMITS.gh[1], H - 25)) };
  }
  return { preset: 'classic' };
}
function pitchText(spec) {
  if (spec && PITCHES[spec.preset]) return PITCHES[spec.preset].label;
  const r = pitchResolve(spec);
  return 'Personalizada ' + r.W * 2 + '×' + r.H * 2;
}

/* ---------- Controles reutilizables ---------- */
function segGroup(prefix, def, obj, onChange) {
  const fs = h('fieldset', { class: 'grp g-' + def.key });
  fs.append(h('legend', { text: def.label }));
  const seg = h('div', { class: 'seg' });
  const inputs = {};
  let hint = null;
  const refresh = () => {
    for (const v in inputs) inputs[v].checked = String(obj[def.key]) === v;
    if (hint) hint.textContent = def.hints[obj[def.key]] || '';
  };
  for (const o of def.opts) {
    const v = o[0], id = prefix + '-' + def.key + '-' + v;
    const inp = h('input', { type: 'radio', name: prefix + '-' + def.key, value: v, id });
    inp.addEventListener('change', () => { obj[def.key] = v; refresh(); if (onChange) onChange(def.key, v); });
    inputs[v] = inp;
    seg.append(inp, h('label', { for: id, text: o[1], 'data-tone': o[2] }));
  }
  fs.append(seg);
  if (def.hints) { hint = h('p', { class: 'hint' }); fs.append(hint); }
  refresh();
  fs.refresh = refresh;
  return fs;
}

function pitchGroup(prefix, getSpec, setSpec) {
  let cur = pitchValid(getSpec());
  const fs = h('fieldset', { class: 'grp g-pitch' });
  fs.append(h('legend', { text: 'Tamaño de la cancha' }));
  const seg = h('div', { class: 'seg' });
  const inputs = {};
  const opts = Object.keys(PITCHES).map(k => [k, PITCHES[k].label]).concat([['custom', 'Personalizada']]);
  const info = h('p', { class: 'hint pitch-info' });
  const prev = h('div', { class: 'pitch-prev', 'aria-hidden': 'true' });
  const sliders = h('div', { class: 'sliders' });
  const rows = {};
  const defs = [['W', 'Largo', PITCH_LIMITS.W], ['H', 'Ancho', PITCH_LIMITS.H], ['gh', 'Boca del arco', PITCH_LIMITS.gh]];

  const paintPreview = r => {
    const s = 0.1, pw = r.W * 2 * s, ph = r.H * 2 * s, gw = r.gh * 2 * s, x0 = 82 - pw / 2, y0 = 42 - ph / 2;
    prev.innerHTML =
      '<svg viewBox="0 0 164 84" width="164" height="84"><rect x="' + x0 + '" y="' + y0 + '" width="' + pw + '" height="' + ph + '" class="pv-field"/>' +
      '<line x1="82" y1="' + y0 + '" x2="82" y2="' + (y0 + ph) + '" class="pv-line"/>' +
      '<circle cx="82" cy="42" r="' + Math.min(ph / 2 - 1, Math.max(4, ph * 0.22)) + '" class="pv-line pv-circle"/>' +
      '<rect x="' + (x0 - 4) + '" y="' + (42 - gw / 2) + '" width="4" height="' + gw + '" class="pv-goal pv-red"/>' +
      '<rect x="' + (x0 + pw) + '" y="' + (42 - gw / 2) + '" width="4" height="' + gw + '" class="pv-goal pv-blue"/></svg>';
  };
  const sync = () => {
    const r = pitchResolve(cur), custom = !PITCHES[cur.preset];
    for (const v in inputs) inputs[v].checked = (v === 'custom') === custom && (custom || v === cur.preset);
    sliders.hidden = !custom;
    for (const k in rows) { rows[k].inp.value = r[k]; rows[k].out.textContent = r[k] * 2; }
    info.textContent = (custom ? 'Personalizada' : PITCHES[cur.preset].label) + ' · ' + r.W * 2 + ' × ' + r.H * 2 + ' · arco de ' + r.gh * 2;
    paintPreview(r);
  };
  for (const [v, text] of opts) {
    const id = prefix + '-pitch-' + v;
    const inp = h('input', { type: 'radio', name: prefix + '-pitch', value: v, id });
    inp.addEventListener('change', () => {
      if (v === 'custom') { const r = pitchResolve(cur); cur = { W: r.W, H: r.H, gh: r.gh }; } else cur = { preset: v };
      sync(); setSpec(cur);
    });
    inputs[v] = inp;
    seg.append(inp, h('label', { for: id, text }));
  }
  for (const [k, label, lim] of defs) {
    const out = h('output', { text: '' });
    const inp = h('input', { type: 'range', min: lim[0], max: lim[1], step: 5, id: prefix + '-pitch-' + k, 'aria-label': label });
    inp.addEventListener('input', () => {
      const r = pitchResolve(cur);
      r[k] = +inp.value;
      cur = pitchValid(r); sync();
    });
    inp.addEventListener('change', () => setSpec(cur));
    rows[k] = { inp, out };
    sliders.append(h('label', { class: 'slider', for: prefix + '-pitch-' + k }, h('span', { text: label }), inp, out));
  }
  fs.append(seg, h('div', { class: 'pitch-row' }, prev, info), sliders);
  sync();
  fs.update = spec => { cur = pitchValid(spec); sync(); };
  return fs;
}

/* ---------- Pantallas ---------- */
const SCREENS = {};
let currentScreen = null;
function mkScreen(id, cls) {
  const el = h('section', { class: 'screen ' + (cls || ''), id, hidden: true });
  SCREENS[id] = el;
  document.body.append(el);
  return el;
}
function showScreen(id) {
  for (const k in SCREENS) SCREENS[k].hidden = k !== id;
  currentScreen = id;
  if (id && SCREENS[id]) SCREENS[id].scrollTop = 0;
}
function card(cls) { return h('div', { class: 'card ' + (cls || '') }); }

/* ---------- Estado de juego ---------- */
const cv = $('cv'), g2 = cv.getContext('2d');
let dpr = 1, VW = 0, VH = 0;
let game = null;          // partida local (contra la máquina o Mundial)
let view = null;          // lo que se está dibujando
let mode = 'none';        // 'local' | 'wc' | 'pens'
let state = 'idle';       // 'idle' | 'playing' | 'paused' | 'ended'
let acc = 0, lastT = 0;
const keys = {};
const tin = { dx: 0, dy: 0, kick: false, active: false };
const isTouch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  VW = window.innerWidth; VH = window.innerHeight;
  cv.width = Math.round(VW * dpr); cv.height = Math.round(VH * dpr);
}
window.addEventListener('resize', resize);

function setState(s) {
  state = s;
  $('pauseBtn').hidden = s !== 'playing';
  $('touch').hidden = !((s === 'playing') && isTouch);
  $('kickBtn').style.display = mode === 'pens' ? 'none' : '';     // en los penales se patea solo al tocar la pelota
  if (s === 'playing') showScreen(null);
  else if (s === 'paused') showScreen('pause');
  else if (s === 'ended') showScreen('end');
  if (s !== 'playing') { for (const k in keys) keys[k] = false; releaseTouch(); }
  if (s === 'idle') { $('pauseBtn').hidden = true; view = null; mode = 'none'; }
}

/* ---------- Entrada ---------- */
const MOVE = { ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd' };
const KICK = { KeyX: 1, Space: 1, KeyZ: 1, ShiftLeft: 1, ShiftRight: 1 };
window.addEventListener('keydown', e => {
  const tag = (e.target && e.target.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA') {
    if (e.code === 'Escape' && state === 'paused') { e.preventDefault(); resumeGame(); }
    return;
  }
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (state === 'playing') { pauseGame(); e.preventDefault(); return; }
    if (state === 'paused') { resumeGame(); e.preventDefault(); return; }
  }
  if (state !== 'playing') return;
  if (MOVE[e.code]) { keys[MOVE[e.code]] = true; e.preventDefault(); }
  else if (KICK[e.code]) { keys.k = true; e.preventDefault(); }
});
window.addEventListener('keyup', e => {
  if (MOVE[e.code]) keys[MOVE[e.code]] = false;
  else if (KICK[e.code]) keys.k = false;
});
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'playing') pauseGame(); });

let stickId = null, kickId = null, sx0 = 0, sy0 = 0;
const base = $('stickBase'), knob = $('stickKnob'), kickBtn = $('kickBtn');
function releaseTouch() {
  stickId = kickId = null; tin.dx = tin.dy = 0; tin.kick = false; tin.active = false;
  base.classList.remove('on'); kickBtn.classList.remove('on');
}
window.addEventListener('touchstart', e => {
  if (state !== 'playing') return;
  let used = false;
  for (const t of e.changedTouches) {
    if (t.target.closest && t.target.closest('#pauseBtn')) continue;
    if (t.target === kickBtn) { kickId = t.identifier; tin.kick = true; kickBtn.classList.add('on'); used = true; }
    else if (stickId === null && t.clientX < VW * 0.6) {
      stickId = t.identifier; sx0 = t.clientX; sy0 = t.clientY; tin.active = true; used = true;
      base.style.left = sx0 + 'px'; base.style.top = sy0 + 'px'; knob.style.transform = 'translate(-50%,-50%)'; base.classList.add('on');
    }
  }
  if (used) e.preventDefault();
}, { passive: false });
window.addEventListener('touchmove', e => {
  if (state !== 'playing') return;
  for (const t of e.changedTouches) {
    if (t.identifier !== stickId) continue;
    let dx = t.clientX - sx0, dy = t.clientY - sy0;
    const d = Math.hypot(dx, dy), R = 50;
    if (d > R) { dx = dx / d * R; dy = dy / d * R; }
    knob.style.transform = 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px))';
    const m = Math.hypot(dx, dy) / R;
    if (m < 0.2) { tin.dx = tin.dy = 0; } else { tin.dx = dx / R / m; tin.dy = dy / R / m; }
  }
  e.preventDefault();
}, { passive: false });
function touchEnd(e) {
  for (const t of e.changedTouches) {
    if (t.identifier === stickId) { stickId = null; tin.dx = tin.dy = 0; tin.active = false; base.classList.remove('on'); }
    if (t.identifier === kickId) { kickId = null; tin.kick = false; kickBtn.classList.remove('on'); }
  }
}
window.addEventListener('touchend', touchEnd);
window.addEventListener('touchcancel', touchEnd);

function readInput() {
  let dx = (keys.r ? 1 : 0) - (keys.l ? 1 : 0), dy = (keys.d ? 1 : 0) - (keys.u ? 1 : 0);
  if (tin.active && (tin.dx || tin.dy)) { dx = tin.dx; dy = tin.dy; }
  return { dx, dy, kick: !!(keys.k || tin.kick) };
}

/* ---------- Sonido ---------- */
let actx = null;
function unlockAudio() {
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
  } catch (e) { actx = null; }
}
function tone(freq, dur, type, vol, slide, delay) {
  if (!actx || !SND.on) return;
  try {
    const t0 = actx.currentTime + (delay || 0);
    const o = actx.createOscillator(), gn = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
    gn.gain.setValueAtTime(vol, t0); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(gn); gn.connect(actx.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  } catch (e) { /* ok */ }
}
function sound(t) {
  if (t === 'kick') tone(170, 0.09, 'triangle', 0.28, 60);
  else if (t === 'wall') tone(520, 0.04, 'square', 0.03, 300);
  else if (t === 'goal') { tone(392, 0.22, 'square', 0.07); tone(523, 0.22, 'square', 0.07, 0, 0.14); tone(659, 0.4, 'square', 0.07, 0, 0.28); }
  else if (t === 'end') { tone(880, 0.5, 'sine', 0.12, 840); tone(880, 0.5, 'sine', 0.12, 840, 0.6); }
}

/* ---------- Pausa ---------- */
let pauseOpts = null;
function pauseGame() {
  if (state !== 'playing') return;
  buildPause();
  setState('paused');
}
function resumeGame() {
  if (state !== 'paused') return;
  setState('playing');
  lastT = performance.now(); acc = 0;
}
function buildPause() {
  const c = SCREENS.pause.firstChild;
  clearEl(c);
  c.append(h('h2', { text: 'Pausa' }));
  const st = h('div', { class: 'stack' });
  st.append(h('button', { class: 'btn go', type: 'button', text: 'Seguir jugando', onclick: resumeGame }));
  for (const b of (pauseOpts ? pauseOpts() : [])) st.append(h('button', { class: 'btn', type: 'button', text: b.text, onclick: b.fn }));
  st.append(h('button', { class: 'btn', type: 'button', id: 'sndBtn', text: 'Sonido: ' + (SND.on ? 'sí' : 'no'), onclick: e => { SND.on = !SND.on; store.set('sound', SND.on); e.target.textContent = 'Sonido: ' + (SND.on ? 'sí' : 'no'); } }));
  c.append(st);
}
function showEnd(o) {
  const c = SCREENS.end.firstChild;
  clearEl(c);
  c.append(h('h2', { id: 'endTitle', 'data-res': o.res, text: o.title }));
  if (o.score) c.append(h('div', { id: 'endScore' }, h('b', { class: 'r', style: o.colors ? 'color:' + o.colors[0] : '', text: o.score[0] }), h('i', { text: '–' }), h('b', { class: 'b', style: o.colors ? 'color:' + o.colors[1] : '', text: o.score[1] })));
  if (o.names) c.append(h('p', { class: 'endnames' }, h('span', { text: o.names[0] }), h('span', { text: o.names[1] })));
  if (o.meta) c.append(h('p', { id: 'endMeta', text: o.meta }));
  const st = h('div', { class: 'stack' });
  for (const b of o.buttons) st.append(h('button', { class: 'btn' + (b.go ? ' go' : ''), type: 'button', text: b.text, onclick: b.fn }));
  c.append(st);
  setState('ended');
}
$('pauseBtn').addEventListener('click', () => { if (state === 'playing') pauseGame(); });
$('kickBtn').addEventListener('contextmenu', e => e.preventDefault());

/* ---------- Dibujo ---------- */
function rr(x, y, w, h2, r) {
  g2.beginPath(); g2.moveTo(x + r, y); g2.arcTo(x + w, y, x + w, y + h2, r); g2.arcTo(x + w, y + h2, x, y + h2, r);
  g2.arcTo(x, y + h2, x, y, r); g2.arcTo(x, y, x + w, y, r); g2.closePath();
}
function kitOf(G, team) { return (G.kits && G.kits[team]) || KIT_DEFAULT[team]; }
function inkOn(hex) {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#101412' : '#ffffff';
}

function drawPitch(G) {
  const geo = G.geo, W = geo.W, H = geo.H, gh = geo.gh, d = geo.d;
  g2.fillStyle = COL.box; g2.fillRect(-geo.boxW, -geo.boxH, geo.boxW * 2, geo.boxH * 2);
  g2.fillStyle = COL.pitch; g2.fillRect(-W, -H, W * 2, H * 2);
  for (const s of [-1, 1]) {
    const x0 = s > 0 ? W : -W - d;
    g2.fillStyle = 'rgba(8,14,10,.22)'; g2.fillRect(x0, -gh, d, gh * 2);
    g2.strokeStyle = 'rgba(255,255,255,.10)'; g2.lineWidth = 1; g2.beginPath();
    for (let x = 8; x < d; x += 8) { g2.moveTo(x0 + x, -gh); g2.lineTo(x0 + x, gh); }
    for (let y = -gh + 8; y < gh; y += 8) { g2.moveTo(x0, y); g2.lineTo(x0 + d, y); }
    g2.stroke();
  }
  g2.strokeStyle = COL.line; g2.lineWidth = 3; g2.lineJoin = 'round'; g2.lineCap = 'round';
  g2.beginPath();
  g2.moveTo(-W, -gh); g2.lineTo(-W, -H); g2.lineTo(W, -H); g2.lineTo(W, -gh);
  g2.moveTo(W, gh); g2.lineTo(W, H); g2.lineTo(-W, H); g2.lineTo(-W, gh);
  g2.moveTo(0, -H); g2.lineTo(0, H);
  g2.stroke();
  g2.beginPath(); g2.arc(0, 0, geo.kr, 0, TAU); g2.stroke();
  g2.beginPath(); g2.arc(0, 0, 3, 0, TAU); g2.fillStyle = COL.line; g2.fill();
  for (const s of [-1, 1]) {
    g2.strokeStyle = 'rgba(199,230,189,.75)'; g2.lineWidth = 2;
    g2.beginPath(); g2.moveTo(s * W, -gh); g2.lineTo(s * (W + d), -gh); g2.lineTo(s * (W + d), gh); g2.lineTo(s * W, gh); g2.stroke();
    g2.strokeStyle = kitOf(G, s < 0 ? 0 : 1); g2.lineWidth = 3;
    g2.beginPath(); g2.moveTo(s * W, -gh); g2.lineTo(s * W, gh); g2.stroke();
  }
  for (const post of G.posts) {
    g2.beginPath(); g2.arc(post.x, post.y, post.r, 0, TAU);
    g2.fillStyle = kitOf(G, post.x < 0 ? 0 : 1); g2.fill();
    g2.lineWidth = 2; g2.strokeStyle = COL.ink; g2.stroke();
  }
}

function fmtTime(t) {
  const s = Math.floor(t / 60);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

function drawGame(G, alpha, extra) {
  g2.setTransform(dpr, 0, 0, dpr, 0, 0);
  g2.fillStyle = COL.bg; g2.fillRect(0, 0, VW, VH);
  if (!G) return;
  const geo = G.geo, top = 74, bot = 14, side = 10;
  const aw = VW - side * 2, ah = VH - top - bot;
  const sc = Math.min(aw / (2 * (geo.boxW + 6)), ah / (2 * (geo.boxH + 6)));
  const ox = VW / 2, oy = top + ah / 2;
  const ix = d => d.px + (d.x - d.px) * alpha, iy = d => d.py + (d.y - d.py) * alpha;

  g2.save(); g2.translate(ox, oy); g2.scale(sc, sc);
  drawPitch(G);
  const b = G.ball, bx = ix(b), by = iy(b);
  g2.beginPath(); g2.arc(bx, by, b.r, 0, TAU); g2.fillStyle = '#fff'; g2.fill();
  g2.lineWidth = 2; g2.strokeStyle = COL.ink; g2.stroke();
  const labels = [];
  for (const p of G.players) {
    const x = ix(p), y = iy(p), fill = kitOf(G, p.team);
    g2.beginPath(); g2.arc(x, y, p.r, 0, TAU);
    g2.fillStyle = fill; g2.fill();
    const hot = (p.in.kick && p.armed) || p.flash > 0;
    g2.lineWidth = hot ? 3.2 : 2.4; g2.strokeStyle = hot ? '#fff' : COL.ink; g2.stroke();
    const ink = inkOn(fill);
    g2.font = '700 15px ' + FONT; g2.textAlign = 'center'; g2.textBaseline = 'middle';
    g2.lineWidth = 3; g2.strokeStyle = ink === '#ffffff' ? 'rgba(0,0,0,.35)' : 'rgba(255,255,255,.35)'; g2.strokeText(String(p.idx + 1), x, y + 1);
    g2.fillStyle = ink; g2.fillText(String(p.idx + 1), x, y + 1);
    if (p.me) {
      g2.beginPath(); g2.moveTo(x - 6, y - p.r - 11); g2.lineTo(x + 6, y - p.r - 11); g2.lineTo(x, y - p.r - 3); g2.closePath();
      g2.fillStyle = '#fff'; g2.fill(); g2.lineWidth = 1.5; g2.strokeStyle = COL.ink; g2.stroke();
    }
    labels.push({ x: ox + x * sc, y: oy + (y + p.r) * sc, p });
  }
  g2.restore();

  g2.font = '600 12px ' + BODY; g2.textAlign = 'center'; g2.textBaseline = 'alphabetic';
  for (const l of labels) {
    g2.lineWidth = 3; g2.strokeStyle = 'rgba(8,12,10,.7)'; g2.strokeText(l.p.name, l.x, l.y + 14);
    g2.fillStyle = l.p.me ? '#fff' : 'rgba(255,255,255,.78)'; g2.fillText(l.p.name, l.x, l.y + 14);
  }
  drawHud(G, extra);
  drawBanner(G);
  if (VH > VW * 1.2) {
    g2.fillStyle = 'rgba(233,240,234,.8)'; g2.font = '600 14px ' + BODY; g2.textAlign = 'center';
    g2.fillText('Girá el dispositivo para jugar en horizontal', VW / 2, VH - 24);
  } else if (!isTouch && G.phase === 'kickoff' && G.tick < 300) {
    g2.fillStyle = 'rgba(233,240,234,.7)'; g2.font = '500 14px ' + BODY; g2.textAlign = 'center';
    g2.fillText('Mover: WASD o flechas   ·   Patear: X o Espacio   ·   Pausa: P', VW / 2, VH - 18);
  }
}

function drawHud(G, extra) {
  const codes = G.cfg.teamCodes;
  const w = 216, hh = 46, x0 = VW / 2 - w / 2, y0 = 10;
  g2.fillStyle = COL.hud; rr(x0, y0, w, hh, 10); g2.fill();
  g2.textBaseline = 'middle'; g2.textAlign = 'center';
  g2.font = '700 28px ' + FONT;
  g2.fillStyle = kitOf(G, 0); g2.fillText(String(G.score[0]), x0 + 28, y0 + hh / 2 + 1);
  g2.fillStyle = kitOf(G, 1); g2.fillText(String(G.score[1]), x0 + w - 28, y0 + hh / 2 + 1);
  g2.font = '600 20px ' + FONT;
  g2.fillStyle = G.overtime ? '#ffd27a' : '#e9f0ea';
  g2.fillText(G.overtime ? fmtTime(Math.max(0, C.goldenTicks - G.otTicks)) : fmtTime(G.playTicks), VW / 2, y0 + hh / 2 + 1);
  if (codes) {
    g2.font = '700 14px ' + FONT;
    g2.textAlign = 'right'; g2.fillStyle = kitOf(G, 0); g2.fillText(codes[0], x0 - 10, y0 + hh / 2 + 1);
    g2.textAlign = 'left'; g2.fillStyle = kitOf(G, 1); g2.fillText(codes[1], x0 + w + 10, y0 + hh / 2 + 1);
  }
  g2.textAlign = 'center'; g2.textBaseline = 'alphabetic'; g2.font = '500 12px ' + BODY; g2.fillStyle = 'rgba(233,240,234,.62)';
  const sub = G.cfg.subtitle ? G.cfg.subtitle : DIFF[G.cfg.diff] ? DIFF[G.cfg.diff].label + ' · ' + G.cfg.size + 'v' + G.cfg.size : '';
  const lim = G.cfg.timeLimit > 0 ? ' · ' + G.cfg.timeLimit + ':00' : '';
  const goals = G.cfg.scoreLimit > 0 ? ' · a ' + G.cfg.scoreLimit : '';
  g2.fillText(G.overtime ? 'Gol de oro · el próximo gol gana' : sub + lim + goals, VW / 2, y0 + hh + 16);
  if (extra && extra.ping != null) {
    g2.textAlign = 'left'; g2.fillStyle = extra.ping > 150 ? '#ffb4a3' : 'rgba(233,240,234,.62)';
    g2.fillText(extra.ping + ' ms', 14, 28);
  }
}

function drawBanner(G) {
  const bn = G.banner;
  if (!bn || bn.t <= 0) return;
  const a = Math.min(1, bn.t / 20), y = VH / 2 - 10;
  g2.globalAlpha = a; g2.textAlign = 'center'; g2.textBaseline = 'middle';
  const col = bn.team === 0 || bn.team === 1 ? kitOf(G, bn.team) : COL.line;
  g2.font = '700 ' + Math.round(Math.min(72, VW / 9)) + 'px ' + FONT;
  g2.lineWidth = 8; g2.lineJoin = 'round'; g2.strokeStyle = 'rgba(8,12,10,.85)'; g2.strokeText(bn.text, VW / 2, y);
  g2.fillStyle = col; g2.fillText(bn.text, VW / 2, y);
  g2.font = '600 20px ' + BODY; g2.lineWidth = 5;
  g2.strokeText(bn.sub, VW / 2, y + 46); g2.fillStyle = '#fff'; g2.fillText(bn.sub, VW / 2, y + 46);
  g2.globalAlpha = 1; g2.textBaseline = 'alphabetic';
}

/* ---------- Bucle ---------- */
const DT = 1000 / 60;
let onLocalEnd = null;
function frame(now) {
  requestAnimationFrame(frame);
  if (mode === 'pens') { penFrame(now); return; }
  if (state === 'playing' && game && (mode === 'local' || mode === 'wc')) {
    acc += Math.min(now - lastT, 100); lastT = now;
    const human = game.players.find(q => q.human);
    while (acc >= DT && !game.over) {
      if (human) { const i = readInput(); human.in.dx = i.dx; human.in.dy = i.dy; human.in.kick = i.kick; }
      step(game); acc -= DT;
      for (const e of game.events.splice(0)) sound(e);
    }
    drawGame(game, game.over ? 1 : acc / DT);
    if (game.over && onLocalEnd) onLocalEnd();
  } else if (view && (state === 'paused' || state === 'ended')) {
    drawGame(view, 1);
  } else {
    g2.setTransform(dpr, 0, 0, dpr, 0, 0); g2.fillStyle = COL.bg; g2.fillRect(0, 0, VW, VH);
  }
}
function startLoop() { resize(); requestAnimationFrame(t => { lastT = t; frame(t); }); }

function loadFonts() {
  try { document.fonts.load('700 28px "Chakra Petch"'); document.fonts.load('600 12px "Barlow"'); } catch (e) { /* ok */ }
}
