// Pedir la pelota: el compañero de la máquina se la pasa al que la pide (en todas las dificultades).
const assert = require('assert');
const { createGame, step, callForBall, PITCHES } = require('../src/core.js');
function trial(diff, call) {
  // el humano queda quieto en un lugar libre; el compañero tiene la pelota
  const G = createGame({ size: 2, diff, humanTeam: 0, timeLimit: 0, scoreLimit: 0, pitch: PITCHES.futsal.bySize[2] });
  const me = G.players.find(p => p.human), mate = G.players.find(p => p.team === 0 && !p.human);
  G.phase = 'play';
  me.x = me.px = 60; me.y = me.py = -150;
  mate.x = mate.px = -220; mate.y = mate.py = 40;
  G.ball.x = -190; G.ball.y = 40; G.ball.vx = G.ball.vy = 0;
  const opp = G.players.filter(p => p.team === 1); opp[0].x = 420; opp[0].y = 150; opp[1].x = 480; opp[1].y = 0;
  for (const o of opp) o.human = true;   // los rivales quedan quietos: se mide solo el pase
  let got = false;
  for (let t = 0; t < 360; t++) {
    me.in.dx = me.in.dy = 0; me.in.kick = false; for (const o of opp) { o.in.dx = o.in.dy = 0; o.in.kick = false; }
    if (call && t % 60 === 0) callForBall(G, me);
    step(G); G.events.length = 0;
    if (G.lastTouch === me || Math.hypot(G.ball.x - me.x, G.ball.y - me.y) < 40) { got = true; break; }
  }
  return got;
}
for (const d of ['easy', 'normal', 'hard', 'expert', 'impossible']) {
  let a = 0, b = 0; const N = 30;
  for (let i = 0; i < N; i++) { if (trial(d, true)) a++; if (trial(d, false)) b++; }
  console.log(d.padEnd(10), 'pidiéndola le llega', Math.round(a / N * 100) + '% | sin pedirla', Math.round(b / N * 100) + '%');
  assert(a / N >= (d === 'easy' ? 0.4 : 0.6) && a > b, d + ': no te la pasan');
}
// 1v1: no hay a quién pedirle
const G1 = createGame({ size: 1, diff: 'normal', humanTeam: 0, timeLimit: 0, scoreLimit: 0 });
assert.strictEqual(callForBall(G1, G1.players[0]), false);
console.log('CALL OK');
