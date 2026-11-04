'use strict';
/* ===== Pantallas del modo Copa Libertadores ===== */
const LIBCFG = Object.assign({ diff: 'normal', minutes: '2', size: '1', team: 'BOC' }, store.get('libcfg', {}));
if (!LIB.BY[LIBCFG.team]) LIBCFG.team = 'BOC';
let lib = null;
let libTab = 'match';
let libFilter = 'Todos';
let libAbandonArm = 0;

(function loadLib() {
  const s = store.get('lib', null);
  if (s && s.v === 1 && s.groups && LIB.BY[s.user]) lib = s;
})();
const saveLib = () => { if (lib) store.set('lib', lib); else store.del('lib'); };
const saveLibCfg = () => store.set('libcfg', LIBCFG);

const LIB_GROUPS = [
  { key: 'diff', label: 'Dificultad de los rivales', opts: [['easy', 'Fácil'], ['normal', 'Normal'], ['hard', 'Difícil'], ['expert', 'Experto'], ['impossible', 'Imposible'], ['prog', 'Progresiva']],
    hints: {
      easy: 'Los rivales juegan lento y fallan mucho.', normal: 'Partidos parejos.', hard: 'Rivales que anticipan y definen bien.',
      expert: 'Reflejos casi perfectos en todos los partidos.', impossible: 'Rivales imposibles: hay que jugar perfecto.',
      prog: 'Empieza fácil en la fase de grupos y llega a Experto en semifinales y la final.'
    } },
  { key: 'minutes', label: 'Duración de cada partido', opts: [['1', '1 min'], ['2', '2 min'], ['3', '3 min'], ['5', '5 min']] },
  { key: 'size', label: 'Jugadores por equipo', opts: [['1', '1 vs 1'], ['2', '2 vs 2'], ['3', '3 vs 3']] }
];

function libChip(c, big) {
  const k = LIB.BY[c].k;
  return h('span', { class: 'kit' + (big ? ' big' : ''), style: 'background:linear-gradient(135deg,' + k[0] + ' 0 55%,' + k[1] + ' 55% 100%)' });
}
const libStars = c => { const n = LIB.stars(c); return '★'.repeat(n) + '☆'.repeat(5 - n); };
const libName = c => LIB.BY[c].n;

/* ---------- Configuración ---------- */
function buildLibSetup() {
  const s = SCREENS.libsetup, c = card();
  clearEl(s); s.append(c);
  c.append(topbar('Copa Libertadores', () => showScreen('home'), 'Inicio'));
  c.append(h('p', { class: 'sub', text: '32 equipos en 8 grupos de 4, con partidos de ida y vuelta. Pasan los dos primeros. Octavos, cuartos y semis a ida y vuelta, y la final a partido único en el Estadio Centenario.' }));
  if (lib) {
    const p = LIB.pending(lib);
    const state = lib.stage === 'done' ? 'Terminada: ' + lib.exit : lib.out ? 'Eliminado: ' + lib.exit : (p ? p.label : 'En curso');
    c.append(h('div', { class: 'resume' },
      libChip(lib.user, true),
      h('div', { class: 'resume-t' }, h('b', { text: 'Copa guardada · ' + libName(lib.user) }), h('span', { text: state })),
      h('button', { class: 'btn go sm', type: 'button', text: 'Continuar', onclick: () => { libTab = 'match'; renderLibHub(); showScreen('libhub'); } })));
  }
  const grid = h('div', { class: 'groups' });
  for (const def of LIB_GROUPS) grid.append(segGroup('lb', def, LIBCFG, saveLibCfg));
  c.append(grid);
  c.append(h('button', { class: 'btn go', type: 'button', text: lib ? 'Nueva copa: elegir equipo' : 'Elegir mi equipo', onclick: () => { buildLibTeam(); showScreen('libteam'); } }));
  c.append(h('p', { class: 'fine', text: 'Cada equipo juega de local en su estadio. Los jugadores de cada plantel tienen nombres de futbolistas reales del club; la valoración de cada equipo es propia.' }));
}

