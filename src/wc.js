'use strict';
/* ===== Mundial: sorteo, fase de grupos, llaves y simulación (sin DOM) ===== */
const WC = (() => {
  /* c: código, n: nombre, r: valoración propia (tipo Elo), k: [camiseta, detalle], f: confederación */
  const TEAMS = [
    { c: 'ESP', n: 'España', r: 2150, k: ['#d8352f', '#f4c430'], f: 'UEFA' },
    { c: 'ARG', n: 'Argentina', r: 2140, k: ['#75aadb', '#ffffff'], f: 'CONMEBOL' },
    { c: 'FRA', n: 'Francia', r: 2130, k: ['#1f3f8f', '#ffffff'], f: 'UEFA' },
    { c: 'ENG', n: 'Inglaterra', r: 2070, k: ['#f2f2f2', '#c8102e'], f: 'UEFA' },
    { c: 'BRA', n: 'Brasil', r: 2040, k: ['#f5d90a', '#0b8f3c'], f: 'CONMEBOL' },
    { c: 'POR', n: 'Portugal', r: 2040, k: ['#a3141f', '#0b6b3a'], f: 'UEFA' },
    { c: 'NED', n: 'Países Bajos', r: 2000, k: ['#f58220', '#1b2a6b'], f: 'UEFA' },
    { c: 'GER', n: 'Alemania', r: 1990, k: ['#ececec', '#111111'], f: 'UEFA' },
    { c: 'COL', n: 'Colombia', r: 1950, k: ['#f4cf1e', '#1c3d8f'], f: 'CONMEBOL' },
    { c: 'URU', n: 'Uruguay', r: 1950, k: ['#6cb4e4', '#111111'], f: 'CONMEBOL' },
    { c: 'CRO', n: 'Croacia', r: 1950, k: ['#e8e8e8', '#d3202f'], f: 'UEFA' },
    { c: 'BEL', n: 'Bélgica', r: 1940, k: ['#c8102e', '#111111'], f: 'UEFA' },
    { c: 'MAR', n: 'Marruecos', r: 1940, k: ['#b01c2e', '#0b6b3a'], f: 'CAF' },
    { c: 'ITA', n: 'Italia', r: 1930, k: ['#1d5fd0', '#ffffff'], f: 'UEFA' },
    { c: 'JPN', n: 'Japón', r: 1930, k: ['#1b3a8a', '#ffffff'], f: 'AFC' },
    { c: 'SUI', n: 'Suiza', r: 1890, k: ['#d52b1e', '#ffffff'], f: 'UEFA' },
    { c: 'USA', n: 'EE. UU.', r: 1880, k: ['#f2f2f2', '#1a2f6b'], f: 'CONCACAF' },
    { c: 'MEX', n: 'México', r: 1880, k: ['#0f7a43', '#ffffff'], f: 'CONCACAF' },
    { c: 'SEN', n: 'Senegal', r: 1870, k: ['#f2f2f2', '#0b8f3c'], f: 'CAF' },
    { c: 'DEN', n: 'Dinamarca', r: 1870, k: ['#c8102e', '#ffffff'], f: 'UEFA' },
    { c: 'IRN', n: 'Irán', r: 1860, k: ['#f2f2f2', '#d3202f'], f: 'AFC' },
    { c: 'AUT', n: 'Austria', r: 1860, k: ['#d3202f', '#ffffff'], f: 'UEFA' },
    { c: 'ECU', n: 'Ecuador', r: 1850, k: ['#f4cf1e', '#1c3d8f'], f: 'CONMEBOL' },
    { c: 'NOR', n: 'Noruega', r: 1850, k: ['#d3202f', '#1a2f6b'], f: 'UEFA' },
    { c: 'KOR', n: 'Corea del Sur', r: 1840, k: ['#d3202f', '#1a2f6b'], f: 'AFC' },
    { c: 'TUR', n: 'Turquía', r: 1840, k: ['#e30a17', '#ffffff'], f: 'UEFA' },
    { c: 'AUS', n: 'Australia', r: 1810, k: ['#f2c400', '#0b6b3a'], f: 'AFC' },
    { c: 'CAN', n: 'Canadá', r: 1800, k: ['#d52b1e', '#ffffff'], f: 'CONCACAF' },
    { c: 'SWE', n: 'Suecia', r: 1790, k: ['#f2c400', '#1c3d8f'], f: 'UEFA' },
    { c: 'EGY', n: 'Egipto', r: 1790, k: ['#c8102e', '#111111'], f: 'CAF' },
    { c: 'PAR', n: 'Paraguay', r: 1790, k: ['#d52b1e', '#1c3d8f'], f: 'CONMEBOL' },
    { c: 'SCO', n: 'Escocia', r: 1790, k: ['#14336b', '#ffffff'], f: 'UEFA' },
    { c: 'CIV', n: 'Costa de Marfil', r: 1790, k: ['#f58220', '#0b8f3c'], f: 'CAF' },
    { c: 'ALG', n: 'Argelia', r: 1780, k: ['#f2f2f2', '#0b8f3c'], f: 'CAF' },
    { c: 'NGA', n: 'Nigeria', r: 1770, k: ['#0b8f3c', '#f2f2f2'], f: 'CAF' },
    { c: 'TUN', n: 'Túnez', r: 1760, k: ['#d3202f', '#ffffff'], f: 'CAF' },
    { c: 'CHI', n: 'Chile', r: 1740, k: ['#d3202f', '#1a2f6b'], f: 'CONMEBOL' },
    { c: 'UZB', n: 'Uzbekistán', r: 1740, k: ['#f2f2f2', '#1c8fd0'], f: 'AFC' },
    { c: 'PAN', n: 'Panamá', r: 1730, k: ['#d3202f', '#1a2f6b'], f: 'CONCACAF' },
    { c: 'KSA', n: 'Arabia Saudita', r: 1720, k: ['#0b6b3a', '#ffffff'], f: 'AFC' },
    { c: 'GHA', n: 'Ghana', r: 1720, k: ['#f2f2f2', '#d3202f'], f: 'CAF' },
    { c: 'CMR', n: 'Camerún', r: 1720, k: ['#0b8f3c', '#d3202f'], f: 'CAF' },
    { c: 'QAT', n: 'Qatar', r: 1700, k: ['#8a1538', '#ffffff'], f: 'AFC' },
    { c: 'CRC', n: 'Costa Rica', r: 1700, k: ['#d3202f', '#1a2f6b'], f: 'CONCACAF' },
    { c: 'RSA', n: 'Sudáfrica', r: 1700, k: ['#f2c400', '#0b6b3a'], f: 'CAF' },
    { c: 'JOR', n: 'Jordania', r: 1690, k: ['#f2f2f2', '#d3202f'], f: 'AFC' },
    { c: 'JAM', n: 'Jamaica', r: 1680, k: ['#f2c400', '#0b6b3a'], f: 'CONCACAF' },
    { c: 'NZL', n: 'Nueva Zelanda', r: 1620, k: ['#f2f2f2', '#111111'], f: 'OFC' }
  ];
  const BY = {};
  for (const t of TEAMS) BY[t.c] = t;
  const CONFS = ['UEFA', 'CONMEBOL', 'CONCACAF', 'CAF', 'AFC', 'OFC'];
  const LADDER = ['easy', 'normal', 'normal', 'normal', 'hard', 'hard', 'expert', 'expert'];
  const GROUP_FIX = [[[0, 1], [2, 3]], [[3, 1], [2, 0]], [[3, 0], [1, 2]]];

  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const stars = c => Math.max(1, Math.min(5, Math.round((BY[c].r - 1600) / 110)));

  /* ---- simulación por valoración ---- */
  function pois(l) { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= Math.random(); } while (p > L); return k - 1; }
  function simScore(a, b) {
    const d = (BY[a].r - BY[b].r) / 400;
    return [pois(1.3 * Math.pow(10, 0.3 * d)), pois(1.3 * Math.pow(10, -0.3 * d))];
  }
  function simKo(a, b) {
    let [ga, gb] = simScore(a, b), pen = null, w;
    if (ga !== gb) w = ga > gb ? a : b;
    else {
      const d = (BY[a].r - BY[b].r) / 400;
      const aWins = Math.random() < 0.5 + 0.1 * Math.tanh(d * 2);
      const lo = 2 + Math.floor(Math.random() * 3), hi = lo + 1 + (Math.random() < 0.3 ? 1 : 0);
      pen = aWins ? [hi, lo] : [lo, hi]; w = aWins ? a : b;
    }
    return { ga, gb, pen, w };
  }

  /* ---- sorteo ---- */
  function newTournament(o) {
    const sorted = TEAMS.slice().sort((x, y) => y.r - x.r);
    let pool = o.format === 32 ? sorted.slice(0, 32) : sorted.slice();
    if (!pool.some(t => t.c === o.user)) pool[pool.length - 1] = BY[o.user];
    pool.sort((x, y) => y.r - x.r);
    const nG = pool.length / 4, pots = [];
    for (let p = 0; p < 4; p++) pots.push(shuffle(pool.slice(p * nG, (p + 1) * nG)));
    const st = {
      v: 1, format: o.format, user: o.user, diff: o.diff, minutes: o.minutes, size: o.size, pitch: o.pitch,
      step: 0, stage: 'groups', md: 0, groups: [], ko: { rounds: [], cur: 0 },
      out: false, exit: null, champion: null, runnerUp: null, third: null, last: null, tb: {}
    };
    for (const t of pool) st.tb[t.c] = Math.random();
    for (let g = 0; g < nG; g++) {
      const teams = pots.map(p => p[g].c);
      const grp = { n: String.fromCharCode(65 + g), teams, m: [] };
      GROUP_FIX.forEach((day, md) => day.forEach(([i, j]) => grp.m.push({ md, a: teams[i], b: teams[j], ga: null, gb: null })));
      st.groups.push(grp);
    }
    advance(st);
    return st;
  }

  /* ---- tablas ---- */
  function table(st, gi) {
    const g = st.groups[gi], rows = {};
    for (const c of g.teams) rows[c] = { c, pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0, dg: 0, pts: 0 };
    for (const m of g.m) {
      if (m.ga == null) continue;
      const A = rows[m.a], B = rows[m.b];
      A.pj++; B.pj++; A.gf += m.ga; A.gc += m.gb; B.gf += m.gb; B.gc += m.ga;
      if (m.ga > m.gb) { A.g++; B.p++; A.pts += 3; } else if (m.ga < m.gb) { B.g++; A.p++; B.pts += 3; } else { A.e++; B.e++; A.pts++; B.pts++; }
    }
    const list = Object.values(rows);
    for (const r of list) r.dg = r.gf - r.gc;
    return list.sort((x, y) => y.pts - x.pts || y.dg - x.dg || y.gf - x.gf || st.tb[y.c] - st.tb[x.c]);
  }
  const rankSort = (st) => (x, y) => y.pts - x.pts || y.dg - x.dg || y.gf - x.gf || st.tb[y.c] - st.tb[x.c];

  /* ---- llaves ---- */
  function roundName(n) {
    return { 16: 'Dieciseisavos de final', 8: 'Octavos de final', 4: 'Cuartos de final', 2: 'Semifinales', 1: 'Final' }[n] || 'Ronda';
  }
  function mkRound(pairs) {
    return { name: roundName(pairs.length), matches: pairs.map((p, i) => ({ id: 'm' + i, a: p[0], b: p[1], ga: null, gb: null, pen: null, w: null })) };
  }
  function pairAvoid(A, B, grpOf) {
    let best = null;
    for (let t = 0; t < 400; t++) {
      const b = shuffle(B.slice());
      if (A.every((a, i) => grpOf(a) !== grpOf(b[i]))) return b;
      best = b;
    }
    return best;
  }
  function buildKo(st) {
    const tabs = st.groups.map((_, i) => table(st, i));
    const grpOf = c => st.groups.findIndex(g => g.teams.includes(c));
    let pairs;
    if (st.format === 32) {
      const W = tabs.map(t => t[0].c), S = tabs.map(t => t[1].c);
      pairs = [[W[0], S[1]], [W[2], S[3]], [W[4], S[5]], [W[6], S[7]], [W[1], S[0]], [W[3], S[2]], [W[5], S[4]], [W[7], S[6]]];
    } else {
      const wins = tabs.map(t => t[0]).sort(rankSort(st)).map(r => r.c);
      const secs = tabs.map(t => t[1]).sort(rankSort(st)).map(r => r.c);
      const thirds = tabs.map(t => t[2]).sort(rankSort(st)).slice(0, 8).map(r => r.c);
      const thirdsWorstFirst = thirds.slice().reverse();
      const strong = wins.slice(0, 8), weak = wins.slice(8);
      pairs = [];
      let tt = thirdsWorstFirst.slice();
      // los ganadores mejor ubicados enfrentan a los peores terceros; sin repetir grupo
      const tOrdered = [];
      const left = tt.slice();
      for (const w of strong) {
        let k = left.findIndex(t => grpOf(t) !== grpOf(w));
        if (k < 0) k = 0;
        tOrdered.push(left.splice(k, 1)[0]);
      }
      strong.forEach((w, i) => pairs.push([w, tOrdered[i]]));
      const secPool = secs.slice().reverse(); // peores segundos contra los ganadores restantes
      const forWeak = secPool.slice(0, 4), rest = secPool.slice(4);
      const fw = pairAvoid(weak, forWeak, grpOf);
      weak.forEach((w, i) => pairs.push([w, fw[i]]));
      const half = rest.slice(0, 4), other = pairAvoid(half, rest.slice(4), grpOf);
      half.forEach((s, i) => pairs.push([s, other[i]]));
      shuffle(pairs);
    }
    // sin ventaja de local: el usuario puede quedar de cualquier lado
    st.ko = { rounds: [mkRound(pairs)], cur: 0 };
    return pairs.flat();
  }

  /* ---- flujo ---- */
  function diffFor(st) {
    return st.diff === 'prog' ? LADDER[Math.min(st.step, LADDER.length - 1)] : st.diff;
  }

  function pending(st) {
    if (st.stage === 'done' || st.out) return null;
    if (st.stage === 'groups') {
      for (let gi = 0; gi < st.groups.length; gi++) {
        const g = st.groups[gi];
        for (let mi = 0; mi < g.m.length; mi++) {
          const m = g.m[mi];
          if (m.md === st.md && m.ga == null && (m.a === st.user || m.b === st.user)) {
            return { kind: 'group', gi, mi, a: m.a, b: m.b, label: 'Fase de grupos · Grupo ' + g.n + ' · Fecha ' + (st.md + 1) + ' de 3' };
          }
        }
      }
      return null;
    }
    const r = st.ko.rounds[st.ko.cur];
    for (let mi = 0; mi < r.matches.length; mi++) {
      const m = r.matches[mi];
      if (m.w == null && (m.a === st.user || m.b === st.user)) {
        const third = r.name === 'Final' && mi === 1;
        return { kind: 'ko', mi, a: m.a, b: m.b, label: third ? 'Partido por el tercer puesto' : r.name };
      }
    }
    return null;
  }

  function completeCurrent(st) {
    if (st.stage === 'groups') {
      const items = [];
      for (const g of st.groups) for (const m of g.m) {
        if (m.md !== st.md) continue;
        if (m.ga == null) { const s = simScore(m.a, m.b); m.ga = s[0]; m.gb = s[1]; }
        items.push({ a: m.a, b: m.b, ga: m.ga, gb: m.gb, tag: 'Grupo ' + g.n });
      }
      st.last = { title: 'Fase de grupos · Fecha ' + (st.md + 1), items };
      st.md++;
      if (st.md === 3) {
        const q = buildKo(st);
        st.stage = 'ko';
        if (!q.includes(st.user)) { st.out = true; st.exit = 'Fase de grupos'; }
      }
      return;
    }
    const r = st.ko.rounds[st.ko.cur];
    for (const m of r.matches) {
      if (m.w == null) Object.assign(m, simKo(m.a, m.b));
    }
    st.last = { title: r.name, items: r.matches.map((m, i) => ({ a: m.a, b: m.b, ga: m.ga, gb: m.gb, pen: m.pen, w: m.w, tag: r.name === 'Final' && i === 1 ? 'Tercer puesto' : '' })) };
    const loser = m => (m.w === m.a ? m.b : m.a);
    if (r.name === 'Final') {
      st.champion = r.matches[0].w; st.runnerUp = loser(r.matches[0]);
      st.third = r.matches[1].w;
      st.stage = 'done';
      if (!st.exit) {
        if (st.user === st.champion) st.exit = 'Campeón';
        else if (st.user === st.runnerUp) st.exit = 'Subcampeón';
        else if (st.user === st.third) st.exit = 'Tercer puesto';
        else st.exit = 'Cuarto puesto';
      }
      return;
    }
    const winners = r.matches.map(m => m.w);
    const pairs = [];
    for (let i = 0; i < winners.length; i += 2) pairs.push([winners[i], winners[i + 1]]);
    if (r.name === 'Semifinales') {
      const nr = mkRound([pairs[0]]);
      nr.matches.push({ id: 'third', a: loser(r.matches[0]), b: loser(r.matches[1]), ga: null, gb: null, pen: null, w: null });
      st.ko.rounds.push(nr);
    } else {
      st.ko.rounds.push(mkRound(pairs));
      const um = r.matches.find(m => m.a === st.user || m.b === st.user);
      if (um && um.w !== st.user) { st.out = true; st.exit = r.name; }
    }
    st.ko.cur++;
  }

  function advance(st, force) {
    let guard = 0;
    while (st.stage !== 'done' && guard++ < 50) {
      if (!force && st.out) return;
      if (!force && pending(st)) return;
      completeCurrent(st);
      if (!force && st.out) return;
    }
  }

  function submitUser(st, userGoals, oppGoals) {
    const p = pending(st);
    if (!p) return;
    const userIsA = p.a === st.user;
    const ga = userIsA ? userGoals : oppGoals, gb = userIsA ? oppGoals : userGoals;
    if (p.kind === 'group') {
      const m = st.groups[p.gi].m[p.mi]; m.ga = ga; m.gb = gb;
    } else {
      const m = st.ko.rounds[st.ko.cur].matches[p.mi];
      m.ga = ga; m.gb = gb;
      if (ga !== gb) m.w = ga > gb ? m.a : m.b;
      else { const r = simKo(m.a, m.b); m.pen = r.pen; m.w = r.w; }
    }
    st.step++;
    advance(st);
  }

  function simUser(st) {
    const p = pending(st);
    if (!p) return null;
    const s = simScore(p.a, p.b);
    let ga = s[0], gb = s[1];
    if (p.kind === 'ko' && ga === gb) { const r = simKo(p.a, p.b); ga = r.ga; gb = r.gb; if (r.pen) { const m = st.ko.rounds[st.ko.cur].matches[p.mi]; m.ga = ga; m.gb = gb; m.pen = r.pen; m.w = r.w; st.step++; advance(st); return { ga, gb }; } }
    const ug = p.a === st.user ? ga : gb, og = p.a === st.user ? gb : ga;
    submitUser(st, ug, og);
    return { ga, gb };
  }

  function simulateRest(st) { advance(st, true); }

  /* colores de camiseta: si se parecen, el rival usa el color de detalle */
  function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function dist(a, b) { const x = hexRgb(a), y = hexRgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); }
  function kitsFor(a, b) {
    const ka = BY[a].k, kb = BY[b].k;
    let fb = kb[0];
    if (dist(ka[0], fb) < 110) fb = dist(ka[0], kb[1]) >= 110 ? kb[1] : (dist(ka[0], '#1a1f1c') >= 110 ? '#1a1f1c' : '#f2f2f2');
    return [ka[0], fb];
  }

  return { TEAMS, BY, CONFS, newTournament, table, pending, submitUser, simUser, simulateRest, advance, diffFor, kitsFor, stars };
})();

if (typeof module !== 'undefined') module.exports = WC;
