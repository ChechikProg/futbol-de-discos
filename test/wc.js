const WC = require('../src/wc.js');
const assert = require('assert');

function check(format, user, mode) {
  const st = WC.newTournament({ format, user, diff: 'normal', minutes: 2, size: 1, pitch: { preset: 'classic' } });
  const nG = format / 4;
  assert.strictEqual(st.groups.length, nG);
  const all = st.groups.flatMap(g => g.teams);
  assert.strictEqual(new Set(all).size, format, 'teams unique');
  assert(all.includes(user), 'user included');
  for (const g of st.groups) assert.strictEqual(g.m.length, 6);
  let userMatches = 0, guard = 0;
  while (st.stage !== 'done' && guard++ < 100) {
    const p = WC.pending(st);
    if (!p) {
      assert(st.out, 'no pending only when out');
      WC.simulateRest(st);
      break;
    }
    userMatches++;
    assert(p.a === user || p.b === user);
    if (mode === 'play') {
      // user wins always (+3 goals) -> must be champion
      WC.submitUser(st, 3, 0);
    } else if (mode === 'lose') {
      WC.submitUser(st, 0, 1);
    } else WC.simUser(st);
  }
  assert.strictEqual(st.stage, 'done');
  assert(st.champion && st.runnerUp && st.third);
  // contar partidos: grupos nG*6 + ko
  const ko = st.ko.rounds.reduce((n, r) => n + r.matches.length, 0);
  const total = nG * 6 + ko;
  const expected = format === 48 ? 104 : 64;
  assert.strictEqual(total, expected, `total matches ${total} vs ${expected}`);
  for (const r of st.ko.rounds) for (const m of r.matches) { assert(m.w, 'winner set'); assert(m.a !== m.b); }
  // un equipo no juega dos veces en la misma ronda
  for (const r of st.ko.rounds) { const t = r.matches.flatMap(m => [m.a, m.b]); assert.strictEqual(new Set(t).size, t.length); }
  return { st, userMatches };
}

for (const fmt of [32, 48]) {
  const win = check(fmt, 'ARG', 'play');
  assert.strictEqual(win.st.champion, 'ARG');
  assert.strictEqual(win.st.exit, 'Campeón');
  // grupos: 3 + rondas ko (dieciseisavos?) + final
  console.log(fmt, 'ganando todo: partidos del usuario =', win.userMatches, 'exit', win.st.exit);
  const lose = check(fmt, 'NZL', 'lose');
  console.log(fmt, 'perdiendo todo: partidos =', lose.userMatches, 'exit', lose.st.exit, 'champion', lose.st.champion);
  assert(lose.st.exit.length > 0);
  const sim = check(fmt, 'JAM', 'sim');
  console.log(fmt, 'simulado: exit', sim.st.exit, 'champion', sim.st.champion);
}

// estadística: el favorito gana más seguido que el último
let champs = {};
for (let i = 0; i < 300; i++) {
  const st = WC.newTournament({ format: 48, user: 'ESP', diff: 'normal', minutes: 2, size: 1, pitch: {} });
  WC.simulateRest(st);
  champs[st.champion] = (champs[st.champion] || 0) + 1;
}
const top = Object.entries(champs).sort((a, b) => b[1] - a[1]).slice(0, 6);
console.log('campeones en 300 simulaciones:', top.map(([c, n]) => c + ' ' + n).join(', '));
const nz = champs.NZL || 0;
assert(nz < 3, 'Nueva Zelanda casi nunca gana');

// kits: nunca dos camisetas iguales
let clash = 0;
for (const a of WC.TEAMS) for (const b of WC.TEAMS) {
  if (a === b) continue;
  const k = WC.kitsFor(a.c, b.c);
  const hx = h => parseInt(h.slice(1), 16);
  if (k[0] === k[1]) clash++;
}
console.log('kits idénticos:', clash);
assert.strictEqual(clash, 0);

// progresiva
const st = WC.newTournament({ format: 32, user: 'ARG', diff: 'prog', minutes: 1, size: 1, pitch: {} });
assert.strictEqual(WC.diffFor(st), 'easy');
console.log('WC OK');
