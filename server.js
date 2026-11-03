'use strict';
/* Servidor de Fútbol de Discos: sirve la página y corre las salas online.
   El servidor es la autoridad: simula la física a 60 Hz y manda el estado a 30 Hz. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { createGame, step, PITCHES, DIFF, PITCH_LIMITS } = require('./src/core.js');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || ''; // opcional: dominio permitido para conectarse
const MAX_ROOMS = 60, MAX_MEMBERS = 16, DT = 1000 / 60;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png' };

/* ---------- HTTP ---------- */
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok'); }
  const file = url === '/' ? '/index.html' : url;
  const full = path.normalize(path.join(PUBLIC, file));
  if (full !== PUBLIC && !full.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('No encontrado'); }
    res.writeHead(200, {
      'content-type': MIME[path.extname(full)] || 'application/octet-stream',
      'cache-control': file === '/index.html' ? 'no-cache' : 'public, max-age=3600'
    });
    res.end(data);
  });
});

/* ---------- Utilidades ---------- */
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const cleanName = s => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 16);
const cleanText = s => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 140);
const r1 = v => Math.round(v * 10) / 10;
const r3 = v => Math.round(v * 1000) / 1000;
const INPUT_TIMEOUT = 400; // ms sin recibir controles: el jugador se frena

const DEFAULT_CFG = { size: 2, pitch: { preset: 'classic' }, time: 3, goals: 5, bots: true, diff: 'normal' };

function sanitizeCfg(c, base) {
  const out = Object.assign({}, base || DEFAULT_CFG);
  if (!c || typeof c !== 'object') return out;
  if ([1, 2, 3].includes(+c.size)) out.size = +c.size;
  if ([0, 3, 5, 10].includes(+c.time)) out.time = +c.time;
  if ([0, 3, 5, 10].includes(+c.goals)) out.goals = +c.goals;
  if (typeof c.bots === 'boolean') out.bots = c.bots;
  if (DIFF[c.diff]) out.diff = c.diff;
  if (c.pitch && typeof c.pitch === 'object') {
    if (PITCHES[c.pitch.preset]) out.pitch = { preset: c.pitch.preset };
    else if (isFinite(+c.pitch.W) && isFinite(+c.pitch.H) && isFinite(+c.pitch.gh)) {
      const H = clamp(Math.round(+c.pitch.H), PITCH_LIMITS.H[0], PITCH_LIMITS.H[1]);
      out.pitch = {
        W: clamp(Math.round(+c.pitch.W), PITCH_LIMITS.W[0], PITCH_LIMITS.W[1]), H,
        gh: clamp(Math.round(+c.pitch.gh), PITCH_LIMITS.gh[0], Math.min(PITCH_LIMITS.gh[1], H - 25))
      };
    }
  }
  return out;
}
function resolvePitch(p) {
  if (p && PITCHES[p.preset]) { const q = PITCHES[p.preset]; return { W: q.W, H: q.H, gh: q.gh }; }
  return { W: p.W, H: p.H, gh: p.gh };
}
function pitchLabel(p) {
  return p && PITCHES[p.preset] ? PITCHES[p.preset].label : p.W + '×' + p.H;
}

const rooms = new Map();
const clients = new Map();
let nextId = 1;

function makeCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (let t = 0; t < 200; t++) {
    let c = '';
    for (let i = 0; i < 4; i++) c += A[Math.floor(Math.random() * A.length)];
    if (!rooms.has(c)) return c;
  }
  return null;
}

function send(c, obj) {
  if (c.ws.readyState === 1) c.ws.send(JSON.stringify(obj));
}
function members(room) { return Array.from(room.members.values()); }
function teamCount(room, team) { return members(room).filter(m => m.team === team).length; }

function roomState(room, forClient) {
  return {
    t: 'room', code: room.code, name: room.name, host: room.hostId, phase: room.phase, cfg: room.cfg,
    you: forClient.id, members: members(room).map(m => ({ id: m.id, name: m.name, team: m.team }))
  };
}
function broadcastRoom(room) { for (const m of room.members.values()) send(m, roomState(room, m)); }
function broadcast(room, obj) {
  const s = JSON.stringify(obj);
  for (const m of room.members.values()) if (m.ws.readyState === 1) m.ws.send(s);
}

