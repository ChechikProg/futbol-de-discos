// Reglas y probabilidades de la tanda de penales.
const assert = require('assert');
const PEN = require('../src/pens.js');

// gana temprano: 3-0 después de 3 tiros cada uno ya no se puede descontar
{
  const s = PEN.create('u');
  for (const [w, g] of [['u', 1], ['c', 0], ['u', 1], ['c', 0], ['u', 1]]) PEN.record(s, w, g);
  assert(!s.done, 'con 3-0 y falta un tiro del rival todavía puede empatar');
  PEN.record(s, 'c', 0);
  assert(s.done && s.winner === 'u', '3-0 tras 3 tiros cada uno: 2 restantes no alcanzan para empatar');
}
// 5-5 → muerte súbita
{
  const s = PEN.create('c');
  for (let i = 0; i < 5; i++) { PEN.record(s, 'c', 1); PEN.record(s, 'u', 1); }
  assert(!s.done, '5-5 sigue');
  PEN.record(s, 'c', 1); assert(!s.done, 'muerte súbita: falta que patee el otro');
  PEN.record(s, 'u', 0); assert(s.done && s.winner === 'c', 'muerte súbita');
  assert.strictEqual(PEN.record(s, 'u', 1).u.length, 6, 'no anota después de terminar');
}
// el que patea segundo puede ganar antes de su último tiro
{
  const s = PEN.create('u');
  for (const [w, g] of [['u', 0], ['c', 1], ['u', 0], ['c', 1], ['u', 0], ['c', 1]]) PEN.record(s, w, g);
  assert(s.done && s.winner === 'c', 'c gana 3-0 tras 3 tiros, le quedan 2 a u');
}
// simulaciones al azar: siempre terminan, el ganador tiene más goles y el orden alterna
let kicks = 0, uWins = 0;
for (let n = 0; n < 20000; n++) {
  const s = PEN.create(Math.random() < 0.5 ? 'u' : 'c'); let guard = 0, last = null;
  while (!s.done) {
    const w = PEN.turn(s); assert(w !== last, 'alternan'); last = w;
    PEN.record(s, w, Math.random() < 0.75);
    assert(guard++ < 60, 'no termina');
  }
  const [a, b] = PEN.score(s);
  assert(a !== b && (s.winner === 'u') === (a > b), 'ganador con más goles');
  assert(s.u.length >= 3 && s.c.length >= 3 && Math.abs(s.u.length - s.c.length) <= 1);
  kicks += s.u.length + s.c.length; uWins += s.winner === 'u';
}
console.log('tiros promedio por tanda:', (kicks / 20000).toFixed(1), '| gana u:', (uWins / 200).toFixed(1) + '%');
assert(uWins / 20000 > 0.45 && uWins / 20000 < 0.55, 'tanda pareja');

// probabilidades de gol
function rate(shot, keep, N = 60000) { let g = 0; for (let i = 0; i < N; i++) if (PEN.resolve(shot, keep, Math.random) === 'goal') g++; return g / N; }
const lowSide = rate({ col: 0, row: 1 }, 2), lowSaved = rate({ col: 0, row: 1 }, 0), highCorner = rate({ col: 2, row: 0 }, 0);
console.log('gol si el arquero va al otro lado:', lowSide.toFixed(2), '| va al mismo lado:', lowSaved.toFixed(2), '| ángulo arriba sin arquero:', highCorner.toFixed(2));
assert(lowSide > 0.95 && lowSaved > 0.2 && lowSaved < 0.4 && highCorner > 0.85 && highCorner < 0.9);
let tot = 0; for (let i = 0; i < 60000; i++) tot += PEN.resolve(PEN.aiShot(Math.random, 'normal'), Math.floor(Math.random() * 3), Math.random) === 'goal';
console.log('la máquina convierte', (tot / 600).toFixed(0) + '% contra un arquero al azar');
assert(tot / 60000 > 0.65 && tot / 60000 < 0.85);

// el arquero difícil lee los tiros repetidos
for (const [d, lo, hi] of [['easy', 0.35, 0.5], ['expert', 0.62, 0.78]]) {
  let hit = 0; for (let i = 0; i < 30000; i++) hit += PEN.aiKeeper(Math.random, d, [0, 0, 0]) === 0;
  const r = hit / 30000; assert(r > lo && r < hi, d + ' ' + r);
}
console.log('PENS OK');
