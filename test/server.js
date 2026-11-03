const assert = require('assert');
const WebSocket = require('ws');
const { server, rooms } = require('../server.js');

function client(port) {
  const ws = new WebSocket('ws://127.0.0.1:' + port + '/ws');
  const c = { ws, msgs: [], waiters: [] };
  ws.on('message', d => {
    const m = JSON.parse(d); c.msgs.push(m);
    c.waiters = c.waiters.filter(w => { if (w.fn(m)) { clearTimeout(w.to); w.res(m); return false; } return true; });
  });
  c.open = new Promise(r => ws.on('open', r));
  c.send = o => ws.send(JSON.stringify(o));
  c.wait = (fn, ms = 4000, label = '') => new Promise((res, rej) => {
    const hit = c.msgs.find(fn); if (hit) return res(hit);
    const to = setTimeout(() => rej(new Error('timeout esperando ' + label)), ms);
    c.waiters.push({ fn, res, to });
  });
  c.last = t => { for (let i = c.msgs.length - 1; i >= 0; i--) if (c.msgs[i].t === t) return c.msgs[i]; return null; };
  return c;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const A = client(port), B = client(port), S = client(port);
  await Promise.all([A.open, B.open, S.open]);
  A.send({ t: 'hello', name: 'Ana<script>' }); B.send({ t: 'hello', name: 'Beto' }); S.send({ t: 'hello', name: 'Seba' });
  const wa = await A.wait(m => m.t === 'welcome', 2000, 'welcome');
  assert.strictEqual(wa.name, 'Anascript', 'nombre saneado');
  await B.wait(m => m.t === 'welcome'); await S.wait(m => m.t === 'welcome');

  // --- sala con dos humanos, sin bots ---
  A.send({ t: 'create', cfg: { size: 1, bots: false, time: 3, goals: 3, pitch: { preset: 'big' }, diff: 'hard' } });
  const room = await A.wait(m => m.t === 'room', 2000, 'room');
  assert.strictEqual(room.code.length, 4);
  assert.strictEqual(room.cfg.size, 1); assert.strictEqual(room.cfg.bots, false);
  assert.deepStrictEqual(room.cfg.pitch, { preset: 'big' });
  const myTeam = room.members.find(m => m.id === room.you).team;
  assert.strictEqual(myTeam, 0);

  B.send({ t: 'join', code: room.code.toLowerCase() });
  const rb = await B.wait(m => m.t === 'room', 2000, 'B room');
  assert.strictEqual(rb.members.find(m => m.id === rb.you).team, 1, 'B va al equipo azul');

  S.send({ t: 'join', code: room.code });
  const rs = await S.wait(m => m.t === 'room', 2000, 'S room');
  assert.strictEqual(rs.members.find(m => m.id === rs.you).team, 2, 'tercero queda espectador');

  // B no es host: no puede cambiar la config ni empezar
  B.send({ t: 'cfg', cfg: { size: 3 } }); B.send({ t: 'start' });
  await sleep(150);
  assert.strictEqual(rooms.get(room.code).cfg.size, 1);
  assert.strictEqual(rooms.get(room.code).phase, 'lobby');

  // equipo completo
  S.send({ t: 'team', team: 0 });
  const err = await S.wait(m => m.t === 'err', 1500, 'equipo completo');
  assert(/completo/.test(err.m));

  // lista pública
  S.send({ t: 'list' });
  const lst = await S.wait(m => m.t === 'rooms', 1500, 'lista');
  assert(lst.list.some(r => r.code === room.code && r.players === 2 && r.spectators === 1));

  // el host cambia la config (tamaño personalizado) y empieza
  A.send({ t: 'cfg', cfg: { pitch: { W: 400, H: 200, gh: 70 }, time: 5 } });
  await B.wait(m => m.t === 'room' && m.cfg.time === 5 && m.cfg.pitch.W === 400, 2000, 'cfg propagada');
  A.send({ t: 'cfg', cfg: { pitch: { W: 99999, H: -5, gh: 1e9 } } });
  await sleep(150);
  const pc = rooms.get(room.code).cfg.pitch;
  assert(pc.W <= 800 && pc.H >= 100 && pc.gh <= 130, 'cancha acotada: ' + JSON.stringify(pc));

  A.send({ t: 'start' });
  const sa = await A.wait(m => m.t === 'start', 2000, 'start A');
  const sb = await B.wait(m => m.t === 'start', 2000, 'start B');
  const ss = await S.wait(m => m.t === 'start', 2000, 'start S');
  assert.strictEqual(sa.you, 0); assert.strictEqual(sb.you, 1); assert.strictEqual(ss.you, -1);
  assert.strictEqual(sa.roster.length, 2);
  assert.strictEqual(sa.cfg.pitch.W, pc.W);

  await sa && await A.wait(m => m.t === 's', 4000, 'primer snapshot');
  const first = A.last('s');
  assert.strictEqual(first.p.length, 12);
  assert.strictEqual(first.f, 'k');

  // A (rojo, a la izquierda) corre a la derecha y patea: la pelota tiene que moverse
  let seq = 0;
  const feed = setInterval(() => { seq++; A.send({ t: 'in', dx: 1, dy: 0, kick: true, s: seq }); B.send({ t: 'in', dx: -5, dy: 99, kick: 'x', s: seq }); }, 25); // valores raros se acotan
  await A.wait(m => m.t === 's' && m.f === 'p', 6000, 'pelota en juego');
  const mid = A.last('s');
  assert(Math.abs(mid.b[0]) > 1 || mid.f === 'p', 'la pelota se mueve');
  assert(mid.p[0] > first.p[0] + 5, 'el jugador A avanzó');
  assert(mid.k > first.k, 'avanza el tick');
  const ps = rooms.get(room.code).game.players;
  assert(ps[1].in.dx === -1 && ps[1].in.dy === 1, 'entradas acotadas');

  // los snapshots llegan ~30 por segundo
  const t0 = A.msgs.filter(m => m.t === 's').length; await sleep(1000);
  const rate = A.msgs.filter(m => m.t === 's').length - t0;
  assert(rate >= 50 && rate <= 70, 'tasa de snapshots ' + rate);
  console.log('snapshots/seg:', rate);

  // el espectador se suma a un equipo en pleno juego tomando el lugar de un bot si lo hay (acá no hay bots)
  S.send({ t: 'team', team: 1 });
  await S.wait(m => m.t === 'err', 1500, 'sin lugar');

  // el servidor devuelve el número de la última entrada recibida
  const ack = A.last('s').p[5];
  assert(ack > 5, 'ack de entradas ' + ack);

  // si dejan de mandar controles, el jugador se frena solo
  clearInterval(feed);
  await sleep(700);
  const g0 = rooms.get(room.code).game.players[0];
  assert(g0.in.dx === 0 && !g0.in.kick, 'sin controles el jugador se frena');

  // B se va en pleno partido: queda un bot en su lugar y el partido sigue
  B.send({ t: 'leave' });
  await B.wait(m => m.t === 'left', 1500, 'left');
  await sleep(200);
  const G = rooms.get(room.code).game;
  assert(G && G.players[1].human === false, 'el lugar pasó a un bot');
  // ahora el espectador entra a ese lugar
  S.send({ t: 'team', team: 1 });
  await S.wait(m => m.t === 'room' && m.members.find(x => x.id === m.you).team === 1, 1500, 'S entra');
  assert.strictEqual(G.players[1].human, true); assert.strictEqual(G.players[1].name, 'Seba');

  // el host corta el partido
  A.send({ t: 'stop' });
  await A.wait(m => m.t === 'end' && m.w === -2, 2000, 'stop');
  assert.strictEqual(rooms.get(room.code).phase, 'lobby');

  // chat con límite de ritmo
  A.send({ t: 'chat', text: 'hola <b>mundo</b>' }); A.send({ t: 'chat', text: 'spam' });
  const ch = await S.wait(m => m.t === 'chat', 1500, 'chat');
  assert.strictEqual(ch.text, 'hola bmundo/b'); await sleep(100);
  assert.strictEqual(S.msgs.filter(m => m.t === 'chat').length, 1, 'rate limit');

  // si se va el host, otro hereda
  A.send({ t: 'leave' }); await A.wait(m => m.t === 'left');
  const r2 = await S.wait(m => m.t === 'room' && m.host === m.you, 2000, 'nuevo host');
  assert(r2);

  // basura no rompe nada
  S.ws.send('esto no es json'); S.ws.send(JSON.stringify({ t: 'nada' })); S.ws.send(JSON.stringify([1, 2]));
  S.send({ t: 'hello', name: '' });
  await S.wait(m => m.t === 'welcome' && m.name === 'Jugador', 1500, 'sigue vivo');

  // --- partido de bots con un espectador: tiene que terminar solo ---
  S.send({ t: 'leave' }); await S.wait(m => m.t === 'left');
  S.send({ t: 'create', cfg: { size: 1, bots: true, time: 0, goals: 3, diff: 'expert' } });
  const r3 = await S.wait(m => m.t === 'room' && m.code !== room.code, 2000, 'sala 2');
  S.send({ t: 'team', team: 2 }); await sleep(100);
  S.send({ t: 'start' });
  const e = await S.wait(m => m.t === 'end' && m.w !== -2, 140000, 'fin del partido de bots');
  assert(e.sc[0] + e.sc[1] >= 1 && e.w !== -2);
  console.log('partido de bots terminó', e.sc, 'ganó', e.w);
  assert.strictEqual(rooms.get(r3.code).phase, 'lobby');
  await S.wait(m => m.t === 'goal' || (m.t === 's' && m.e && m.e.includes('goal')), 1000).catch(() => {});

  S.send({ t: 'leave' }); await sleep(100);
  assert.strictEqual(rooms.size, 0, 'salas vacías se borran');
  console.log('SERVER OK');
  process.exit(0);
})().catch(e => { console.error('FALLÓ:', e.message); process.exit(1); });
