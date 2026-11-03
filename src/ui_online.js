'use strict';
/* ===== Modo online: conexión, sala (lobby) y partido ===== */
const NET = {
  ws: null, state: 'off', id: null, room: null, rooms: [], err: '', rtt: null,
  name: store.get('name', '') || ('Jugador' + Math.floor(100 + Math.random() * 900)),
  pendingJoin: null, snaps: [], renderT: null, lastFrame: 0, lastArr: 0, jit: 4, delay: 60, you: -1, pingT: null, listT: null,
  inGame: false
};
let ogame = null;
let hostCfg = { size: '2', time: '3', goals: '5', bots: '1', diff: 'normal', pitch: { preset: 'classic' } };
let cfgCtl = null, lastCfgJson = '', lastHost = null;
const onlineEls = {};

const ONLINE_GROUPS = [
  { key: 'size', label: 'Jugadores por equipo', opts: [['1', '1 vs 1'], ['2', '2 vs 2'], ['3', '3 vs 3']] },
  { key: 'time', label: 'Tiempo', opts: [['3', '3 min'], ['5', '5 min'], ['10', '10 min'], ['0', 'Sin límite']] },
  { key: 'goals', label: 'Goles para ganar', opts: [['3', '3'], ['5', '5'], ['10', '10'], ['0', 'Sin límite']] },
  { key: 'bots', label: 'Completar con bots', opts: [['1', 'Sí'], ['0', 'No']] },
  { key: 'diff', label: 'Dificultad de los bots', opts: [['easy', 'Fácil'], ['normal', 'Normal'], ['hard', 'Difícil'], ['expert', 'Experto']] }
];

function toast(text) {
  const t = $('toast');
  t.textContent = text; t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { t.hidden = true; }, 3500);
}

/* ---------- Conexión ---------- */
function serverUrl() {
  try {
    const q = new URLSearchParams(location.search).get('server');
    if (q && /^wss?:\/\//.test(q)) return q;
  } catch (e) { /* ok */ }
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return null;
  return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
}

function netConnect() {
  if (NET.ws && (NET.state === 'on' || NET.state === 'connecting')) return;
  const url = serverUrl();
  if (!url) { NET.state = 'fail'; NET.err = 'Abrí la página desde el servidor del juego para jugar online.'; paintOnline(); return; }
  NET.state = 'connecting'; NET.err = ''; paintOnline();
  let ws;
  try { ws = new WebSocket(url); } catch (e) { NET.state = 'fail'; NET.err = 'No se pudo abrir la conexión.'; paintOnline(); return; }
  NET.ws = ws;
  let opened = false;
  const guard = setTimeout(() => { if (!opened) { try { ws.close(); } catch (e) { /* ok */ } } }, 7000);
  ws.onopen = () => {
    opened = true; clearTimeout(guard);
    NET.state = 'on';
    netSend({ t: 'hello', name: NET.name });
    startNetTimers();
    paintOnline();
  };
  ws.onmessage = ev => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } onNetMsg(m); };
  ws.onclose = () => {
    clearTimeout(guard); stopNetTimers();
    const was = NET.state;
    if (NET.ws === ws) NET.ws = null;
    NET.state = opened ? 'off' : 'fail';
    NET.err = opened ? 'Se perdió la conexión con el servidor.' : 'No se encontró el servidor de juego. El modo online necesita publicar el proyecto con su servidor (mirá el README).';
    NET.room = null; NET.inGame = false;
    if (mode === 'online' || currentScreen === 'room' || state === 'paused' || state === 'ended') {
      setState('idle'); mode = 'none';
      if (was === 'on') toast('Se perdió la conexión con el servidor.');
    }
    if (currentScreen === 'room' || currentScreen === null) showScreen('online');
    paintOnline();
  };
  ws.onerror = () => { /* onclose se encarga */ };
}
function netClose() {
  stopNetTimers();
  if (NET.ws) { const w = NET.ws; NET.ws = null; try { w.close(); } catch (e) { /* ok */ } }
  NET.state = 'off'; NET.room = null; NET.inGame = false;
}
function netSend(o) { if (NET.ws && NET.ws.readyState === 1) NET.ws.send(JSON.stringify(o)); }
function startNetTimers() {
  stopNetTimers();
  NET.pingT = setInterval(() => netSend({ t: 'ping', c: performance.now() }), 2000);
  NET.listT = setInterval(() => { if (currentScreen === 'online') netSend({ t: 'list' }); }, 3000);
  netSend({ t: 'ping', c: performance.now() }); netSend({ t: 'list' });
}
function stopNetTimers() { clearInterval(NET.pingT); clearInterval(NET.listT); }

