// Penales: reglas de la tanda y física de cada penal (como el mapa de penales de HaxBall).
const assert = require('assert');
const PEN = require('../src/pens.js');
const core = require('../src/core.js');
const idle = { dx: 0, dy: 0, kick: false };
const kit = ['#e56e56', '#5689e5'];

/* ---- reglas de la tanda ---- */
{
  const s = PEN.create('u');
  for (const [w, g] of [['u', 1], ['c', 0], ['u', 1], ['c', 0], ['u', 1]]) PEN.record(s, w, g);
  assert(!s.done, 'con 3-0 y falta un tiro del rival todavía puede empatar');
  PEN.record(s, 'c', 0);
  assert(s.done && s.winner === 'u', '3-0 tras 3 tiros cada uno: 2 restantes no alcanzan para empatar');
}
{
  const s = PEN.create('c');
  for (let i = 0; i < 5; i++) { PEN.record(s, 'c', 1); PEN.record(s, 'u', 1); }
  assert(!s.done, '5-5 sigue');
  PEN.record(s, 'c', 1); assert(!s.done, 'muerte súbita: falta que patee el otro');
  PEN.record(s, 'u', 0); assert(s.done && s.winner === 'c', 'muerte súbita');
  assert.strictEqual(PEN.record(s, 'u', 1).u.length, 6, 'no anota después de terminar');
}
{
  const s = PEN.create('u');
  for (const [w, g] of [['u', 0], ['c', 1], ['u', 0], ['c', 1], ['u', 0], ['c', 1]]) PEN.record(s, w, g);
  assert(s.done && s.winner === 'c', 'c gana 3-0 tras 3 tiros, le quedan 2 a u');
}
for (let n = 0; n < 5000; n++) {
  const s = PEN.create(Math.random() < 0.5 ? 'u' : 'c'); let guard = 0, last = null;
  while (!s.done) { const w = PEN.turn(s); assert(w !== last); last = w; PEN.record(s, w, Math.random() < 0.7); assert(guard++ < 60); }
  const [a, b] = PEN.score(s);
  assert(a !== b && (s.winner === 'u') === (a > b));
}

