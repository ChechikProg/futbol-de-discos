const { createGame, step, PITCHES } = require('../src/core.js');

function play(dA, dB, size, mins, pitch) {
  const G = createGame({ size, diffTeams: [dA, dB], humanTeam: -1, timeLimit: mins, scoreLimit: 0, pitch });
  let n = 0;
  while (!G.over && n < mins * 3600 * 4) {
    step(G); G.events.length = 0; n++;
    if (!isFinite(G.ball.x) || !isFinite(G.players[0].x)) throw new Error('NaN');
  }
  return G;
}

function series(dA, dB, size, games, mins, pitchKey) {
  const pitch = typeof pitchKey === 'string' ? PITCHES[pitchKey] : pitchKey;
  let w = [0, 0, 0], goals = [0, 0];
  for (let i = 0; i < games; i++) {
    const G = play(dA, dB, size, mins, pitch);
    goals[0] += G.score[0]; goals[1] += G.score[1];
    w[G.winner < 0 ? 2 : G.winner]++;
  }
  const name = typeof pitchKey === 'string' ? pitchKey : 'custom';
  console.log(`${name.padEnd(8)} ${size}v${size} ${dA.padEnd(6)} vs ${dB.padEnd(6)} | wins ${w[0]}-${w[1]}-${w[2]} | goals/game ${(goals[0] / games).toFixed(1)} - ${(goals[1] / games).toFixed(1)}`);
}

const t0 = Date.now();
for (const pk of ['small', 'classic', 'big', 'huge']) {
  for (const size of [1, 3]) {
    series('expert', 'easy', size, 6, 3, pk);
    series('hard', 'normal', size, 6, 3, pk);
    series('expert', 'expert', size, 6, 3, pk);
  }
}
series('expert', 'normal', 2, 6, 3, { W: 220, H: 380, gh: 130 });
series('expert', 'normal', 2, 6, 3, { W: 800, H: 100, gh: 40 });
console.log('ms', Date.now() - t0);