/* ---------- Mensajes ---------- */
function onNetMsg(m) {
  switch (m.t) {
    case 'welcome':
      NET.id = m.id;
      if (NET.pendingJoin) { netSend({ t: 'join', code: NET.pendingJoin }); NET.pendingJoin = null; }
      break;
    case 'pong': {
      const r = Math.round(performance.now() - m.c);
      NET.rtt = NET.rtt == null ? r : Math.round(NET.rtt * 0.6 + r * 0.4);
      break;
    }
    case 'rooms': NET.rooms = m.list; paintOnline(); break;
    case 'err': toast(m.m); NET.pendingJoin = null; break;
    case 'room': {
      const first = !NET.room;
      NET.room = m;
      if (first && !NET.inGame) { clearEl(onlineEls.chatLog); chatLine(null, 'Sala ' + m.code + ': compartí el código para que se sumen.'); }
      if (first && !NET.inGame) showScreen('room');
      paintRoom();
      break;
    }
    case 'left':
      NET.room = null; NET.inGame = false; cfgCtl = null; lastCfgJson = '';
      setState('idle'); mode = 'none';
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ok */ }
      showScreen('online'); netSend({ t: 'list' });
      break;
    case 'chat': chatLine(m, null); break;
    case 'start': onlineStart(m); break;
    case 's': onSnap(m); break;
    case 'end': onlineEnd(m); break;
  }
}

/* ---------- Pantalla "Online" ---------- */
function buildOnline() {
  const s = SCREENS.online, c = card();
  clearEl(s); s.append(c);
  c.append(topbar('Jugar online', () => { netClose(); showScreen('home'); }, 'Inicio'));
  c.append(h('p', { class: 'sub', text: 'Creá una sala y pasale el código a tus amigos, o entrá a una sala abierta.' }));

  onlineEls.name = h('input', { type: 'text', id: 'nick', maxlength: 16, value: NET.name, autocomplete: 'nickname', spellcheck: 'false', placeholder: 'Tu nombre' });
  onlineEls.name.addEventListener('input', () => { NET.name = onlineEls.name.value.replace(/[<>]/g, '').slice(0, 16); store.set('name', NET.name); });
  c.append(h('div', { class: 'field' }, h('label', { for: 'nick', text: 'Tu nombre' }), onlineEls.name));

  onlineEls.status = h('p', { class: 'status', role: 'status' });
  c.append(onlineEls.status);

  onlineEls.createBtn = h('button', { class: 'btn go', type: 'button', text: 'Crear sala', onclick: () => {
    NET.name = (NET.name || 'Jugador').trim() || 'Jugador';
    netSend({ t: 'hello', name: NET.name });
    netSend({ t: 'create', cfg: serverCfg(hostCfg) });
  } });
  onlineEls.code = h('input', { type: 'text', id: 'joincode', maxlength: 4, placeholder: 'CÓDIGO', autocomplete: 'off', spellcheck: 'false', class: 'code' });
  onlineEls.code.addEventListener('input', () => { onlineEls.code.value = onlineEls.code.value.toUpperCase().replace(/[^A-Z]/g, ''); });
  onlineEls.code.addEventListener('keydown', e => { if (e.key === 'Enter') joinByCode(); });
  onlineEls.joinBtn = h('button', { class: 'btn', type: 'button', text: 'Entrar', onclick: joinByCode });
  c.append(h('div', { class: 'row' }, onlineEls.createBtn, h('div', { class: 'joinbox' }, onlineEls.code, onlineEls.joinBtn)));

  onlineEls.retry = h('button', { class: 'btn', type: 'button', text: 'Reintentar conexión', hidden: true, onclick: () => { NET.state = 'off'; netConnect(); } });
  c.append(onlineEls.retry);

  c.append(h('div', { class: 'listhead' }, h('h4', { text: 'Salas abiertas' }), h('button', { class: 'btn sm', type: 'button', text: 'Actualizar', onclick: () => netSend({ t: 'list' }) })));
  onlineEls.list = h('ul', { class: 'rooms' });
  c.append(onlineEls.list);
  paintOnline();
}