/* ---------- Elegir equipo ---------- */
function buildLibTeam() {
  const s = SCREENS.libteam, c = card('wide');
  clearEl(s); s.append(c);
  c.append(topbar('Elegí tu equipo', () => { buildLibSetup(); showScreen('libsetup'); }, 'Configuración'));
  const chips = h('div', { class: 'chips' }), grid = h('div', { class: 'teams' }), foot = h('div', { class: 'teamfoot' });
  const paint = () => {
    clearEl(chips); clearEl(grid); clearEl(foot);
    for (const f of ['Todos'].concat(LIB.COUNTRIES)) {
      chips.append(h('button', { class: 'chip' + (libFilter === f ? ' on' : ''), type: 'button', text: f === 'Todos' ? f : LIB.COUNTRY_NAME[f], onclick: () => { libFilter = f; paint(); } }));
    }
    const list = LIB.TEAMS.filter(t => libFilter === 'Todos' || t.f === libFilter).sort((a, b) => b.r - a.r);
    for (const t of list) {
      grid.append(h('button', { class: 'team' + (LIBCFG.team === t.c ? ' on' : ''), type: 'button', onclick: () => { LIBCFG.team = t.c; saveLibCfg(); paint(); } },
        libChip(t.c), h('span', { class: 'tc', text: t.c }), h('span', { class: 'tn', text: t.n }), h('span', { class: 'ts', text: libStars(t.c) })));
    }
    const sel = LIB.BY[LIBCFG.team];
    foot.append(libChip(sel.c, true),
      h('div', { class: 'teamfoot-t' }, h('b', { text: sel.n }), h('span', { text: LIB.COUNTRY_NAME[sel.f] + ' · ' + LIB.stadiumOf(sel.c).n + ' · ' + sel.p.slice(0, 3).join(', ') })),
      h('button', { class: 'btn go', type: 'button', text: 'Sortear grupos', onclick: startLib }));
  };
  c.append(chips, grid, foot);
  paint();
}

function startLib() {
  lib = LIB.newTournament({ user: LIBCFG.team, diff: LIBCFG.diff, minutes: +LIBCFG.minutes, size: +LIBCFG.size });
  saveLib();
  libTab = 'match';
  renderLibHub();
  showScreen('libhub');
}

/* ---------- Panel ---------- */
function libResultRow(it, me) {
  const mine = it.h === me || it.a === me;
  const extra = [];
  if (it.agg) { const g = it.h === it.t1 ? it.agg : [it.agg[1], it.agg[0]]; extra.push('global ' + g[0] + '–' + g[1]); }
  if (it.pen) extra.push(it.pen[0] + '–' + it.pen[1] + ' pen.');
  return h('li', { class: 'res' + (mine ? ' me' : '') },
    h('span', { class: 'ra' }, libChip(it.h), libName(it.h)),
    h('span', { class: 'rs' }, it.gh + ' – ' + it.ga, extra.length ? h('small', { text: ' (' + extra.join(', ') + ')' }) : null),
    h('span', { class: 'rb' }, libName(it.a), libChip(it.a)),
    it.tag ? h('em', { class: 'rt', text: it.tag }) : null);
}

