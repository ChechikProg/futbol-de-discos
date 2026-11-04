'use strict';
/* ===== Copa Libertadores: equipos, estadios, sorteo, grupos, llaves ida y vuelta y simulación (sin DOM) =====
   Formato: 32 equipos en 8 grupos de 4, todos contra todos a ida y vuelta (6 fechas). Pasan los 2 primeros.
   Octavos, cuartos y semis a ida y vuelta (define el global; si en la vuelta queda igualado: gol de oro y penales).
   Final a partido único en cancha neutral (Estadio Centenario). Sin gol de visitante. */
const LIB = (() => {
  /* estadios: style dibuja las tribunas; crowd: colores de la gente (null = los del local); pitch: medidas de la cancha */
  const CLASSIC = { W: 370, H: 170, gh: 64 };
  const STADIUMS = {
    bombonera: { n: 'La Bombonera', style: 'bombonera', crowd: ['#0b3d91', '#f2c400'], pitch: { W: 330, H: 155, gh: 62 } },
    monumental: { n: 'Estadio Más Monumental', style: 'oval', crowd: ['#f2f2f2', '#d3202f'], pitch: { W: 390, H: 180, gh: 64 } },
    cilindro: { n: 'El Cilindro', style: 'circle', crowd: ['#6cb4e4', '#f2f2f2'], pitch: CLASSIC },
    uno: { n: 'Estadio UNO', style: 'roof', crowd: ['#d3202f', '#f2f2f2'], pitch: CLASSIC },
    fortaleza: { n: 'La Fortaleza', style: 'rect', crowd: ['#7a1f2b', '#f2f2f2'], pitch: CLASSIC },
    gigante: { n: 'Gigante de Arroyito', style: 'rect', crowd: ['#1c3d8f', '#f2c400'], pitch: { W: 350, H: 165, gh: 64 } },
    maracana: { n: 'Maracanã', style: 'maracana', crowd: null, pitch: { W: 400, H: 185, gh: 64 } },
    centenario: { n: 'Estadio Centenario', style: 'centenario', crowd: null, pitch: { W: 380, H: 175, gh: 64 } },
    parquecentral: { n: 'Gran Parque Central', style: 'rect', crowd: ['#f2f2f2', '#1c3d8f'], pitch: { W: 350, H: 160, gh: 62 } },
    campeonsiglo: { n: 'Campeón del Siglo', style: 'roof', crowd: ['#f2c400', '#111111'], pitch: CLASSIC },
    nuevaolla: { n: 'La Nueva Olla', style: 'rect', crowd: ['#1c3d8f', '#d3202f'], pitch: CLASSIC },
    clararena: { n: 'Claro Arena', style: 'roof', crowd: ['#f2f2f2', '#1c5fd0'], pitch: CLASSIC },
    casablanca: { n: 'Rodrigo Paz Delgado', style: 'rect', crowd: ['#f2f2f2', '#d3202f'], pitch: CLASSIC },
    pichincha: { n: 'Monumental Banco Pichincha', style: 'oval', crowd: ['#f2c400', '#d3202f'], pitch: { W: 390, H: 180, gh: 64 } },
    monumentalu: { n: 'Monumental "U"', style: 'oval', crowd: ['#f3ead7', '#7a1f2b'], pitch: { W: 390, H: 180, gh: 64 } },
    siles: { n: 'Hernando Siles', style: 'track', crowd: ['#6cb4e4', '#f2f2f2'], pitch: CLASSIC },
    generic: { n: 'Estadio local', style: 'rect', crowd: null, pitch: CLASSIC }
  };
  const FINAL_STADIUM = 'centenario';

  /* c: código, n: nombre, f: país, r: valoración propia, k: [camiseta, detalle], st: estadio (o nombre del estadio genérico), p: jugadores */
  const TEAMS = [
    { c: 'BOC', n: 'Boca Juniors', f: 'ARG', r: 1890, k: ['#0b3d91', '#f2c400'], st: 'bombonera', p: ['Paredes', 'Merentiel', 'Aranda', 'Palacios'] },
    { c: 'RIV', n: 'River Plate', f: 'ARG', r: 1900, k: ['#f2f2f2', '#d3202f'], st: 'monumental', p: ['Driussi', 'Almada', 'Borré', 'Montiel'] },
    { c: 'RAC', n: 'Racing Club', f: 'ARG', r: 1860, k: ['#6cb4e4', '#f2f2f2'], st: 'cilindro', p: ['Maravilla Martínez', 'Zaracho', 'Conechny', 'Di Cesare'] },
    { c: 'EST', n: 'Estudiantes', f: 'ARG', r: 1860, k: ['#d3202f', '#f2f2f2'], st: 'uno', p: ['Carrillo', 'Cetré', 'Piovi', 'Alario'] },
    { c: 'LAN', n: 'Lanús', f: 'ARG', r: 1800, k: ['#7a1f2b', '#f2f2f2'], st: 'fortaleza', p: ['Salvio', 'Cardozo', 'Carrera', 'Izquierdoz'] },
    { c: 'CEN', n: 'Rosario Central', f: 'ARG', r: 1800, k: ['#1c3d8f', '#f2c400'], st: 'gigante', p: ['Di María', 'Campaz', 'Copetti', 'Pol Fernández'] },
    { c: 'FLA', n: 'Flamengo', f: 'BRA', r: 1960, k: ['#c8102e', '#111111'], st: 'maracana', p: ['Arrascaeta', 'Pedro', 'Paquetá', 'Bruno Henrique'] },
    { c: 'PAL', n: 'Palmeiras', f: 'BRA', r: 1950, k: ['#0b6b3a', '#f2f2f2'], st: 'maracana', p: ['Arias', 'Vitor Roque', 'Andreas', 'Felipe Anderson'] },
    { c: 'FLU', n: 'Fluminense', f: 'BRA', r: 1850, k: ['#7a1f3d', '#0b6b3a'], st: 'maracana', p: ['Hulk', 'Ganso', 'Cano', 'Canobbio'] },
    { c: 'COR', n: 'Corinthians', f: 'BRA', r: 1830, k: ['#f2f2f2', '#111111'], st: 'maracana', p: ['Memphis', 'Yuri Alberto', 'Garro', 'Lingard'] },
    { c: 'CRU', n: 'Cruzeiro', f: 'BRA', r: 1840, k: ['#1c3d8f', '#f2f2f2'], st: 'maracana', p: ['Kaio Jorge', 'Gerson', 'Matheus Pereira', 'Arroyo'] },
    { c: 'MIR', n: 'Mirassol', f: 'BRA', r: 1760, k: ['#f2c400', '#0b6b3a'], st: 'maracana', p: ['Negueba', 'Shaylon', 'Carlos Eduardo', 'Reinaldo'] },
    { c: 'NAC', n: 'Nacional', f: 'URU', r: 1760, k: ['#f2f2f2', '#1c3d8f'], st: 'parquecentral', p: ['Maxi Gómez', 'Botta', 'Zuculini', 'Silvera'] },
    { c: 'PEN', n: 'Peñarol', f: 'URU', r: 1770, k: ['#f2c400', '#111111'], st: 'campeonsiglo', p: ['Arezo', 'Umpiérrez', 'Cabrera', 'Trindade'] },
    { c: 'CCP', n: 'Cerro Porteño', f: 'PAR', r: 1740, k: ['#1c3d8f', '#d3202f'], st: 'nuevaolla', p: ['Iturbe', 'Vegetti', 'Aliseda', 'Gastón Giménez'] },
    { c: 'LIB', n: 'Libertad', f: 'PAR', r: 1750, k: ['#111111', '#f2f2f2'], st: 'Estadio Dr. Nicolás Leoz', p: ['Melgarejo', 'Matías Rojas', 'Bogarín', 'Sanabria'] },
    { c: 'UCA', n: 'Universidad Católica', f: 'CHI', r: 1720, k: ['#f2f2f2', '#1c5fd0'], st: 'clararena', p: ['Zampedri', 'Medel', 'Palavecino', 'Montes'] },
    { c: 'COQ', n: 'Coquimbo Unido', f: 'CHI', r: 1690, k: ['#f2c400', '#111111'], st: 'Estadio Francisco Sánchez Rumoroso', p: ['Pratto', 'Vadalá', 'Johansen', 'Galani'] },
    { c: 'DIM', n: 'Independiente Medellín', f: 'COL', r: 1730, k: ['#d3202f', '#1c3d8f'], st: 'Estadio Atanasio Girardot', p: ['Quintero', 'Cataño', 'Martegani', 'Larrosa'] },
    { c: 'TOL', n: 'Deportes Tolima', f: 'COL', r: 1690, k: ['#7a1f2b', '#f2c400'], st: 'Estadio Manuel Murillo Toro', p: ['Parra', 'Guzmán', 'Rovira', 'Sandoval'] },
    { c: 'SFE', n: 'Santa Fe', f: 'COL', r: 1710, k: ['#d3202f', '#f2f2f2'], st: 'Estadio El Campín', p: ['Rodallega', 'Fernández', 'Lovera', 'Torres'] },
    { c: 'JUN', n: 'Junior', f: 'COL', r: 1730, k: ['#f2f2f2', '#d3202f'], st: 'Estadio Metropolitano', p: ['Muriel', 'Teo', 'Chará', 'Rivas'] },
    { c: 'UNI', n: 'Universitario', f: 'PER', r: 1720, k: ['#f3ead7', '#7a1f2b'], st: 'monumentalu', p: ['Valera', 'Polo', 'Concha', 'Lapadula'] },
    { c: 'SCR', n: 'Sporting Cristal', f: 'PER', r: 1700, k: ['#6cc4ec', '#f2f2f2'], st: 'Estadio Alberto Gallardo', p: ['Yotún', 'Barcos', 'Cabellos', 'Gonzales'] },
    { c: 'CUS', n: 'Cusco FC', f: 'PER', r: 1620, k: ['#f2c400', '#1c3d8f'], st: 'Estadio Garcilaso', p: ['Colitto', 'Callejo', 'Colman', 'Tevez'] },
    { c: 'LDU', n: 'Liga de Quito', f: 'ECU', r: 1810, k: ['#f2f2f2', '#d3202f'], st: 'casablanca', p: ['Deyverson', 'Villamíl', 'Estrada', 'Cornejo'] },
    { c: 'IDV', n: 'Independiente del Valle', f: 'ECU', r: 1790, k: ['#111111', '#1c5fd0'], st: 'Estadio Banco Guayaquil', p: ['Sornoza', 'Cazares', 'Pata', 'Reasco'] },
    { c: 'BSC', n: 'Barcelona SC', f: 'ECU', r: 1720, k: ['#f2c400', '#d3202f'], st: 'pichincha', p: ['Benedetto', 'Villalba', 'Cano', 'Quiñónez'] },
    { c: 'BOL', n: 'Bolívar', f: 'BOL', r: 1700, k: ['#6cb4e4', '#f2f2f2'], st: 'siles', p: ['Cauteruccio', 'Robson', 'Justiniano', 'Batallini'] },
    { c: 'ARE', n: 'Always Ready', f: 'BOL', r: 1630, k: ['#f2f2f2', '#d3202f'], st: 'Estadio Municipal de El Alto', p: ['Triverio', 'Saucedo', 'Amoroso', 'Godoy'] },
    { c: 'LGU', n: 'Deportivo La Guaira', f: 'VEN', r: 1620, k: ['#f58220', '#1c3d8f'], st: 'Estadio Olímpico de la UCV', p: ['Bedoya', 'Castellanos', 'Meza', 'Faya'] },
    { c: 'UCV', n: 'Universidad Central', f: 'VEN', r: 1600, k: ['#1c5fd0', '#f2f2f2'], st: 'Estadio Olímpico de la UCV', p: ['Zapata', 'Samuel Sosa', 'Solé', 'Alegría'] }
  ];
  const BY = {};
  for (const t of TEAMS) BY[t.c] = t;
  const COUNTRIES = ['ARG', 'BRA', 'URU', 'PAR', 'CHI', 'COL', 'PER', 'ECU', 'BOL', 'VEN'];
  const COUNTRY_NAME = { ARG: 'Argentina', BRA: 'Brasil', URU: 'Uruguay', PAR: 'Paraguay', CHI: 'Chile', COL: 'Colombia', PER: 'Perú', ECU: 'Ecuador', BOL: 'Bolivia', VEN: 'Venezuela' };
  const LADDER = ['easy', 'normal', 'normal', 'normal', 'normal', 'hard', 'hard', 'hard', 'hard', 'expert', 'expert', 'expert', 'expert'];
  /* fixture del grupo: fechas 1-3 y la revancha con la localía invertida en las fechas 4-6 */
  const FIX = [[[0, 1], [2, 3]], [[3, 0], [1, 2]], [[0, 2], [3, 1]]];

  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const stars = c => Math.max(1, Math.min(5, Math.round((BY[c].r - 1560) / 80)));

  /* estadio de un equipo (los genéricos llevan el nombre real del estadio con tribunas estándar) */
  function stadiumOf(c) {
    const t = BY[c], s = STADIUMS[t.st];
    if (s) return Object.assign({ key: t.st }, s, { crowd: s.crowd || [t.k[0], t.k[1]] });
    return Object.assign({ key: 'generic' }, STADIUMS.generic, { n: t.st, crowd: [t.k[0], t.k[1]] });
  }
  function finalStadium(a, b) {
    const s = STADIUMS[FINAL_STADIUM];
    return Object.assign({ key: FINAL_STADIUM }, s, { crowd: [BY[a].k[0], BY[b].k[0]] });
  }

  /* ---- simulación por valoración (con algo de ventaja de local) ---- */
  function pois(l) { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= Math.random(); } while (p > L); return k - 1; }
  function simScore(home, away, neutral) {
    const d = (BY[home].r - BY[away].r + (neutral ? 0 : 60)) / 400;
    return [pois(1.25 * Math.pow(10, 0.3 * d)), pois(1.25 * Math.pow(10, -0.3 * d))];
  }
  function simPens(a, b) {
    const d = (BY[a].r - BY[b].r) / 400, aWins = Math.random() < 0.5 + 0.08 * Math.tanh(d * 2);
    const lo = 2 + Math.floor(Math.random() * 3), hi = lo + 1 + (Math.random() < 0.3 ? 1 : 0);
    return aWins ? [hi, lo] : [lo, hi];
  }

  /* ---- sorteo: 4 bombos por valoración; se evita que dos equipos del mismo país caigan en el mismo grupo ---- */
  function draw() {
    const sorted = TEAMS.slice().sort((x, y) => y.r - x.r);
    for (let tries = 0; tries < 500; tries++) {
      const pots = [0, 1, 2, 3].map(p => shuffle(sorted.slice(p * 8, p * 8 + 8)));
      const groups = [[], [], [], [], [], [], [], []];
      let ok = true;
      for (const pot of pots) {
        const left = pot.slice();
        for (let g = 0; g < 8; g++) {
          let k = left.findIndex(t => !groups[g].some(x => x.f === t.f));
          if (k < 0) { if (tries < 499) { ok = false; break; } k = 0; }
          groups[g].push(left.splice(k, 1)[0]);
        }
        if (!ok) break;
      }
      if (ok) return groups.map(g => g.map(t => t.c));
    }
    return null;
  }

  function newTournament(o) {
    const st = {
      v: 1, user: o.user, diff: o.diff, minutes: o.minutes, size: o.size,
      step: 0, stage: 'groups', md: 0, groups: [], ko: { rounds: [], cur: 0, leg: 0 },
      out: false, exit: null, champion: null, runnerUp: null, last: null, tb: {}
    };
    for (const t of TEAMS) st.tb[t.c] = Math.random();
    draw().forEach((teams, g) => {
      const grp = { n: String.fromCharCode(65 + g), teams, m: [] };
      for (let half = 0; half < 2; half++) FIX.forEach((day, i) => day.forEach(([x, y]) => {
        const home = half === 0 ? teams[x] : teams[y], away = half === 0 ? teams[y] : teams[x];
        grp.m.push({ md: half * 3 + i, h: home, a: away, gh: null, ga: null });
      }));
      st.groups.push(grp);
    });
    return st;
  }

  /* ---- tablas ---- */
  function table(st, gi) {
    const g = st.groups[gi], rows = {};
    for (const c of g.teams) rows[c] = { c, pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0, dg: 0, pts: 0 };
    for (const m of g.m) {
      if (m.gh == null) continue;
      const A = rows[m.h], B = rows[m.a];
      A.pj++; B.pj++; A.gf += m.gh; A.gc += m.ga; B.gf += m.ga; B.gc += m.gh;
      if (m.gh > m.ga) { A.g++; B.p++; A.pts += 3; } else if (m.gh < m.ga) { B.g++; A.p++; B.pts += 3; } else { A.e++; B.e++; A.pts++; B.pts++; }
    }
    const list = Object.values(rows);
    for (const r of list) r.dg = r.gf - r.gc;
    return list.sort((x, y) => y.pts - x.pts || y.dg - x.dg || y.gf - x.gf || st.tb[y.c] - st.tb[x.c]);
  }
  /* campaña completa (para decidir quién define de local en las llaves) */
  function seed(st, c) {
    const gi = st.groups.findIndex(g => g.teams.includes(c)), r = table(st, gi).find(x => x.c === c);
    return r.pts * 1000 + r.dg * 20 + r.gf + st.tb[c];
  }

  /* ---- llaves ---- */
  const ROUND_NAMES = ['Octavos de final', 'Cuartos de final', 'Semifinales', 'Final'];
  /* en una llave t1 es el que define de local (juega la vuelta en casa) */
  function mkTie(st, x, y, final) {
    const [t1, t2] = seed(st, x) >= seed(st, y) ? [x, y] : [y, x];
    if (final) return { t1, t2, legs: [{ h: t1, a: t2, gh: null, ga: null, neutral: true }], pen: null, w: null };
    return { t1, t2, legs: [{ h: t2, a: t1, gh: null, ga: null }, { h: t1, a: t2, gh: null, ga: null }], pen: null, w: null };
  }
  function buildR16(st) {
    const tabs = st.groups.map((_, i) => table(st, i));
    const W = tabs.map(t => t[0].c), S = tabs.map(t => t[1].c);
    /* los primeros contra segundos de otro grupo */
    let order = null;
    for (let t = 0; t < 400; t++) { const s = shuffle(S.slice()); if (s.every((c, i) => S.indexOf(c) !== i)) { order = s; break; } }
    order = order || S.slice(1).concat(S[0]);
    const ties = W.map((w, i) => mkTie(st, w, order[i], false));
    st.ko = { rounds: [{ name: ROUND_NAMES[0], ties }], cur: 0, leg: 0 };
    return W.concat(S);
  }

  /* goles de cada equipo en la llave (global) */
  function aggregate(tie) {
    let a = 0, b = 0;
    for (const L of tie.legs) {
      if (L.gh == null) continue;
      if (L.h === tie.t1) { a += L.gh; b += L.ga; } else { a += L.ga; b += L.gh; }
    }
    return [a, b];
  }

  /* ---- flujo ---- */
  function diffFor(st) { return st.diff === 'prog' ? LADDER[Math.min(st.step, LADDER.length - 1)] : st.diff; }

  function pending(st) {
    if (st.stage === 'done' || st.out) return null;
    if (st.stage === 'groups') {
      for (let gi = 0; gi < st.groups.length; gi++) {
        const g = st.groups[gi];
        for (let mi = 0; mi < g.m.length; mi++) {
          const m = g.m[mi];
          if (m.md === st.md && m.gh == null && (m.h === st.user || m.a === st.user)) {
            return { kind: 'group', gi, mi, h: m.h, a: m.a, home: m.h === st.user, stadium: stadiumOf(m.h),
              label: 'Grupo ' + g.n + ' · Fecha ' + (st.md + 1) + ' de 6' };
          }
        }
      }
      return null;
    }
    const r = st.ko.rounds[st.ko.cur], leg = st.ko.leg;
    for (let ti = 0; ti < r.ties.length; ti++) {
      const tie = r.ties[ti];
      if (tie.w != null || (tie.t1 !== st.user && tie.t2 !== st.user)) continue;
      const L = tie.legs[leg];
      if (!L || L.gh != null) continue;
      const final = tie.legs.length === 1, second = leg === 1;
      let agg = null;
      if (second) {
        const [x, y] = aggregate(tie);
        /* goles de la ida, desde el punto de vista del local de la vuelta (h) */
        agg = L.h === tie.t1 ? [x, y] : [y, x];
      }
      return {
        kind: 'ko', ti, leg, h: L.h, a: L.a, home: L.h === st.user, final, decisive: final || second, agg,
        stadium: final ? finalStadium(L.h, L.a) : stadiumOf(L.h),
        label: r.name + (final ? ' · partido único' : second ? ' · Vuelta' : ' · Ida')
      };
    }
    return null;
  }

  /* resuelve la llave al terminar la vuelta (o la final) */
  function settle(tie) {
    const [x, y] = aggregate(tie);
    if (x !== y) { tie.w = x > y ? tie.t1 : tie.t2; return; }
    if (!tie.pen) tie.pen = simPens(tie.t1, tie.t2);
    tie.w = tie.pen[0] > tie.pen[1] ? tie.t1 : tie.t2;
  }

  function completeCurrent(st) {
    if (st.stage === 'groups') {
      const items = [];
      for (const g of st.groups) for (const m of g.m) {
        if (m.md !== st.md) continue;
        if (m.gh == null) { const s = simScore(m.h, m.a); m.gh = s[0]; m.ga = s[1]; }
        items.push({ h: m.h, a: m.a, gh: m.gh, ga: m.ga, tag: 'Grupo ' + g.n });
      }
      st.last = { title: 'Fase de grupos · Fecha ' + (st.md + 1), items };
      st.md++; st.step++;
      if (st.md === 6) {
        const q = buildR16(st);
        st.stage = 'ko';
        if (!q.includes(st.user)) { st.out = true; st.exit = 'Fase de grupos'; }
      }
      return;
    }
    const r = st.ko.rounds[st.ko.cur], leg = st.ko.leg;
    const items = [];
    for (const tie of r.ties) {
      const L = tie.legs[leg];
      if (L.gh == null) { const s = simScore(L.h, L.a, L.neutral); L.gh = s[0]; L.ga = s[1]; }
      const last = leg === tie.legs.length - 1;
      if (last) settle(tie);
      items.push({ h: L.h, a: L.a, gh: L.gh, ga: L.ga, pen: last && tie.pen ? (L.h === tie.t1 ? tie.pen : [tie.pen[1], tie.pen[0]]) : null,
        agg: tie.legs.length === 2 && last ? aggregate(tie) : null, t1: tie.t1, w: last ? tie.w : null });
    }
    st.last = { title: r.name + (r.ties[0].legs.length === 1 ? '' : leg === 0 ? ' · Ida' : ' · Vuelta'), items };
    st.step++;
    if (leg === 0 && r.ties[0].legs.length === 2) { st.ko.leg = 1; return; }
    /* ronda terminada */
    const um = r.ties.find(t => t.t1 === st.user || t.t2 === st.user);
    if (r.name === 'Final') {
      const t = r.ties[0];
      st.champion = t.w; st.runnerUp = t.w === t.t1 ? t.t2 : t.t1;
      st.stage = 'done';
      if (!st.exit) st.exit = st.user === st.champion ? 'Campeón' : 'Subcampeón';
      return;
    }
    if (um && um.w !== st.user && !st.out) { st.out = true; st.exit = r.name; }
    const winners = r.ties.map(t => t.w), next = [];
    const final = winners.length === 2;
    for (let i = 0; i < winners.length; i += 2) next.push(mkTie(st, winners[i], winners[i + 1], final));
    st.ko.rounds.push({ name: ROUND_NAMES[st.ko.cur + 1], ties: next });
    st.ko.cur++; st.ko.leg = 0;
  }

  function advance(st, force) {
    let guard = 0;
    while (st.stage !== 'done' && guard++ < 60) {
      if (!force && st.out) return;
      if (!force && pending(st)) return;
      completeCurrent(st);
      if (!force && st.out) return;
    }
  }

  /* guarda el resultado del partido del usuario. Goles desde su punto de vista; pens: [usuario, rival] si hubo penales */
  function submitUser(st, userGoals, oppGoals, pens) {
    const p = pending(st);
    if (!p) return;
    const gh = p.home ? userGoals : oppGoals, ga = p.home ? oppGoals : userGoals;
    if (p.kind === 'group') { const m = st.groups[p.gi].m[p.mi]; m.gh = gh; m.ga = ga; }
    else {
      const tie = st.ko.rounds[st.ko.cur].ties[p.ti], L = tie.legs[p.leg];
      L.gh = gh; L.ga = ga;
      if (pens) tie.pen = tie.t1 === st.user ? [pens[0], pens[1]] : [pens[1], pens[0]];
    }
    completeCurrent(st);
    advance(st);
  }

  function simUser(st) {
    const p = pending(st);
    if (!p) return null;
    const s = simScore(p.h, p.a, p.final);
    const ug = p.home ? s[0] : s[1], og = p.home ? s[1] : s[0];
    let pens = null;
    if (p.decisive) {
      const uAgg = ug + (p.agg ? (p.home ? p.agg[0] : p.agg[1]) : 0), oAgg = og + (p.agg ? (p.home ? p.agg[1] : p.agg[0]) : 0);
      if (uAgg === oAgg) { const pp = simPens(st.user, p.home ? p.a : p.h); pens = pp; }
    }
    submitUser(st, ug, og, pens);
    return { ug, og, pens };
  }

  function simulateRest(st) { advance(st, true); }

  /* colores: el local usa su camiseta; si se parecen, el visitante usa la de detalle (o una neutra) */
  function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function dist(a, b) { const x = hexRgb(a), y = hexRgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); }
  function kitsFor(home, away) {
    const kh = BY[home].k[0], ka = BY[away].k;
    let fa = ka[0];
    if (dist(kh, fa) < 110) fa = dist(kh, ka[1]) >= 110 ? ka[1] : (dist(kh, '#1a1f1c') >= 110 ? '#1a1f1c' : '#f2f2f2');
    return [kh, fa];
  }

  return { TEAMS, BY, STADIUMS, COUNTRIES, COUNTRY_NAME, newTournament, table, aggregate, pending, submitUser, simUser, simulateRest, advance, diffFor, kitsFor, stars, stadiumOf, finalStadium };
})();

if (typeof module !== 'undefined') module.exports = LIB;