function joinByCode() {
  const code = onlineEls.code.value.trim().toUpperCase();
  if (code.length !== 4) { toast('El código tiene 4 letras.'); return; }
  netSend({ t: 'hello', name: NET.name });
  netSend({ t: 'join', code });
}

function paintOnline() {
  if (!onlineEls.status) return;
  const on = NET.state === 'on';
  const txt = { off: NET.err || 'Sin conexión.', connecting: 'Conectando con el servidor…', on: 'Conectado' + (NET.rtt != null ? ' · ' + NET.rtt + ' ms' : ''), fail: NET.err || 'Sin conexión.' }[NET.state];
  onlineEls.status.textContent = txt;
  onlineEls.status.className = 'status ' + (on ? 'ok' : NET.state === 'connecting' ? 'wait' : 'bad');
  onlineEls.createBtn.disabled = !on; onlineEls.joinBtn.disabled = !on; onlineEls.code.disabled = !on;
  onlineEls.retry.hidden = !(NET.state === 'fail' || NET.state === 'off');
  clearEl(onlineEls.list);
  if (!on) return;
  if (!NET.rooms.length) onlineEls.list.append(h('li', { class: 'empty', text: 'No hay salas abiertas. Creá la primera.' }));
  for (const r of NET.rooms) {
    onlineEls.list.append(h('li', { class: 'roomrow' },
      h('div', { class: 'rr-t' }, h('b', { text: r.name }), h('span', { text: r.size + 'v' + r.size + ' · ' + r.pitch + ' · ' + (r.phase === 'play' ? 'jugando' : 'esperando') })),
      h('span', { class: 'rr-n', text: r.players + '/' + r.max }),
      h('button', { class: 'btn sm', type: 'button', text: r.phase === 'play' ? 'Mirar' : 'Entrar', onclick: () => { netSend({ t: 'hello', name: NET.name }); netSend({ t: 'join', code: r.code }); } })));
  }
}

function openOnline(joinCode) {
  buildOnline();
  showScreen('online');
  if (joinCode) NET.pendingJoin = joinCode;
  netConnect();
  if (NET.state === 'on' && joinCode) { netSend({ t: 'join', code: joinCode }); NET.pendingJoin = null; }
}

/* ---------- Sala ---------- */
function serverCfg(c) {
  return { size: +c.size, time: +c.time, goals: +c.goals, bots: c.bots === '1', diff: c.diff, pitch: c.pitch };
}
function fromServerCfg(sc) {
  hostCfg.size = String(sc.size); hostCfg.time = String(sc.time); hostCfg.goals = String(sc.goals);
  hostCfg.bots = sc.bots ? '1' : '0'; hostCfg.diff = sc.diff; hostCfg.pitch = pitchValid(sc.pitch);
}

