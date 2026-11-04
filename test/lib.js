// Copa Libertadores: formato, sorteo, llaves ida y vuelta, final única y simulación.
const assert = require('assert');
const LIB = require('../src/lib.js');

assert.strictEqual(LIB.TEAMS.length, 32, '32 equipos');
for (const t of LIB.TEAMS) {
  assert(t.p.length >= 3, 'jugadores de ' + t.n);
  assert(LIB.stadiumOf(t.c).n, 'estadio de ' + t.n);
}
for (const c of ['BOC', 'RIV', 'RAC']) assert(LIB.BY[c], 'está ' + c);
assert.deepStrictEqual(LIB.BY.BOC.p.slice(0, 3), ['Paredes', 'Merentiel', 'Aranda']);
assert.strictEqual(LIB.stadiumOf('BOC').n, 'La Bombonera');
assert.strictEqual(LIB.stadiumOf('FLA').n, 'Maracanã');

let champs = {}, n = 0;
for (let it = 0; it < 300; it++) {
  const user = LIB.TEAMS[it % 32].c;
  const st = LIB.newTournament({ user, diff: 'normal', minutes: 2, size: 1 });
  // grupos de 4, sin dos del mismo país
  assert.strictEqual(st.groups.length, 8);
  for (const g of st.groups) {
    assert.strictEqual(g.teams.length, 4);
    assert.strictEqual(new Set(g.teams.map(c => LIB.BY[c].f)).size, 4, 'mismo país en el grupo ' + g.teams);
    assert.strictEqual(g.m.length, 12);
    for (const c of g.teams) {
      const mine = g.m.filter(m => m.h === c || m.a === c);
      assert.strictEqual(mine.length, 6, '6 partidos');
      assert.strictEqual(mine.filter(m => m.h === c).length, 3, '3 de local');
      for (const o of g.teams) if (o !== c) assert.strictEqual(mine.filter(m => m.h === o || m.a === o).length, 2, 'dos veces con cada rival');
    }
    for (let md = 0; md < 6; md++) assert.strictEqual(g.m.filter(m => m.md === md).length, 2, 'dos partidos por fecha');
  }
  // jugar: a veces gana el usuario, a veces simula
  let guard = 0, legsSeen = new Set();
  while (LIB.pending(st) && guard++ < 40) {
    const p = LIB.pending(st);
    legsSeen.add(p.label.split(' · ')[1] || '');
    if (p.kind === 'ko') {
      const tie = st.ko.rounds[st.ko.cur].ties[p.ti];
      if (!p.final) assert.strictEqual(tie.legs.length, 2, 'ida y vuelta');
      else { assert.strictEqual(tie.legs.length, 1, 'final única'); assert.strictEqual(p.stadium.n, 'Estadio Centenario'); }
      if (p.leg === 1) { assert(p.agg, 'la vuelta conoce el global'); assert(tie.legs[1].h === tie.t1, 'define de local el mejor ubicado'); }
    } else assert.strictEqual(p.stadium.n, LIB.stadiumOf(p.h).n, 'se juega en la cancha del local');
    if (it % 3 === 0) {
      // empate en la vuelta con el global igualado: penales del usuario
      if (p.kind === 'ko' && p.decisive) {
        const ag = p.agg ? (p.home ? p.agg : [p.agg[1], p.agg[0]]) : [0, 0];
        // dejar el global igualado: usuario hace los goles que le faltan
        const ug = Math.max(0, ag[1] - ag[0]) + 1, og = ug + ag[0] - ag[1];
        LIB.submitUser(st, ug, og, [4, 3]);
        const r = st.ko.rounds.find(r => r.ties.some(t => (t.t1 === user || t.t2 === user) && t.w));
        const tie = r && r.ties.find(t => t.t1 === user || t.t2 === user);
        if (tie && tie.w) { const [a, b] = LIB.aggregate(tie); if (a === b) assert.strictEqual(tie.w, user, 'gana por penales'); }
      } else LIB.submitUser(st, 2, 0);
    } else LIB.simUser(st);
  }
  if (st.stage !== 'done') LIB.simulateRest(st);
  assert.strictEqual(st.stage, 'done');
  // estructura de las llaves
  const rounds = st.ko.rounds;
  assert.deepStrictEqual(rounds.map(r => r.ties.length), [8, 4, 2, 1]);
  assert.deepStrictEqual(rounds.map(r => r.name), ['Octavos de final', 'Cuartos de final', 'Semifinales', 'Final']);
  for (const r of rounds) for (const t of r.ties) {
    assert(t.w === t.t1 || t.w === t.t2);
    const [a, b] = LIB.aggregate(t);
    if (a !== b) assert.strictEqual(t.w, a > b ? t.t1 : t.t2, 'gana el global');
    else assert(t.pen && t.pen[0] !== t.pen[1], 'global igualado: penales');
  }
  // los 16 de octavos son los dos primeros de cada grupo
  const q = new Set(rounds[0].ties.flatMap(t => [t.t1, t.t2]));
  st.groups.forEach((g, i) => { const tb = LIB.table(st, i); assert(q.has(tb[0].c) && q.has(tb[1].c) && !q.has(tb[2].c)); });
  for (const t of rounds[0].ties) assert(st.groups.findIndex(g => g.teams.includes(t.t1)) !== st.groups.findIndex(g => g.teams.includes(t.t2)), 'octavos sin repetir grupo');
  assert(st.exit, 'resultado del usuario');
  if (st.exit === 'Campeón') assert.strictEqual(st.champion, user);
  champs[st.champion] = (champs[st.champion] || 0) + 1; n++;
}
const top = Object.entries(champs).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c, k]) => c + ' ' + k).join(', ');
console.log('campeones más frecuentes en', n, 'torneos:', top);
console.log('LIB OK');