function roomList() {
  return Array.from(rooms.values()).map(r => ({
    code: r.code, name: r.name, host: (r.members.get(r.hostId) || {}).name || '', phase: r.phase,
    players: members(r).filter(m => m.team !== 2).length, max: r.cfg.size * 2,
    spectators: teamCount(r, 2), size: r.cfg.size, pitch: pitchLabel(r.cfg.pitch)
  })).sort((a, b) => b.players - a.players).slice(0, 40);
}

/* ---------- Partida ---------- */
function slotOf(room, client) {
  return room.game ? room.game.players.find(p => p.cid === client.id) : null;
}

function takeBotSlot(room, client, team) {
  const G = room.game;
  if (!G) return true;
  const bot = G.players.find(p => p.team === team && !p.human);
  if (!bot) return false;
  bot.human = true; bot.cid = client.id; bot.name = client.name; bot.in = { dx: 0, dy: 0, kick: false };
  bot.seq = 0; bot.lastIn = performance.now();
  return true;
}
function freeSlot(room, client) {
  const p = slotOf(room, client);
  if (!p) return;
  p.human = false; p.cid = null; p.in = { dx: 0, dy: 0, kick: false };
  p.diff = DIFF[room.cfg.diff] || DIFF.normal;
}

function startGame(room) {
  const cfg = room.cfg, roster = [], cids = [];
  for (const team of [0, 1]) {
    const hs = members(room).filter(m => m.team === team).slice(0, cfg.size);
    for (const h of hs) { roster.push({ team, human: true, name: h.name, diff: cfg.diff }); cids.push(h.id); }
    if (cfg.bots) for (let i = hs.length; i < cfg.size; i++) { roster.push({ team, human: false, name: null, diff: cfg.diff }); cids.push(null); }
  }
  const G = createGame({
    size: cfg.size, roster, diff: cfg.diff, humanTeam: -1, timeLimit: cfg.time, scoreLimit: cfg.goals,
    pitch: resolvePitch(cfg.pitch), allowDraw: false
  });
  G.players.forEach((p, i) => { p.cid = cids[i]; p.seq = 0; p.lastIn = performance.now() + 1500; });
  room.game = G; room.phase = 'play'; room.acc = 0; room.evq = []; room.sentTick = -9;
  room.startAt = performance.now() + 1500; room.last = room.startAt;
  const pitch = resolvePitch(cfg.pitch);
  for (const m of room.members.values()) {
    const idx = G.players.findIndex(p => p.cid === m.id);
    send(m, {
      t: 'start', you: idx,
      cfg: { size: cfg.size, pitch, timeLimit: cfg.time, scoreLimit: cfg.goals, diff: cfg.diff },
      roster: G.players.map(p => ({ team: p.team, name: p.name, human: p.human }))
    });
  }
  broadcastRoom(room);
}

function snapshot(room, G) {
  /* por jugador: x, y, patada, vx, vy y el número de la última entrada recibida (para la predicción del cliente) */
  const p = [];
  for (const q of G.players) p.push(r1(q.x), r1(q.y), ((q.in.kick && q.armed) || q.flash > 0) ? 1 : 0, r3(q.vx), r3(q.vy), q.seq | 0);
  const s = {
    t: 's', k: G.tick, sc: G.score, f: G.phase === 'play' ? 'p' : G.phase === 'goal' ? 'g' : 'k',
    m: G.playTicks, o: G.overtime ? 1 : 0, b: [r1(G.ball.x), r1(G.ball.y)], p
  };
  if (room.evq.length) {
    s.e = room.evq;
    if (room.evq.includes('goal') && G.banner) s.bn = [G.banner.team, G.banner.sub];
    room.evq = [];
  }
  return s;
}

