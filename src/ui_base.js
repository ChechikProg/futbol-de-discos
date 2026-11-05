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
let mode = 'none';        // 'local' | 'wc' | 'lib' | 'pens'
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
  $('kickBtn').style.display = mode === 'pens' ? 'none' : '';
  $('callBtn').style.display = mode !== 'pens' && game && game.nTeam[game.humanTeam] > 1 ? '' : 'none';     // en los penales se patea solo al tocar la pelota
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
  else if (e.code === 'KeyE' || e.code === 'KeyQ') { askBall(); e.preventDefault(); }
});
window.addEventListener('keyup', e => {
  if (MOVE[e.code]) keys[MOVE[e.code]] = false;
  else if (KICK[e.code]) keys.k = false;
});
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'playing') pauseGame(); });

let stickId = null, kickId = null, sx0 = 0, sy0 = 0;
const base = $('stickBase'), knob = $('stickKnob'), kickBtn = $('kickBtn'), callBtn = $('callBtn');
/* pedir la pelota a los compañeros de la máquina (2v2 y 3v3) */
function askBall() {
  if (state !== 'playing' || !game || mode === 'pens') return;
  const me = game.players.find(q => q.human);
  if (callForBall(game, me)) { tone(660, 0.08, 'square', 0.05); tone(880, 0.1, 'square', 0.05, 0, 0.09); }
}
function releaseTouch() {
  stickId = kickId = null; tin.dx = tin.dy = 0; tin.kick = false; tin.active = false;
  base.classList.remove('on'); kickBtn.classList.remove('on');
}
window.addEventListener('touchstart', e => {
  if (state !== 'playing') return;
  let used = false;
  for (const t of e.changedTouches) {
    if (t.target.closest && t.target.closest('#pauseBtn')) continue;
    if (t.target === callBtn) { askBall(); callBtn.classList.add('on'); setTimeout(() => callBtn.classList.remove('on'), 200); used = true; continue; }
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

/* ---------- Estadios (modo Libertadores) ----------
   Las tribunas se dibujan una sola vez en un lienzo aparte y después se copian en cada cuadro. */
const STAND = 58;
const STAD_CACHE = { key: '', cv: null, ox: 0, oy: 0 };
const CURVED = { oval: 1, maracana: 1, circle: 1 };
/* medidas del estadio (mitad de ancho y alto, en unidades de la cancha) y forma interior */
function stadiumGeo(G) {
  const st = G.cfg.stadium, g = G.geo;
  if (!st) return null;
  if (st.style === 'circle') {
    const rx = g.W * 1.42, ry = g.H * 1.42;
    return { st, inner: { kind: 'ell', rx, ry }, ox: rx + STAND, oy: ry + STAND * 0.85 };
  }
  if (CURVED[st.style]) {
    const iw = g.boxW + 10, ih = g.boxH + 10, R = 120;
    return { st, inner: { kind: 'rr', w: iw, h: ih, r: R }, ox: iw + STAND, oy: ih + STAND, R };
  }
  const flatBottom = st.style === 'bombonera';
  return { st, inner: { kind: 'rect', w: g.boxW, h: g.boxH }, ox: g.boxW + STAND, oy: g.boxH + STAND, flatBottom };
}
function rrPath(ctx, w, h, r) {
  ctx.moveTo(-w + r, -h); ctx.arcTo(w, -h, w, h, r); ctx.arcTo(w, h, -w, h, r); ctx.arcTo(-w, h, -w, -h, r); ctx.arcTo(-w, -h, w, -h, r); ctx.closePath();
}
function shapePath(ctx, sh, grow) {
  if (sh.kind === 'ell') ctx.ellipse(0, 0, sh.rx + grow, sh.ry + grow * 0.85, 0, 0, TAU);
  else if (sh.kind === 'rr') rrPath(ctx, sh.w + grow, sh.h + grow, sh.r + grow);
  else rrPath(ctx, sh.w + grow, sh.h + grow, grow > 0 ? 10 : 0.01);
}
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f))));
  return 'rgb(' + c.join(',') + ')';
}
function buildStadium(G, SG, px) {
  const st = SG.st, g = G.geo, cv2 = document.createElement('canvas');
  cv2.width = Math.ceil(SG.ox * 2 * px); cv2.height = Math.ceil(SG.oy * 2 * px);
  const c = cv2.getContext('2d');
  c.setTransform(px, 0, 0, px, SG.ox * px, SG.oy * px);
  const crowd = st.crowd || ['#d9d9d9', '#555555'];
  const pal = [crowd[0], crowd[0], crowd[1], shade(crowd[0], -0.35), shade(crowd[1], -0.3), '#e8e2d6', '#2b2b2b'];
  /* forma de las tribunas: de la forma interior hasta el borde exterior */
  const outer = new Path2D(), stands = new Path2D();
  if (SG.inner.kind === 'rect') {
    const ow = SG.ox, oh = SG.oy;
    if (SG.flatBottom) {
      /* La Bombonera: tres tribunas altas y un lado recto con palcos */
      rrPath(outer, ow, oh, 10);
      rrPath(stands, ow, oh, 10);
    } else { rrPath(outer, ow, oh, 10); rrPath(stands, ow, oh, 10); }
    rrPath(stands, SG.inner.w, SG.inner.h, 0.01);
  } else {
    shapePath(outer, SG.inner, STAND); shapePath(stands, SG.inner, STAND); shapePath(stands, SG.inner, 0);
  }
  c.fillStyle = '#1b2420'; c.fill(outer);
  c.save(); c.clip(stands, 'evenodd');
  /* gente: puntitos de colores (con semilla fija para que no titilen) */
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const stepD = 4.2;
  for (let y = -SG.oy; y < SG.oy; y += stepD) {
    for (let x = -SG.ox; x < SG.ox; x += stepD) {
      const jx = x + rnd() * 1.6, jy = y + rnd() * 1.6;
      let col = pal[Math.floor(rnd() * pal.length)];
      if (st.style === 'bombonera') {
        /* tribunas a franjas azul y oro, como las bandejas de la Bombonera */
        const band = Math.floor((Math.max(Math.abs(jx) - g.boxW, Math.abs(jy) - g.boxH)) / 13);
        col = rnd() < 0.82 ? (band % 2 ? crowd[1] : crowd[0]) : pal[3 + Math.floor(rnd() * 4)];
      }
      c.fillStyle = col; c.fillRect(jx, jy, 2.6, 2.6);
    }
  }
  /* escalones: líneas que siguen la forma de la tribuna */
  c.strokeStyle = 'rgba(0,0,0,.22)'; c.lineWidth = 1.2;
  for (let k = 12; k < STAND; k += 12) {
    c.beginPath();
    if (SG.inner.kind === 'rect') rrPath(c, SG.inner.w + k, SG.inner.h + k, 4 + k * 0.1); else shapePath(c, SG.inner, k);
    c.stroke();
  }
  c.restore();
  if (st.style === 'bombonera') {
    /* el lado recto: palcos en una franja angosta y el resto liso */
    const y0 = g.boxH, y1 = SG.oy;
    c.fillStyle = '#e9e4d2'; c.fillRect(-SG.ox + 12, y0, (SG.ox - 12) * 2, y1 - y0);
    c.fillStyle = '#0b3d91'; c.fillRect(-SG.ox + 12, y0 + 4, (SG.ox - 12) * 2, 14);
    c.fillStyle = '#f2c400';
    for (let x = -SG.ox + 20; x < SG.ox - 24; x += 22) c.fillRect(x, y0 + 7, 14, 8);
    c.fillStyle = 'rgba(11,61,145,.85)';
    for (let x = -SG.ox + 18; x < SG.ox - 20; x += 16) c.fillRect(x, y0 + 24, 10, 22);
  }
  if (st.style === 'roof' || st.style === 'maracana') {
    /* techo: una franja clara sobre la parte de atrás de las tribunas */
    c.save();
    const roof = new Path2D();
    if (SG.inner.kind === 'rect') { rrPath(roof, SG.ox, SG.oy, 10); rrPath(roof, SG.inner.w + STAND * 0.45, SG.inner.h + STAND * 0.45, 6); }
    else { shapePath(roof, SG.inner, STAND); shapePath(roof, SG.inner, STAND * 0.5); }
    c.fillStyle = st.style === 'maracana' ? 'rgba(245,245,245,.78)' : 'rgba(225,232,238,.55)'; c.fill(roof, 'evenodd');
    c.restore();
  }
  if (st.style === 'centenario') {
    /* la Torre de los Homenajes, en la tribuna de enfrente */
    const tx = 0, ty = -g.boxH - STAND * 0.55;
    c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(tx - 15, ty - 22, 34, 50);
    c.fillStyle = '#f1efe8'; c.fillRect(tx - 12, ty - 26, 24, 50);
    c.fillStyle = '#c9c3b3'; for (let k = 0; k < 4; k++) c.fillRect(tx - 9, ty - 20 + k * 11, 18, 3);
    c.fillStyle = '#6cb4e4'; c.fillRect(tx - 3, ty - 34, 6, 10);
  }
  if (CURVED[st.style] || st.style === 'circle') {
    /* lo que rodea a la cancha dentro del estadio */
    c.fillStyle = COL.box; const inr = new Path2D(); shapePath(inr, SG.inner, 0); c.fill(inr);
  }
  c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 2; c.stroke(outer);
  return cv2;
}
function drawStadium(G, sc) {
  const SG = stadiumGeo(G);
  if (!SG) return;
  const px = sc * dpr, st = SG.st;
  const key = [st.key, st.n, (st.crowd || []).join(), G.geo.W, G.geo.H, Math.round(px * 100)].join('|');
  if (STAD_CACHE.key !== key) { STAD_CACHE.key = key; STAD_CACHE.cv = buildStadium(G, SG, px); STAD_CACHE.ox = SG.ox; STAD_CACHE.oy = SG.oy; }
  g2.drawImage(STAD_CACHE.cv, -STAD_CACHE.ox, -STAD_CACHE.oy, STAD_CACHE.ox * 2, STAD_CACHE.oy * 2);
}