function buildRoom() {
  const s = SCREENS.room, c = card('wide');
  clearEl(s); s.append(c);
  onlineEls.roomTitle = h('h2', { text: 'Sala' });
  onlineEls.roomCode = h('span', { class: 'bigcode', text: '----' });
  c.append(h('div', { class: 'topbar' },
    h('button', { class: 'back', type: 'button', text: '‹ Salir', onclick: () => netSend({ t: 'leave' }) }),
    onlineEls.roomTitle));
  c.append(h('div', { class: 'invite' },
    h('div', null, h('span', { class: 'eyebrow', text: 'Código de la sala' }), onlineEls.roomCode),
    h('div', { class: 'row' },
      h('button', { class: 'btn sm', type: 'button', text: 'Copiar código', onclick: e => copyText(NET.room ? NET.room.code : '', e.target) }),
      h('button', { class: 'btn sm', type: 'button', text: 'Copiar enlace', onclick: e => copyText(location.origin + location.pathname + '#sala-' + (NET.room ? NET.room.code : ''), e.target) }))));
  onlineEls.teams = h('div', { class: 'teamcols' });
  c.append(onlineEls.teams);
  onlineEls.cfgBox = h('div', { class: 'cfgbox' });
  c.append(onlineEls.cfgBox);
  onlineEls.startBtn = h('button', { class: 'btn go', type: 'button', text: 'Empezar partido', onclick: () => netSend({ t: 'start' }) });
  onlineEls.waitMsg = h('p', { class: 'meta', text: 'Esperando que el anfitrión empiece el partido…' });
  c.append(onlineEls.startBtn, onlineEls.waitMsg);

  onlineEls.chatLog = h('div', { class: 'chatlog', 'aria-live': 'polite' });
  onlineEls.chatInput = h('input', { type: 'text', id: 'chatin', maxlength: 140, placeholder: 'Escribí un mensaje y Enter', autocomplete: 'off' });
  onlineEls.chatInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && onlineEls.chatInput.value.trim()) { netSend({ t: 'chat', text: onlineEls.chatInput.value }); onlineEls.chatInput.value = ''; }
  });
  c.append(h('div', { class: 'chat' }, h('h4', { text: 'Chat' }), onlineEls.chatLog, onlineEls.chatInput));
}

function copyText(text, btn) {
  const old = btn.textContent;
  const done = ok => { btn.textContent = ok ? '¡Copiado!' : 'Copialo a mano'; setTimeout(() => { btn.textContent = old; }, 1500); };
  try { navigator.clipboard.writeText(text).then(() => done(true), () => done(false)); } catch (e) { done(false); }
}

function chatLine(m, sys) {
  const log = onlineEls.chatLog;
  if (!log) return;
  const line = m
    ? h('p', { class: 'cl t' + m.team }, h('b', { text: m.from + ': ' }), m.text)
    : h('p', { class: 'cl sys', text: sys });
  log.append(line);
  while (log.childNodes.length > 60) log.removeChild(log.firstChild);
  log.scrollTop = log.scrollHeight;
}