function libMatchTab(body) {
  const p = LIB.pending(lib), me = lib.user;
  if (p) {
    const opp = p.home ? p.a : p.h, d = LIB.diffFor(lib);
    const side = (c, role) => h('div', { class: 'side' }, libChip(c, true), h('b', { text: libName(c) }), h('span', { text: role + ' · ' + libStars(c) }));
    let rule = '';
    if (p.kind === 'ko' && p.leg === 0 && !p.final) rule = ' · se puede empatar: define la vuelta';
    if (p.decisive) rule = ' · si ' + (p.final ? 'empatan' : 'el global queda igualado') + ': gol de oro de 1 minuto y penales';
    const ida = p.agg ? h('p', { class: 'meta', text: 'Ida: ' + libName(p.h) + ' ' + p.agg[0] + ' – ' + p.agg[1] + ' ' + libName(p.a) + ' (goles del partido de ida a favor de cada uno)' }) : null;
    body.append(h('div', { class: 'next' },
      h('p', { class: 'eyebrow', text: p.label + ' · ' + p.stadium.n }),
      h('div', { class: 'vs' }, side(p.h, p.final ? 'Neutral' : 'Local'), h('div', { class: 'vsx', text: 'vs' }), side(p.a, p.final ? 'Neutral' : 'Visitante')),
      ida,
      h('p', { class: 'meta', text: 'Rival: ' + diffLabel(d) + ' · ' + lib.size + ' vs ' + lib.size + ' · ' + lib.minutes + ' min' + rule }),
      h('p', { class: 'meta', text: 'Tu equipo: Vos' + (lib.size > 1 ? ', ' + LIB.BY[me].p.slice(0, lib.size - 1).join(', ') : '') + ' · Rival: ' + LIB.BY[opp].p.slice(0, lib.size).join(', ') }),
      h('div', { class: 'row' },
        h('button', { class: 'btn go', type: 'button', text: 'Jugar partido', onclick: libPlay }),
        h('button', { class: 'btn', type: 'button', text: 'Simular partido', onclick: libSim }))));
  } else if (lib.stage === 'done') {
    const champ = lib.champion === me;
    body.append(h('div', { class: 'next final' + (champ ? ' gold' : '') },
      h('p', { class: 'eyebrow', text: 'Copa terminada' }),
      h('h3', { text: champ ? '¡Campeones de América!' : 'Se terminó la Copa' }),
      h('p', { class: 'meta', text: libName(me) + ': ' + lib.exit }),
      h('ol', { class: 'podium' },
        h('li', null, libChip(lib.champion), h('b', { text: libName(lib.champion) }), h('span', { text: 'Campeón' })),
        h('li', null, libChip(lib.runnerUp), h('b', { text: libName(lib.runnerUp) }), h('span', { text: 'Subcampeón' }))),
      h('div', { class: 'row' },
        h('button', { class: 'btn go', type: 'button', text: 'Nueva copa', onclick: () => { buildLibSetup(); showScreen('libsetup'); } }),
        h('button', { class: 'btn', type: 'button', text: 'Ver las llaves', onclick: () => { libTab = 'ko'; renderLibHub(); } }))));
  } else if (lib.out) {
    body.append(h('div', { class: 'next out' },
      h('p', { class: 'eyebrow', text: 'Eliminado' }),
      h('h3', { text: libName(me) + ' quedó afuera' }),
      h('p', { class: 'meta', text: 'Eliminado en: ' + lib.exit + '. Podés seguir la copa sin vos o empezar otra.' }),
      h('div', { class: 'row' },
        h('button', { class: 'btn go', type: 'button', text: 'Simular el resto de la copa', onclick: () => { LIB.simulateRest(lib); saveLib(); libTab = 'match'; renderLibHub(); } }),
        h('button', { class: 'btn', type: 'button', text: 'Nueva copa', onclick: () => { buildLibSetup(); showScreen('libsetup'); } }))));
  }
  if (lib.last) {
    const mine = it => (it.h === me || it.a === me) ? 1 : 0;
    body.append(h('div', { class: 'panel' },
      h('h4', { text: 'Resultados · ' + lib.last.title }),
      h('ul', { class: 'results' }, lib.last.items.slice().sort((a, b) => mine(b) - mine(a)).map(it => libResultRow(it, me)))));
  }
}

function libGroupsTab(body) {
  const me = lib.user;
  const order = lib.groups.map((g, i) => i).sort((a, b) => (lib.groups[b].teams.includes(me) ? 1 : 0) - (lib.groups[a].teams.includes(me) ? 1 : 0));
  const wrap = h('div', { class: 'gtabs' });
  for (const gi of order) {
    const g = lib.groups[gi], t = LIB.table(lib, gi);
    const rows = t.map((r, i) => h('tr', { class: (r.c === me ? 'me ' : '') + (i < 2 ? 'q' : '') },
      h('td', { class: 'pos', text: i + 1 }),
      h('td', { class: 'tm' }, libChip(r.c), h('span', { text: libName(r.c) })),
      h('td', { text: r.pj }), h('td', { text: (r.dg > 0 ? '+' : '') + r.dg }), h('td', { class: 'pts', text: r.pts })));
    const matches = g.m.filter(m => m.gh != null).map(m => h('li', { class: (m.h === me || m.a === me) ? 'me' : '' }, m.h + ' ' + m.gh + '–' + m.ga + ' ' + m.a));
    wrap.append(h('div', { class: 'panel gt' + (g.teams.includes(me) ? ' mine' : '') },
      h('h4', { text: 'Grupo ' + g.n }),
      h('div', { class: 'tablewrap' }, h('table', { class: 'tbl' },
        h('thead', null, h('tr', null, h('th', { text: '#' }), h('th', { text: 'Equipo' }), h('th', { text: 'PJ' }), h('th', { text: 'DG' }), h('th', { text: 'Pts' }))),
        h('tbody', null, rows))),
      matches.length ? h('ul', { class: 'mini' }, matches) : null));
  }
  body.append(wrap);
  body.append(h('p', { class: 'fine', text: 'Pasan los dos primeros de cada grupo. Cada equipo juega 6 partidos: dos con cada rival, uno de local y otro de visitante.' }));
}