function drawPitch(G) {
  const geo = G.geo, W = geo.W, H = geo.H, gh = geo.gh, d = geo.d;
  const st = G.cfg.stadium;
  if (!st || !(CURVED[st.style] || st.style === 'circle')) { g2.fillStyle = COL.box; g2.fillRect(-geo.boxW, -geo.boxH, geo.boxW * 2, geo.boxH * 2); }
  g2.fillStyle = COL.pitch; g2.fillRect(-W, -H, W * 2, H * 2);
  if (st && st.style === 'track') {
    /* pista de atletismo alrededor de la cancha (Hernando Siles) */
    g2.save();
    const tr = new Path2D(); rrPath(tr, W + 46, H + 27, 30); rrPath(tr, W + 14, H + 9, 12);
    g2.fillStyle = '#b4573a'; g2.fill(tr, 'evenodd');
    g2.strokeStyle = 'rgba(255,255,255,.4)'; g2.lineWidth = 0.8;
    for (const k of [22, 28, 34, 40]) { g2.beginPath(); rrPath(g2, W + k + 4, H + k * 0.5 + 6, 12 + k * 0.4); g2.stroke(); }
    g2.restore();
    g2.fillStyle = COL.pitch; g2.fillRect(-W, -H, W * 2, H * 2);
  }
  if (st) { g2.fillStyle = 'rgba(255,255,255,.045)'; for (let x = -W; x < W; x += 2 * W / 9) g2.fillRect(x, -H, W / 9, H * 2); }
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
  const geo = G.geo, top = 74, bot = G.cfg.stadium ? 30 : 14, side = 10;
  const aw = VW - side * 2, ah = VH - top - bot;
  const SG = stadiumGeo(G), ex = SG ? SG.ox : geo.boxW, ey = SG ? SG.oy : geo.boxH;
  const sc = Math.min(aw / (2 * (ex + 6)), ah / (2 * (ey + 6)));
  const ox = VW / 2, oy = top + ah / 2;
  const ix = d => d.px + (d.x - d.px) * alpha, iy = d => d.py + (d.y - d.py) * alpha;

  g2.save(); g2.translate(ox, oy); g2.scale(sc, sc);
  drawStadium(G, sc);
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

  /* globito cuando pedís la pelota */
  if (G.call && G.tick <= G.call.until) {
    const l = labels.find(x => x.p === G.call.p);
    if (l) {
      const bx = l.x, by = l.y - G.call.p.r * 2 * sc - 22;
      g2.font = '700 13px ' + FONT; const tw = g2.measureText('¡Pasala!').width + 14;
      g2.fillStyle = '#fff'; rr(bx - tw / 2, by - 12, tw, 22, 8); g2.fill();
      g2.beginPath(); g2.moveTo(bx - 5, by + 10); g2.lineTo(bx + 5, by + 10); g2.lineTo(bx, by + 16); g2.closePath(); g2.fill();
      g2.fillStyle = '#101412'; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.fillText('¡Pasala!', bx, by);
    }
  }
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
    g2.fillText('Mover: WASD o flechas   ·   Patear: X o Espacio   ·   ' + (G.nTeam[G.humanTeam] > 1 ? 'Pedir la pelota: E   ·   ' : '') + 'Pausa: P', VW / 2, VH - 18);
  }
}