function endGame(room) {
  const G = room.game;
  broadcast(room, { t: 'end', sc: G.score, w: G.winner, o: G.overtime ? 1 : 0 });
  room.game = null; room.phase = 'lobby';
  broadcastRoom(room);
}

function tickRooms(now) {
  for (const room of rooms.values()) {
    const G = room.game;
    if (room.phase !== 'play' || !G) continue;
    if (now < room.startAt) { room.last = now; continue; }
    room.acc += Math.min(now - room.last, 100); room.last = now;
    for (const p of G.players) {
      if (p.human && p.cid && now - p.lastIn > INPUT_TIMEOUT) { p.in.dx = 0; p.in.dy = 0; p.in.kick = false; }
    }
    let stepped = 0;
    while (room.acc >= DT && !G.over) {
      step(G); room.acc -= DT; stepped++;
      for (const e of G.events) if (room.evq.length < 20) room.evq.push(e);
      G.events.length = 0;
    }
    if (!stepped) continue;
    if (G.tick - room.sentTick >= 1 || G.over || room.evq.length) { // 60 snapshots por segundo
      broadcast(room, snapshot(room, G));
      room.sentTick = G.tick;
    }
    if (G.over) endGame(room);
  }
}
setInterval(() => tickRooms(performance.now()), 6);

/* ---------- Salas ---------- */
function joinRoom(client, room) {
  if (room.members.size >= MAX_MEMBERS) return send(client, { t: 'err', m: 'La sala está llena.' });
  let team = 2;
  if (room.phase === 'lobby') {
    const a = teamCount(room, 0), b = teamCount(room, 1), cap = room.cfg.size;
    if (a < cap && a <= b) team = 0; else if (b < cap) team = 1; else if (a < cap) team = 0;
  }
  client.room = room; client.team = team;
  room.members.set(client.id, client);
  broadcastRoom(room);
  if (room.phase === 'play' && room.game) {
    send(client, {
      t: 'start', you: -1,
      cfg: { size: room.cfg.size, pitch: resolvePitch(room.cfg.pitch), timeLimit: room.cfg.time, scoreLimit: room.cfg.goals, diff: room.cfg.diff },
      roster: room.game.players.map(p => ({ team: p.team, name: p.name, human: p.human }))
    });
  }
}

function leaveRoom(client) {
  const room = client.room;
  if (!room) return;
  freeSlot(room, client);
  room.members.delete(client.id);
  client.room = null; client.team = 2;
  if (room.members.size === 0) { rooms.delete(room.code); return; }
  if (room.hostId === client.id) room.hostId = room.members.keys().next().value;
  broadcastRoom(room);
}

