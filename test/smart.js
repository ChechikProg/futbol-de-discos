// Bot Imposible: misma física que el jugador, saca del medio sin trabarse y le gana a un "humano" simulado.
const assert = require('assert');
const { createGame, step, PITCHES, DIFF } = require('../src/core.js');
assert.strictEqual(DIFF.impossible.speed, 1, 'misma velocidad que el jugador');
assert.strictEqual(DIFF.impossible.kick, 1, 'misma patada que el jugador');

// saque del medio: el Imposible saca enseguida (antes se quedaba trabado y el partido no seguía)
for (const team of [0, 1]) {
  const G = createGame({ size: 1, diffTeams: ['impossible', 'impossible'], humanTeam: -1, timeLimit: 2, scoreLimit: 0, pitch: PITCHES.classic });
  G.kickTeam = team;
  let n = 0; while (G.phase === 'kickoff' && n++ < 400) { step(G); G.events.length = 0; }
  assert(G.phase === 'play', 'el equipo ' + team + ' no sacó en ' + n + ' ticks');
}

// "humano" simulado: ve la pelota con 12 ticks de atraso, se pone detrás y patea al arco
function human(lag) {
  const hist = [];
  return (G, p) => {
    hist.push({ x: G.ball.x, y: G.ball.y, vx: G.ball.vx, vy: G.ball.vy }); if (hist.length > 60) hist.shift();
    const b = hist[Math.max(0, hist.length - 1 - lag)], bx = b.x + b.vx * lag, by = b.y + b.vy * lag;
    const gx = (p.team === 0 ? 1 : -1) * G.geo.W;
    let ux = gx - bx, uy = -by; const ul = Math.hypot(ux, uy); ux /= ul; uy /= ul;
    const rel = (p.x - bx) * ux + (p.y - by) * uy, lat = (p.x - bx) * -uy + (p.y - by) * ux, s = lat >= 0 ? 1 : -1;
    const tx = rel < -8 && Math.abs(lat) < 14 ? bx : bx - ux * 30 - uy * s * 28, ty = rel < -8 && Math.abs(lat) < 14 ? by : by - uy * 30 + ux * s * 28;
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 1;
    p.in.dx = dx / d; p.in.dy = dy / d; p.in.kick = Math.hypot(G.ball.x - p.x, G.ball.y - p.y) < 34 && rel < -2;
  };
}
let gl = [0, 0];
for (let i = 0; i < 3; i++) {
  const G = createGame({ size: 1, diffTeams: ['impossible', 'normal'], humanTeam: 1, timeLimit: 2, scoreLimit: 0, pitch: PITCHES.classic });
  const h = human(12); let n = 0;
  while (!G.over && n++ < 2 * 3600 * 3) { h(G, G.players[1]); step(G); G.events.length = 0; }
  gl[0] += G.score[0]; gl[1] += G.score[1];
}
console.log('Imposible contra "humano" simulado (3 partidos de 2 min): goles', gl.join('-'));
assert(gl[0] >= 6 && gl[0] > gl[1] * 3, 'el Imposible debería ganar con claridad: ' + gl);
console.log('SMART OK');