/* color de un equipo legible sobre el fondo oscuro del marcador */
function hudCol(G, t) {
  const c = kitOf(G, t), n = parseInt(c.slice(1), 16), lum = ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000;
  return lum < 70 ? '#c9d1cc' : c;
}
function drawHud(G, extra) {
  const codes = G.cfg.teamCodes;
  const w = 216, hh = 46, x0 = VW / 2 - w / 2, y0 = 10;
  g2.fillStyle = COL.hud; rr(x0, y0, w, hh, 10); g2.fill();
  g2.textBaseline = 'middle'; g2.textAlign = 'center';
  g2.font = '700 28px ' + FONT;
  g2.fillStyle = hudCol(G, 0); g2.fillText(String(G.score[0]), x0 + 28, y0 + hh / 2 + 1);
  g2.fillStyle = hudCol(G, 1); g2.fillText(String(G.score[1]), x0 + w - 28, y0 + hh / 2 + 1);
  g2.font = '600 20px ' + FONT;
  g2.fillStyle = G.overtime ? '#ffd27a' : '#e9f0ea';
  g2.fillText(G.overtime ? fmtTime(Math.max(0, C.goldenTicks - G.otTicks)) : fmtTime(G.playTicks), VW / 2, y0 + hh / 2 + 1);
  if (codes) {
    g2.font = '700 14px ' + FONT;
    g2.textAlign = 'right'; g2.fillStyle = hudCol(G, 0); g2.fillText(codes[0], x0 - 10, y0 + hh / 2 + 1);
    g2.textAlign = 'left'; g2.fillStyle = hudCol(G, 1); g2.fillText(codes[1], x0 + w + 10, y0 + hh / 2 + 1);
  }
  g2.textAlign = 'center'; g2.textBaseline = 'alphabetic'; g2.font = '500 12px ' + BODY; g2.fillStyle = 'rgba(233,240,234,.62)';
  const sub = G.cfg.subtitle ? G.cfg.subtitle : DIFF[G.cfg.diff] ? DIFF[G.cfg.diff].label + ' · ' + G.cfg.size + 'v' + G.cfg.size : '';
  const lim = G.cfg.timeLimit > 0 ? ' · ' + G.cfg.timeLimit + ':00' : '';
  const goals = G.cfg.scoreLimit > 0 ? ' · a ' + G.cfg.scoreLimit : '';
  const agg = G.cfg.agg ? ' · global ' + (G.score[0] + G.cfg.agg[0]) + '–' + (G.score[1] + G.cfg.agg[1]) : '';
  g2.fillText((G.overtime ? 'Gol de oro · el próximo gol gana' : sub + lim + goals) + agg, VW / 2, y0 + hh + 16);
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
  if (state === 'playing' && game && (mode === 'local' || mode === 'wc' || mode === 'lib')) {
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