function paintRoom() {
  const r = NET.room;
  if (!r || !onlineEls.teams) return;
  const isHost = r.host === r.you;
  onlineEls.roomTitle.textContent = r.name;
  onlineEls.roomCode.textContent = r.code;
  try { history.replaceState(null, '', location.pathname + location.search + '#sala-' + r.code); } catch (e) { /* ok */ }

  /* equipos */
  clearEl(onlineEls.teams);
  const cap = r.cfg.size;
  const defs = [[0, 'Rojo', 'red'], [1, 'Azul', 'blue'], [2, 'Espectadores', 'spec']];
  const me = r.members.find(m => m.id === r.you);
  for (const [t, label, tone] of defs) {
    const list = r.members.filter(m => m.team === t);
    const full = t !== 2 && list.length >= cap;
    onlineEls.teams.append(h('div', { class: 'tcol ' + tone },
      h('h4', null, label, h('small', { text: t === 2 ? String(list.length) : list.length + '/' + cap })),
      h('ul', null, list.map(m => h('li', { class: m.id === r.you ? 'me' : '' }, m.name, m.id === r.host ? h('em', { text: ' anfitrión' }) : null, m.id === r.you ? h('em', { text: ' vos' }) : null)), !list.length ? h('li', { class: 'empty', text: 'Vacío' }) : null),
      h('button', { class: 'btn sm', type: 'button', disabled: full || (me && me.team === t), text: me && me.team === t ? 'Estás acá' : full ? 'Completo' : t === 2 ? 'Mirar' : 'Unirme', onclick: () => netSend({ t: 'team', team: t }) })));
  }

  /* configuración */
  const json = JSON.stringify(r.cfg);
  if (isHost) {
    if (!cfgCtl || lastHost !== true) {
      clearEl(onlineEls.cfgBox);
      fromServerCfg(r.cfg);
      const send = () => netSend({ t: 'cfg', cfg: serverCfg(hostCfg) });
      const grid = h('div', { class: 'groups' });
      cfgCtl = { groups: [], pitch: null };
      for (const def of ONLINE_GROUPS) { const g = segGroup('on', def, hostCfg, send); cfgCtl.groups.push(g); grid.append(g); }
      cfgCtl.pitch = pitchGroup('on', () => hostCfg.pitch, v => { hostCfg.pitch = v; send(); });
      grid.append(cfgCtl.pitch);
      onlineEls.cfgBox.append(h('h4', { text: 'Configuración (la ves vos, anfitrión)' }), grid);
      lastCfgJson = json;
    } else if (json !== lastCfgJson) {
      fromServerCfg(r.cfg);
      for (const g of cfgCtl.groups) g.refresh();
      cfgCtl.pitch.update(hostCfg.pitch);
      lastCfgJson = json;
    }
  } else {
    cfgCtl = null; lastCfgJson = '';
    clearEl(onlineEls.cfgBox);
    const c = r.cfg;
    onlineEls.cfgBox.append(h('p', { class: 'summary' },
      c.size + ' vs ' + c.size + ' · cancha ' + pitchText(c.pitch) + ' · ' + (c.time ? c.time + ' min' : 'sin límite de tiempo') + ' · ' + (c.goals ? 'a ' + c.goals + ' goles' : 'sin límite de goles') + ' · ' + (c.bots ? 'bots ' + diffLabel(c.diff).toLowerCase() + ' completan' : 'sin bots')));
  }
  lastHost = isHost;
  onlineEls.startBtn.hidden = !isHost; onlineEls.startBtn.textContent = r.phase === 'play' ? 'Partido en curso' : 'Empezar partido';
  onlineEls.startBtn.disabled = r.phase === 'play';
  onlineEls.waitMsg.hidden = isHost;
}

/* ---------- Partido online ---------- */
/* Mi jugador se mueve al instante con la misma física que el servidor (predicción).
   Cuando llega el estado del servidor, se vuelve a calcular desde ahí con las entradas que
   el servidor todavía no procesó, y la diferencia se corrige de a poco para que no salte. */
const PR = { x: 0, y: 0, vx: 0, vy: 0, ox: 0, oy: 0, seq: 0, buf: [], init: false, acc: 0, errMax: 0 };
const PSTRIDE = 6;

function onlineStart(m) {
  NET.inGame = true; NET.you = m.you; NET.snaps = []; NET.renderT = null; NET.lastArr = 0; NET.jit = 4; NET.delay = 60;
  PR.init = false; PR.buf = []; PR.ox = PR.oy = 0; PR.acc = 0;
  const cfg = m.cfg;
  ogame = createGame({
    size: cfg.size, diff: cfg.diff, humanTeam: -1, timeLimit: cfg.timeLimit, scoreLimit: cfg.scoreLimit, pitch: cfg.pitch,
    roster: m.roster.map(r => ({ team: r.team, human: false, name: r.name }))
  });
  ogame.cfg.subtitle = 'Online · ' + cfg.size + 'v' + cfg.size;
  if (m.you >= 0 && ogame.players[m.you]) {
    const me = ogame.players[m.you];
    me.me = true;
    PR.r = me.r; PR.invMass = me.invMass; PR.bCoef = me.bCoef; PR.team = me.team;
  }
  view = ogame; mode = 'online';
  loadFonts(); unlockAudio();
  pauseOpts = () => {
    const r = NET.room, isHost = r && r.host === r.you, mine = r && r.members.find(x => x.id === r.you);
    const list = [];
    if (mine && mine.team !== 2) list.push({ text: 'Pasarme a espectador', fn: () => { netSend({ t: 'team', team: 2 }); resumeGame(); } });
    if (isHost) list.push({ text: 'Terminar el partido', fn: () => { netSend({ t: 'stop' }); } });
    list.push({ text: 'Salir de la sala', fn: () => netSend({ t: 'leave' }) });
    return list;
  };
  setState('playing');
}