function libKoTab(body) {
  if (!lib.ko.rounds.length) {
    body.append(h('div', { class: 'panel' }, h('p', { class: 'meta', text: 'Las llaves se arman cuando termina la fase de grupos.' })));
    return;
  }
  const names = ['Octavos de final', 'Cuartos de final', 'Semifinales', 'Final'], counts = [8, 4, 2, 1], me = lib.user;
  const cols = h('div', { class: 'bracket' });
  names.forEach((nm, i) => {
    const r = lib.ko.rounds[i];
    const bcm = h('div', { class: 'bcm' });
    cols.append(h('div', { class: 'bcol' + (r && i === lib.ko.cur && lib.stage !== 'done' ? ' now' : '') }, h('h4', { text: nm }), bcm));
    if (!r) { for (let k = 0; k < counts[i]; k++) bcm.append(h('div', { class: 'bm empty' }, h('div', { class: 'bt', text: 'Por definir' }))); return; }
    for (const tie of r.ties) {
      const [g1, g2] = LIB.aggregate(tie), played = tie.legs.some(L => L.gh != null);
      const legTxt = c => tie.legs.map(L => L.gh == null ? '·' : String(L.h === c ? L.gh : L.ga)).join(' ');
      const line = (c, g) => h('div', { class: 'bt' + (tie.w === c ? ' w' : '') + (c === me ? ' me' : '') }, libChip(c), h('span', { class: 'bn', text: c }),
        h('span', { class: 'bg', text: played ? (tie.legs.length === 2 ? legTxt(c) + ' (' + g + ')' : String(g)) : '' }));
      bcm.append(h('div', { class: 'bm' + ((tie.t1 === me || tie.t2 === me) ? ' mine' : '') },
        line(tie.t2, g2), line(tie.t1, g1),
        tie.pen ? h('small', { text: 'Penales ' + tie.pen[1] + '–' + tie.pen[0] }) : null));
    }
  });
  body.append(h('div', { class: 'bracketwrap' }, cols));
  body.append(h('p', { class: 'fine', text: 'En cada llave figura primero la ida y después la vuelta; entre paréntesis, el global. El de abajo define de local.' }));
}

function renderLibHub() {
  const s = SCREENS.libhub;
  clearEl(s);
  if (!lib) { buildLibSetup(); showScreen('libsetup'); return; }
  const c = card('wide hub');
  s.append(c);
  const r = lib.ko.rounds[lib.ko.cur];
  const stageTxt = lib.stage === 'done' ? 'Terminada' : lib.out ? 'Eliminado' : lib.stage === 'groups' ? 'Fase de grupos' : (r ? r.name : '');
  c.append(h('div', { class: 'hubhead' },
    libChip(lib.user, true),
    h('div', { class: 'ht' }, h('b', { text: libName(lib.user) }), h('span', { text: 'Copa Libertadores · ' + stageTxt })),
    h('div', { class: 'hbtn' },
      h('button', { class: 'btn sm', type: 'button', text: 'Inicio', onclick: () => showScreen('home') }),
      h('button', { class: 'btn sm', type: 'button', text: 'Abandonar', onclick: e => {
        if (Date.now() - libAbandonArm < 3000) { lib = null; saveLib(); buildLibSetup(); showScreen('libsetup'); }
        else { libAbandonArm = Date.now(); e.target.textContent = '¿Seguro?'; setTimeout(() => { if (e.target.isConnected) e.target.textContent = 'Abandonar'; }, 3000); }
      } }))));
  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  for (const [k, label] of [['match', 'Partido'], ['groups', 'Grupos'], ['ko', 'Llaves']]) {
    tabs.append(h('button', { class: 'tab' + (libTab === k ? ' on' : ''), type: 'button', role: 'tab', 'aria-selected': libTab === k ? 'true' : 'false', text: label, onclick: () => { libTab = k; renderLibHub(); } }));
  }
  c.append(tabs);
  const body = h('div', { class: 'hubbody' });
  c.append(body);
  if (libTab === 'match') libMatchTab(body); else if (libTab === 'groups') libGroupsTab(body); else libKoTab(body);
}