/* ---- física de un penal ---- */
function play(Kk, shooter, keeper, max = 2500) { let g = 0; while (!Kk.result && g++ < max) PEN.tick(Kk, shooter(Kk), keeper(Kk)); return Kk.result; }
const mk = diff => PEN.newKick({ diff, kits: kit, names: ['A', 'B'] });
{
  const Kk = mk('normal'), W = Kk.G.geo.W;
  assert.strictEqual(Math.round(Kk.G.ball.x), W - PEN.SPOT); assert(Kk.G.players[0].x < Kk.G.ball.x - 60, 'el pateador arranca atrás');
  assert(Math.abs(Kk.G.players[1].x - (W - 24)) < 1 && Kk.G.players[1].y === 0, 'el arquero arranca en el arco');
}
// pateador de la máquina contra un arquero quieto: casi siempre es gol
for (const [d, min] of [['easy', 0.65], ['normal', 0.85], ['expert', 0.92]]) {
  let goals = 0; const N = 150;
  for (let i = 0; i < N; i++) { const Kk = mk(d); if (play(Kk, PEN.aiShooter, () => idle) === 'goal') goals++; }
  console.log('máquina patea (' + d + ') contra arquero quieto: gol', Math.round(goals / N * 100) + '%');
  assert(goals / N >= min, d + ' ' + goals / N);
}
// arquero de la máquina contra un pateador que dispara siempre al medio: ataja casi todo
{
  let saves = 0; const N = 100;
  for (let i = 0; i < N; i++) {
    const Kk = mk('normal'); Kk.ai.aimY = 0; Kk.ai.guess = false;
    if (play(Kk, PEN.aiShooter, PEN.aiKeeper) === 'save') saves++;
  }
  console.log('arquero normal contra tiros al medio: ataja', saves + '%'); assert(saves >= 90);
}
// el que patea tiene 10 segundos: si no patea, es "afuera" por tiempo
{
  const Kk = mk('normal'); const r = play(Kk, () => idle, () => idle);
  assert.strictEqual(r, 'miss'); assert.strictEqual(Kk.reason, 'tiempo'); assert(Kk.ticks > PEN.AIM_TICKS);
}
// tiro muy abierto: afuera
{
  let miss = 0; const N = 30;
  for (let i = 0; i < N; i++) { const Kk = mk('normal'); Kk.ai.aimY = (i % 2 ? 1 : -1) * 180; Kk.ai.guess = false; if (play(Kk, PEN.aiShooter, () => idle) === 'miss') miss++; }
  assert(miss >= 28, 'tiros abiertos: ' + miss);
}
// el arquero no puede salir de su área
{
  const Kk = mk('normal'), G = Kk.G, gh = G.geo.gh, W = G.geo.W;
  for (let i = 0; i < 300; i++) PEN.tick(Kk, idle, { dx: 1, dy: -1, kick: false });
  assert(G.players[1].y >= -(gh - 10) - 0.01 && G.players[1].x <= W - PEN.KEEPER.x1 + 0.01, 'arquero acotado');
  for (let i = 0; i < 300; i++) PEN.tick(Kk, idle, { dx: -1, dy: 1, kick: false });
  assert(G.players[1].y <= gh - 10 + 0.01 && G.players[1].x >= W - PEN.KEEPER.x0 - 0.01, 'arquero acotado');
}
// un solo toque: después del tiro el que patea no puede volver a tocar la pelota ni patear
{
  const Kk = mk('normal'); Kk.ai.wait = 5; const G = Kk.G, sh = G.players[0], gk = G.players[1];
  let g = 0; while (Kk.shotTick == null && g++ < 900) PEN.tick(Kk, PEN.aiShooter(Kk), idle);
  assert(Kk.shotTick != null && sh.noBall, 'el primer toque es el tiro');
  G.ball.x = sh.x + 8; G.ball.y = sh.y; G.ball.vx = G.ball.vy = 0;
  for (let i = 0; i < 5; i++) PEN.tick(Kk, { dx: 1, dy: 0, kick: true }, idle);
  assert(Math.hypot(G.ball.vx, G.ball.vy) < 0.05, 'el pateador no puede tocarla de nuevo: ' + Math.hypot(G.ball.vx, G.ball.vy));
  for (let i = 0; i < 90; i++) PEN.tick(Kk, { dx: 1, dy: 0, kick: true }, idle);
  assert(Math.abs(sh.vx) < 0.2 && Math.abs(sh.vy) < 0.2, 'queda quieto después del tiro');
}
// el arquero no puede adelantarse ni patear
{
  const Kk = mk('normal'), G = Kk.G, W = G.geo.W, gk = G.players[1];
  for (let i = 0; i < 300; i++) PEN.tick(Kk, idle, { dx: -1, dy: 0, kick: false });
  assert(gk.x >= W - PEN.KEEPER.x0 - 0.01 && W - gk.x <= 36, 'no se adelanta: ' + (W - gk.x));
  const K2 = mk('normal'), g2 = K2.G; g2.ball.x = g2.players[1].x - 24; g2.ball.y = g2.players[1].y; g2.ball.vx = g2.ball.vy = 0;
  PEN.tick(K2, idle, { dx: 0, dy: 0, kick: true });
  assert(Math.hypot(g2.ball.vx, g2.ball.vy) < 1, 'el arquero no patea: ' + Math.hypot(g2.ball.vx, g2.ball.vy));
}
// una tanda completa máquina contra máquina termina bien
for (const d of ['easy', 'normal', 'hard', 'expert']) {
  for (let n = 0; n < 12; n++) {
    const S = PEN.create(n % 2 ? 'u' : 'c'); let guard = 0;
    while (!S.done) {
      const who = PEN.turn(S), Kk = PEN.newKick({ diff: d, kits: kit, names: ['A', 'B'] });
      const r = play(Kk, PEN.aiShooter, PEN.aiKeeper); assert(r, 'sin resultado');
      PEN.record(S, who, r === 'goal'); assert(guard++ < 60);
    }
    assert(S.winner);
  }
}
// gol de oro: dura 1 minuto y después queda empatado para ir a penales
{
  const G = core.createGame({ size: 1, diff: 'normal', humanTeam: 0, timeLimit: 3, scoreLimit: 0 });
  G.score = [1, 1]; G.phase = 'play'; G.playTicks = 3 * 3600 - 1; G.ball.x = G.ball.y = 0;
  core.step(G); core.step(G);
  assert(G.overtime && !G.over, 'empate: empieza el gol de oro');
  let n = 0; while (!G.over && n++ < 4000) { G.ball.x = 0; G.ball.y = 0; G.ball.vx = G.ball.vy = 0; core.step(G); }
  assert(G.over && G.tied && G.winner === -1, 'sin gol: queda empatado para penales');
  assert(G.otTicks === core.C.goldenTicks && core.C.goldenTicks === 3600, 'dura 1 minuto: ' + G.otTicks);
}
{
  const G = core.createGame({ size: 1, diff: 'normal', humanTeam: 0, timeLimit: 3, scoreLimit: 0 });
  G.score = [2, 2]; G.phase = 'play'; G.playTicks = 3 * 3600 - 1; G.ball.x = G.ball.y = 0;
  core.step(G); core.step(G); assert(G.overtime);
  G.ball.x = G.geo.W + 1; G.ball.vx = 0; core.step(G);
  let n = 0; while (!G.over && n++ < 400) core.step(G);
  assert(G.over && !G.tied && G.winner === 0 && G.score[0] === 3, 'el gol de oro termina el partido');
}
// fase de grupos (allowDraw): ni gol de oro ni penales
{
  const G = core.createGame({ size: 1, diff: 'normal', humanTeam: 0, timeLimit: 3, scoreLimit: 0, allowDraw: true });
  G.score = [1, 1]; G.phase = 'play'; G.playTicks = 3 * 3600 - 1; G.ball.x = G.ball.y = 0;
  core.step(G); core.step(G);
  assert(G.over && !G.overtime && !G.tied && G.winner === -1, 'el empate de grupos queda empate');
}
console.log('PENS OK');