function onSnap(m) {
  if (!ogame) return;
  const now = performance.now();
  if (NET.lastArr) {
    /* qué tan irregular llega el flujo: define cuánto retardo hace falta para verse fluido */
    const gap = now - NET.lastArr;
    NET.jit = NET.jit * 0.95 + Math.abs(gap - DT) * 0.05;
    NET.delay = clampN(DT * 2 + NET.jit * 3, 50, 180);
  }
  NET.lastArr = now;
  const T = m.k * DT;
  NET.snaps.push({ T, m });
  if (NET.snaps.length > 60) NET.snaps.shift();
  ogame.score = m.sc; ogame.phase = m.f === 'p' ? 'play' : m.f === 'g' ? 'goal' : 'kickoff';
  ogame.playTicks = m.m; ogame.overtime = !!m.o; ogame.tick = m.k;
  if (m.e) for (const e of m.e) {
    sound(e);
    if (e === 'overtime') ogame.banner = { text: 'Prórroga', sub: 'El próximo gol gana', team: -1, t: 150 };
  }
  if (m.bn) { ogame.banner = { text: '¡GOL!', team: m.bn[0], sub: m.bn[1], t: 150 }; ogame.kickTeam = 1 - m.bn[0]; }
  reconcile(m);
}

/* Parte del estado confirmado por el servidor y vuelve a aplicar mis entradas pendientes */
function reconcile(m) {
  if (NET.you < 0 || !ogame.players[NET.you]) return;
  const j = NET.you * PSTRIDE, me = ogame.players[NET.you];
  const S = { x: m.p[j], y: m.p[j + 1], vx: m.p[j + 3], vy: m.p[j + 4], r: me.r, invMass: me.invMass, bCoef: me.bCoef, team: me.team };
  const ack = m.p[j + 5];
  while (PR.buf.length && PR.buf[0].s <= ack) PR.buf.shift();
  for (const inp of PR.buf) predictPlayer(ogame, S, inp);
  if (!PR.init) { PR.init = true; PR.ox = PR.oy = 0; }
  else {
    const ex = PR.x + PR.ox - S.x, ey = PR.y + PR.oy - S.y;
    if (Math.hypot(ex, ey) > 60) { PR.ox = PR.oy = 0; }      // salto grande (saque, gol): sin suavizar
    else { PR.ox = ex; PR.oy = ey; }                          // lo que se ve no se mueve; el desvío se va apagando
    PR.errMax = Math.max(PR.errMax, Math.hypot(PR.x - S.x, PR.y - S.y));
  }
  PR.x = S.x; PR.y = S.y; PR.vx = S.vx; PR.vy = S.vy;
}

/* Un tick local: leer controles, moverme ya, y avisar al servidor */
function localTick() {
  const i = state === 'playing' ? readInput() : { dx: 0, dy: 0, kick: false };
  const inp = { dx: Math.round(i.dx * 100) / 100, dy: Math.round(i.dy * 100) / 100, kick: !!i.kick, s: ++PR.seq };
  PR.buf.push(inp);
  if (PR.buf.length > 600) PR.buf.shift();
  if (PR.init) predictPlayer(ogame, PR, inp);
  PR.ox *= 0.88; PR.oy *= 0.88;
  netSend({ t: 'in', dx: inp.dx, dy: inp.dy, kick: inp.kick, s: inp.s });
  const me = ogame.players[NET.you];
  if (me) { me.in.kick = inp.kick; me.armed = true; }
}