/* ---------- Jugar / simular ---------- */
function libPlay() {
  const p = LIB.pending(lib);
  if (!p) return;
  const me = lib.user, opp = p.home ? p.a : p.h;
  /* el local usa su camiseta; yo siempre juego del lado izquierdo (equipo 0) */
  const k = LIB.kitsFor(p.h, p.a), kits = p.home ? k : [k[1], k[0]];
  const agg = p.agg ? (p.home ? p.agg : [p.agg[1], p.agg[0]]) : null;
  const size = lib.size, roster = [];
  roster.push({ team: 0, human: true, name: 'Vos' });
  for (let i = 0; i < size - 1; i++) roster.push({ team: 0, human: false, name: LIB.BY[me].p[i] });
  for (let i = 0; i < size; i++) roster.push({ team: 1, human: false, name: LIB.BY[opp].p[i] });
  launchGame({
    size, diff: LIB.diffFor(lib), humanTeam: 0, timeLimit: lib.minutes, scoreLimit: 0, allowDraw: !p.decisive, agg,
    pitch: p.stadium.pitch, stadium: p.stadium, roster,
    teamNames: [libName(me), libName(opp)], teamCodes: [me, opp], kits,
    subtitle: p.label + ' · ' + p.stadium.n
  }, 'lib', () => libMatchOver(p, opp), () => [
    { text: 'Abandonar partido', fn: () => { onLocalEnd = null; setState('idle'); renderLibHub(); showScreen('libhub'); } }
  ]);
}

function libMatchOver(p, opp) {
  onLocalEnd = null;
  const ug = game.score[0], og = game.score[1];
  sound('end');
  if (game.tied) {
    setState('ended');
    startPenalties({ names: [libName(lib.user), libName(opp)], kits: game.kits, diff: LIB.diffFor(lib), onDone: pen => libMatchEnd(p, opp, ug, og, pen) });
  } else libMatchEnd(p, opp, ug, og, null);
}

function libMatchEnd(p, opp, ug, og, pen) {
  const agg = game.cfg.agg;
  LIB.submitUser(lib, ug, og, pen ? [pen.u, pen.c] : null);
  saveLib();
  const tu = ug + (agg ? agg[0] : 0), to = og + (agg ? agg[1] : 0);
  const decided = p.decisive;
  const win = pen ? pen.u > pen.c : (decided ? tu > to : ug > og), draw = !pen && (decided ? tu === to : ug === og);
  let meta = p.label;
  if (agg) meta += ' · global ' + tu + '–' + to;
  if (pen) meta += ' · penales ' + pen.u + '–' + pen.c; else if (game.overtime) meta += ' · gol de oro';
  if (lib.stage === 'done') meta += ' · ' + lib.exit;
  else if (lib.out) meta += ' · Quedaste eliminado';
  else if (p.kind === 'group' && lib.stage === 'ko') meta += ' · ¡Clasificaste a octavos!';
  else if (decided && win) meta += ' · ¡Pasaste de ronda!';
  const toHub = () => { setState('idle'); libTab = 'match'; renderLibHub(); showScreen('libhub'); };
  showEnd({
    title: win ? (decided ? '¡Ganaste la llave!' : '¡Ganaste!') : draw ? 'Empate' : (decided ? 'Quedaste afuera' : 'Perdiste'),
    res: win ? 'win' : draw ? 'draw' : 'lose',
    score: [ug, og], colors: game.kits, names: [libName(lib.user), libName(opp)], meta,
    buttons: [{ text: lib.stage === 'done' ? 'Ver el resultado final' : lib.out ? 'Ver la copa' : 'Continuar', go: true, fn: toHub }]
  });
}

function libSim() {
  if (!LIB.pending(lib)) return;
  LIB.simUser(lib);
  saveLib();
  renderLibHub();
}

function initLib() {
  mkScreen('libsetup'); mkScreen('libteam'); mkScreen('libhub');
  buildLibSetup();
}
