// Reproduce un archivo "partido-*.json" (guardado desde el juego) tick por tick. Uso: node test/replay.js archivo.json
const fs = require('fs'); const { createGame, step } = require('../src/core.js');
const R = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), cfg = R.cfg;
const G = createGame(cfg), me = G.players.find(p => p.human);
const inputs = R.rle ? R.inputs.replace(/([a-r])(\d*)/g, (m, c, n) => c.repeat(n ? +n : 1)) : R.inputs;
for (const ch of inputs) {
  const c = ch.charCodeAt(0) - 97, k = c >= 9 ? 1 : 0, r = c % 9;
  me.in.dx = Math.floor(r / 3) - 1; me.in.dy = (r % 3) - 1; me.in.kick = !!k;
  const s0 = G.score.join('-'); step(G); G.events.length = 0;
  if (G.score.join('-') !== s0) console.log('tick', G.tick, 'gol', s0, '->', G.score.join('-'));
  if (G.over) break;
}
console.log('final', G.score.join('-'), '| guardado', (R.score || []).join('-'));