function handle(client, msg) {
  switch (msg.t) {
    case 'hello': {
      client.name = cleanName(msg.name) || 'Jugador';
      send(client, { t: 'welcome', id: client.id, name: client.name });
      break;
    }
    case 'ping': send(client, { t: 'pong', c: msg.c }); break;
    case 'list': send(client, { t: 'rooms', list: roomList() }); break;
    case 'create': {
      if (client.room) return;
      if (rooms.size >= MAX_ROOMS) return send(client, { t: 'err', m: 'Hay demasiadas salas abiertas. Probá en un rato.' });
      const code = makeCode();
      if (!code) return send(client, { t: 'err', m: 'No se pudo crear la sala.' });
      const room = {
        code, name: cleanName(msg.name) || ('Sala de ' + client.name), hostId: client.id, members: new Map(),
        cfg: sanitizeCfg(msg.cfg), phase: 'lobby', game: null, acc: 0, last: 0, startAt: 0, evq: [], sentTick: 0
      };
      rooms.set(code, room);
      joinRoom(client, room);
      break;
    }
    case 'join': {
      if (client.room) return;
      const room = rooms.get(String(msg.code || '').toUpperCase().slice(0, 4));
      if (!room) return send(client, { t: 'err', m: 'No existe esa sala.' });
      joinRoom(client, room);
      break;
    }
    case 'leave': leaveRoom(client); send(client, { t: 'left' }); break;
    case 'team': {
      const room = client.room;
      if (!room) return;
      const team = +msg.team;
      if (![0, 1, 2].includes(team) || team === client.team) return;
      if (team !== 2 && teamCount(room, team) >= room.cfg.size) return send(client, { t: 'err', m: 'Ese equipo está completo.' });
      if (room.phase === 'play') {
        freeSlot(room, client);
        if (team !== 2 && !takeBotSlot(room, client, team)) return send(client, { t: 'err', m: 'No hay lugar libre en ese equipo.' });
      }
      client.team = team;
      broadcastRoom(room);
      break;
    }
    case 'cfg': {
      const room = client.room;
      if (!room || room.hostId !== client.id || room.phase !== 'lobby') return;
      room.cfg = sanitizeCfg(msg.cfg, room.cfg);
      for (const team of [0, 1]) {
        const extra = members(room).filter(m => m.team === team).slice(room.cfg.size);
        for (const m of extra) m.team = 2;
      }
      if (typeof msg.name === 'string') room.name = cleanName(msg.name) || room.name;
      broadcastRoom(room);
      break;
    }
    case 'start': {
      const room = client.room;
      if (!room || room.hostId !== client.id || room.phase !== 'lobby') return;
      if (!room.cfg.bots && !members(room).some(m => m.team !== 2)) return send(client, { t: 'err', m: 'Tiene que haber al menos un jugador en un equipo.' });
      startGame(room);
      break;
    }
    case 'stop': {
      const room = client.room;
      if (!room || room.hostId !== client.id || room.phase !== 'play') return;
      room.game = null; room.phase = 'lobby';
      broadcast(room, { t: 'end', sc: [0, 0], w: -2, o: 0 });
      broadcastRoom(room);
      break;
    }
    case 'in': {
      const room = client.room;
      if (!room || !room.game) return;
      const p = slotOf(room, client);
      if (!p) return;
      p.in.dx = clamp(+msg.dx || 0, -1, 1); p.in.dy = clamp(+msg.dy || 0, -1, 1); p.in.kick = !!msg.kick;
      p.seq = (+msg.s || 0) | 0; p.lastIn = performance.now();
      break;
    }
    case 'chat': {
      const room = client.room;
      const now = Date.now();
      if (!room || now - client.lastChat < 700) return;
      const text = cleanText(msg.text);
      if (!text) return;
      client.lastChat = now;
      broadcast(room, { t: 'chat', from: client.name, team: client.team, text });
      break;
    }
  }
}

/* ---------- WebSocket ---------- */
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096, perMessageDeflate: false });
wss.on('connection', (ws, req) => {
  if (ALLOWED_ORIGIN && req.headers.origin && !req.headers.origin.includes(ALLOWED_ORIGIN)) return ws.close(1008, 'origen no permitido');
  if (clients.size > 400) return ws.close(1013, 'servidor lleno');
  const client = { id: nextId++, ws, name: 'Jugador', room: null, team: 2, tokens: 150, tokT: Date.now(), lastChat: 0, alive: true };
  clients.set(client.id, client);
  ws.on('pong', () => { client.alive = true; });
  ws.on('message', data => {
    const now = Date.now();
    client.tokens = Math.min(150, client.tokens + (now - client.tokT) * 0.15); client.tokT = now;
    if (client.tokens < 1) return;
    client.tokens -= 1;
    let msg;
    try { msg = JSON.parse(data); } catch (e) { return; }
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;
    try { handle(client, msg); } catch (e) { console.error('error en mensaje', msg.t, e); }
  });
  ws.on('close', () => { leaveRoom(client); clients.delete(client.id); });
  ws.on('error', () => { /* se cierra solo */ });
});
setInterval(() => {
  for (const c of clients.values()) {
    if (!c.alive) { c.ws.terminate(); continue; }
    c.alive = false;
    try { c.ws.ping(); } catch (e) { /* ok */ }
  }
}, 30000);

if (require.main === module) {
  server.listen(PORT, () => console.log('Fútbol de Discos escuchando en el puerto ' + PORT));
}
module.exports = { server, rooms, clients };