function applySnap(a, b, f) {
  const G = ogame, pa = a.m.p, pb = b.m.p;
  G.ball.x = G.ball.px = a.m.b[0] + (b.m.b[0] - a.m.b[0]) * f;
  G.ball.y = G.ball.py = a.m.b[1] + (b.m.b[1] - a.m.b[1]) * f;
  for (let i = 0; i < G.players.length; i++) {
    const p = G.players[i], j = i * PSTRIDE;
    if (pa[j] === undefined) continue;
    /* un salto grande es un saque tras gol: no interpolar */
    const dx = pb[j] - pa[j], dy = pb[j + 1] - pa[j + 1];
    const k = (Math.abs(dx) > 120 || Math.abs(dy) > 120) ? 1 : f;
    p.x = p.px = pa[j] + dx * k; p.y = p.py = pa[j + 1] + dy * k;
    p.flash = pb[j + 2] ? 1 : 0;
    if (i !== NET.you) p.in.kick = false;
  }
  const bdx = b.m.b[0] - a.m.b[0], bdy = b.m.b[1] - a.m.b[1];
  if (Math.abs(bdx) > 120 || Math.abs(bdy) > 120) { G.ball.x = G.ball.px = b.m.b[0]; G.ball.y = G.ball.py = b.m.b[1]; }
}

function onlineFrame(now) {
  const dtf = Math.min(now - (NET.lastFrame || now), 50); NET.lastFrame = now;
  const snaps = NET.snaps;
  if (ogame && snaps.length) {
    const latest = snaps[snaps.length - 1].T;
    if (NET.renderT == null) NET.renderT = latest - NET.delay;
    else {
      NET.renderT += dtf;
      const err = (latest - NET.delay) - NET.renderT;
      NET.renderT += clampN(err * 0.08, -dtf * 0.5, dtf);
    }
    const rt = NET.renderT;
    let a = snaps[0], b = snaps[0];
    for (let i = snaps.length - 1; i >= 0; i--) {
      if (snaps[i].T <= rt) { a = snaps[i]; b = snaps[Math.min(i + 1, snaps.length - 1)]; break; }
      a = snaps[i]; b = snaps[i];
    }
    const span = b.T - a.T, f = span > 0 ? clampN((rt - a.T) / span, 0, 1) : 1;
    applySnap(a, b, f);

    /* mi jugador: tantos ticks locales como corresponda (60 por segundo) */
    if (NET.you >= 0) {
      PR.acc += dtf;
      let guard = 0;
      while (PR.acc >= DT && guard++ < 6) { PR.acc -= DT; localTick(); }
      if (PR.acc > DT * 6) PR.acc = 0;
      const me = ogame.players[NET.you];
      if (me && PR.init) { me.x = me.px = PR.x + PR.ox; me.y = me.py = PR.y + PR.oy; }
    }
    if (ogame.banner && ogame.banner.t > 0) ogame.banner.t -= dtf / DT;
  }
  if (state === 'playing' || state === 'paused' || state === 'ended') drawGame(ogame, 1, { online: true, ping: NET.rtt });
}

function onlineEnd(m) {
  NET.inGame = false;
  if (state === 'idle') return;
  const r = NET.room, me = r && r.members.find(x => x.id === r.you);
  const team = me ? me.team : 2;
  let title, res = 'draw';
  if (m.w === -2) title = 'El anfitrión terminó el partido';
  else if (m.w === -1) title = 'Empate';
  else if (team === 2) title = 'Ganó ' + (m.w === 0 ? 'Rojo' : 'Azul');
  else { const win = m.w === team; title = win ? '¡Ganaste!' : 'Perdiste'; res = win ? 'win' : 'lose'; }
  sound('end');
  view = ogame;
  showEnd({
    title, res, score: m.w === -2 ? null : m.sc, meta: m.o ? 'Definido en prórroga' : '',
    buttons: [{ text: 'Volver a la sala', go: true, fn: () => { setState('idle'); mode = 'none'; showScreen('room'); paintRoom(); } }]
  });
}

function initOnline() {
  mkScreen('online'); mkScreen('room');
  buildRoom();
  hooks.onlineFrame = onlineFrame;
}
