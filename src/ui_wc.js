'use strict';
/* ===== Pantallas del modo Mundial (local, contra la máquina) ===== */
const WCCFG = Object.assign({ format: '48', diff: 'normal', minutes: '2', size: '1', pitch: { preset: 'classic' }, team: 'ARG' }, store.get('wccfg', {}));
WCCFG.pitch = pitchValid(WCCFG.pitch);
let wc = null;
let hubTab = 'match';
let wcFilter = 'Todas';
let abandonArm = 0;

(function loadWc() {
  const s = store.get('wc', null);
  if (s && s.v === 1 && s.groups && WC.BY[s.user]) wc = s;
})();
const saveWc = () => { if (wc) store.set('wc', wc); else store.del('wc'); };
const saveWcCfg = () => store.set('wccfg', WCCFG);

const WC_GROUPS = [
  { key: 'format', label: 'Formato', opts: [['48', '48 selecciones'], ['32', '32 selecciones']],
    hints: { 48: '12 grupos de 4. Pasan los 2 primeros y los 8 mejores terceros: arrancás en dieciseisavos.', 32: '8 grupos de 4. Pasan los 2 primeros: arrancás en octavos.' } },
  { key: 'diff', label: 'Dificultad de los rivales', opts: [['easy', 'Fácil'], ['normal', 'Normal'], ['hard', 'Difícil'], ['expert', 'Experto'], ['prog', 'Progresiva']],
    hints: {
      easy: 'Los rivales juegan lento y fallan mucho.', normal: 'Partidos parejos.', hard: 'Rivales que anticipan y definen bien.',
      expert: 'Reflejos casi perfectos en todos los partidos.', prog: 'Empieza fácil en el primer partido y sube hasta Experto en las semifinales y la final.'
    } },
  { key: 'minutes', label: 'Duración de cada partido', opts: [['1', '1 min'], ['2', '2 min'], ['3', '3 min'], ['5', '5 min']] },
  { key: 'size', label: 'Jugadores por equipo', opts: [['1', '1 vs 1'], ['2', '2 vs 2'], ['3', '3 vs 3']] }
];

function kitChip(c, big) {
  const k = WC.BY[c].k;
  return h('span', { class: 'kit' + (big ? ' big' : ''), style: 'background:linear-gradient(135deg,' + k[0] + ' 0 55%,' + k[1] + ' 55% 100%)' });
}
const starsText = c => { const n = WC.stars(c); return '★'.repeat(n) + '☆'.repeat(5 - n); };
const diffLabel = k => (DIFF[k] ? DIFF[k].label : k);

function topbar(title, back, backText) {
  return h('div', { class: 'topbar' },
    back ? h('button', { class: 'back', type: 'button', onclick: back, text: '‹ ' + (backText || 'Volver') }) : null,
    h('h2', { text: title }));
}

/* ---------- Configuración ---------- */
function buildWcSetup() {
  const s = SCREENS.wcsetup, c = card();
  clearEl(s);
  s.append(c);
  c.append(topbar('Mundial', () => showScreen('home'), 'Inicio'));
  c.append(h('p', { class: 'sub', text: 'Elegí una selección, jugá la fase de grupos y las llaves hasta la final. Si perdés en eliminación directa, quedás afuera.' }));

  if (wc) {
    const t = WC.BY[wc.user], p = WC.pending(wc);
    const state = wc.stage === 'done' ? 'Terminado: ' + wc.exit : wc.out ? 'Eliminado: ' + wc.exit : (p ? p.label : 'En curso');
    c.append(h('div', { class: 'resume' },
      kitChip(wc.user, true),
      h('div', { class: 'resume-t' }, h('b', { text: 'Torneo guardado · ' + t.n }), h('span', { text: state })),
      h('button', { class: 'btn go sm', type: 'button', text: 'Continuar', onclick: () => { hubTab = 'match'; renderHub(); showScreen('wchub'); } })));
  }

  const grid = h('div', { class: 'groups' });
  for (const def of WC_GROUPS) grid.append(segGroup('wc', def, WCCFG, saveWcCfg));
  grid.append(pitchGroup('wc', () => WCCFG.pitch, v => { WCCFG.pitch = v; saveWcCfg(); }));
  c.append(grid);
  c.append(h('button', { class: 'btn go', type: 'button', text: wc ? 'Nuevo torneo: elegir selección' : 'Elegir mi selección', onclick: () => { buildWcTeam(); showScreen('wcteam'); } }));
  c.append(h('p', { class: 'fine', text: 'Las selecciones y el sorteo son de fantasía: la valoración de cada una es propia y no corresponde a un ranking oficial.' }));
}

/* ---------- Elegir selección ---------- */
function buildWcTeam() {
  const s = SCREENS.wcteam, c = card('wide');
  clearEl(s);
  s.append(c);
  c.append(topbar('Elegí tu selección', () => { buildWcSetup(); showScreen('wcsetup'); }, 'Configuración'));
  const chips = h('div', { class: 'chips' });
  const grid = h('div', { class: 'teams' });
  const foot = h('div', { class: 'teamfoot' });
  const paint = () => {
    clearEl(chips); clearEl(grid); clearEl(foot);
    for (const f of ['Todas'].concat(WC.CONFS)) {
      chips.append(h('button', { class: 'chip' + (wcFilter === f ? ' on' : ''), type: 'button', text: f, onclick: () => { wcFilter = f; paint(); } }));
    }
    const list = WC.TEAMS.filter(t => wcFilter === 'Todas' || t.f === wcFilter).sort((a, b) => b.r - a.r);
    for (const t of list) {
      grid.append(h('button', { class: 'team' + (WCCFG.team === t.c ? ' on' : ''), type: 'button', onclick: () => { WCCFG.team = t.c; saveWcCfg(); paint(); } },
        kitChip(t.c), h('span', { class: 'tc', text: t.c }), h('span', { class: 'tn', text: t.n }), h('span', { class: 'ts', text: starsText(t.c) })));
    }
    const sel = WC.BY[WCCFG.team];
    foot.append(kitChip(sel.c, true), h('div', { class: 'teamfoot-t' }, h('b', { text: sel.n }), h('span', { text: sel.f + ' · ' + starsText(sel.c) })),
      h('button', { class: 'btn go', type: 'button', text: 'Sortear grupos', onclick: startTournament }));
  };
  c.append(chips, grid, foot);
  paint();
}

function startTournament() {
  wc = WC.newTournament({
    format: +WCCFG.format, user: WCCFG.team, diff: WCCFG.diff, minutes: +WCCFG.minutes, size: +WCCFG.size, pitch: pitchValid(WCCFG.pitch)
  });
  saveWc();
  hubTab = 'match';
  renderHub();
  showScreen('wchub');
}

/* ---------- Panel del torneo ---------- */
function resultRow(it, me) {
  const mine = it.a === me || it.b === me;
  const pen = it.pen ? h('small', { text: ' (' + it.pen[0] + '–' + it.pen[1] + ' pen.)' }) : null;
  return h('li', { class: 'res' + (mine ? ' me' : '') },
    h('span', { class: 'ra' }, kitChip(it.a), WC.BY[it.a].n),
    h('span', { class: 'rs' }, it.ga + ' – ' + it.gb, pen),
    h('span', { class: 'rb' }, WC.BY[it.b].n, kitChip(it.b)),
    it.tag ? h('em', { class: 'rt', text: it.tag }) : null);
}

function matchTab(body) {
  const p = WC.pending(wc);
  const u = WC.BY[wc.user];
  if (p) {
    const oppC = p.a === wc.user ? p.b : p.a, o = WC.BY[oppC];
    const d = WC.diffFor(wc);
    body.append(h('div', { class: 'next' },
      h('p', { class: 'eyebrow', text: p.label }),
      h('div', { class: 'vs' },
        h('div', { class: 'side' }, kitChip(u.c, true), h('b', { text: u.n }), h('span', { text: starsText(u.c) })),
        h('div', { class: 'vsx', text: 'vs' }),
        h('div', { class: 'side' }, kitChip(o.c, true), h('b', { text: o.n }), h('span', { text: starsText(o.c) }))),
      h('p', { class: 'meta', text: 'Rival: ' + diffLabel(d) + ' · ' + wc.size + ' vs ' + wc.size + ' · ' + wc.minutes + ' min · cancha ' + pitchText(wc.pitch) + (p.kind === 'ko' ? ' · si hay empate: gol de oro y penales' : '') }),
      h('div', { class: 'row' },
        h('button', { class: 'btn go', type: 'button', text: 'Jugar partido', onclick: wcPlay }),
        h('button', { class: 'btn', type: 'button', text: 'Simular partido', onclick: wcSim }))));
  } else if (wc.stage === 'done') {
    const champ = wc.champion === wc.user;
    body.append(h('div', { class: 'next final' + (champ ? ' gold' : '') },
      h('p', { class: 'eyebrow', text: 'Mundial terminado' }),
      h('h3', { text: champ ? '¡Campeones del mundo!' : 'Se terminó el Mundial' }),
      h('p', { class: 'meta', text: u.n + ': ' + wc.exit }),
      h('ol', { class: 'podium' },
        h('li', null, kitChip(wc.champion), h('b', { text: WC.BY[wc.champion].n }), h('span', { text: 'Campeón' })),
        h('li', null, kitChip(wc.runnerUp), h('b', { text: WC.BY[wc.runnerUp].n }), h('span', { text: 'Subcampeón' })),
        h('li', null, kitChip(wc.third), h('b', { text: WC.BY[wc.third].n }), h('span', { text: 'Tercer puesto' }))),
      h('div', { class: 'row' },
        h('button', { class: 'btn go', type: 'button', text: 'Nuevo Mundial', onclick: () => { buildWcSetup(); showScreen('wcsetup'); } }),
        h('button', { class: 'btn', type: 'button', text: 'Ver las llaves', onclick: () => { hubTab = 'ko'; renderHub(); } }))));
  } else if (wc.out) {
    body.append(h('div', { class: 'next out' },
      h('p', { class: 'eyebrow', text: 'Eliminado' }),
      h('h3', { text: u.n + ' quedó afuera' }),
      h('p', { class: 'meta', text: 'Eliminado en: ' + wc.exit + '. Podés seguir el torneo sin vos o empezar otro.' }),
      h('div', { class: 'row' },
        h('button', { class: 'btn go', type: 'button', text: 'Simular el resto del torneo', onclick: () => { WC.simulateRest(wc); saveWc(); hubTab = 'match'; renderHub(); } }),
        h('button', { class: 'btn', type: 'button', text: 'Nuevo Mundial', onclick: () => { buildWcSetup(); showScreen('wcsetup'); } }))));
  }
  if (wc.last) {
    body.append(h('div', { class: 'panel' },
      h('h4', { text: 'Resultados · ' + wc.last.title }),
      h('ul', { class: 'results' }, wc.last.items.slice().sort((a, b) => ((b.a === wc.user || b.b === wc.user) ? 1 : 0) - ((a.a === wc.user || a.b === wc.user) ? 1 : 0)).map(it => resultRow(it, wc.user)))));
  }
}

function groupsTab(body) {
  const order = wc.groups.map((g, i) => i).sort((a, b) => (wc.groups[b].teams.includes(wc.user) ? 1 : 0) - (wc.groups[a].teams.includes(wc.user) ? 1 : 0));
  const wrap = h('div', { class: 'gtabs' });
  for (const gi of order) {
    const g = wc.groups[gi], t = WC.table(wc, gi);
    const done = g.m.every(m => m.ga != null);
    const rows = t.map((r, i) => h('tr', { class: (r.c === wc.user ? 'me ' : '') + (i < 2 ? 'q' : (i === 2 && wc.format === 48 ? 'q3' : '')) },
      h('td', { class: 'pos', text: i + 1 }),
      h('td', { class: 'tm' }, kitChip(r.c), h('span', { text: WC.BY[r.c].n })),
      h('td', { text: r.pj }), h('td', { text: (r.dg > 0 ? '+' : '') + r.dg }), h('td', { class: 'pts', text: r.pts })));
    const matches = g.m.filter(m => m.ga != null).map(m => h('li', { class: (m.a === wc.user || m.b === wc.user) ? 'me' : '' }, WC.BY[m.a].c + ' ' + m.ga + '–' + m.gb + ' ' + WC.BY[m.b].c));
    wrap.append(h('div', { class: 'panel gt' + (g.teams.includes(wc.user) ? ' mine' : '') },
      h('h4', { text: 'Grupo ' + g.n + (done ? '' : '') }),
      h('div', { class: 'tablewrap' }, h('table', { class: 'tbl' },
        h('thead', null, h('tr', null, h('th', { text: '#' }), h('th', { text: 'Equipo' }), h('th', { text: 'PJ' }), h('th', { text: 'DG' }), h('th', { text: 'Pts' }))),
        h('tbody', null, rows))),
      matches.length ? h('ul', { class: 'mini' }, matches) : null));
  }
  body.append(wrap);
  body.append(h('p', { class: 'fine', text: wc.format === 48 ? 'Pasan los dos primeros de cada grupo y los 8 mejores terceros.' : 'Pasan los dos primeros de cada grupo.' }));
}

function koTab(body) {
  if (!wc.ko.rounds.length) {
    body.append(h('div', { class: 'panel' }, h('p', { class: 'meta', text: 'Las llaves se arman cuando termina la fase de grupos.' })));
    return;
  }
  const names = wc.format === 48 ? ['Dieciseisavos de final', 'Octavos de final', 'Cuartos de final', 'Semifinales', 'Final'] : ['Octavos de final', 'Cuartos de final', 'Semifinales', 'Final'];
  const counts = wc.format === 48 ? [16, 8, 4, 2, 1] : [8, 4, 2, 1];
  const cols = h('div', { class: 'bracket' });
  names.forEach((nm, i) => {
    const r = wc.ko.rounds[i];
    const bcm = h('div', { class: 'bcm' });
    const col = h('div', { class: 'bcol' + (r && i === wc.ko.cur && wc.stage !== 'done' ? ' now' : '') }, h('h4', { text: nm }), bcm);
    if (r) {
      r.matches.forEach((m, mi) => {
        const played = m.w != null;
        const line = (c, g) => h('div', { class: 'bt' + (m.w === c ? ' w' : '') + (c === wc.user ? ' me' : '') }, kitChip(c), h('span', { class: 'bn', text: WC.BY[c].c }), h('span', { class: 'bg', text: played ? g : '' }));
        bcm.append(h('div', { class: 'bm' + ((m.a === wc.user || m.b === wc.user) ? ' mine' : '') },
          nm === 'Final' && mi === 1 ? h('em', { text: 'Tercer puesto' }) : null,
          line(m.a, m.ga), line(m.b, m.gb),
          m.pen ? h('small', { text: 'Penales ' + m.pen[0] + '–' + m.pen[1] }) : null));
      });
    } else {
      for (let k = 0; k < counts[i]; k++) bcm.append(h('div', { class: 'bm empty' }, h('div', { class: 'bt', text: 'Por definir' })));
    }
    cols.append(col);
  });
  body.append(h('div', { class: 'bracketwrap' }, cols));
}

function renderHub() {
  const s = SCREENS.wchub;
  clearEl(s);
  if (!wc) { showScreen('wcsetup'); return; }
  const c = card('wide hub');
  s.append(c);
  const u = WC.BY[wc.user];
  const stageTxt = wc.stage === 'done' ? 'Terminado' : wc.out ? 'Eliminado' : wc.stage === 'groups' ? 'Fase de grupos' : (wc.ko.rounds[wc.ko.cur] || {}).name;
  c.append(h('div', { class: 'hubhead' },
    kitChip(u.c, true),
    h('div', { class: 'ht' }, h('b', { text: u.n }), h('span', { text: 'Mundial de ' + wc.format + ' selecciones · ' + stageTxt })),
    h('div', { class: 'hbtn' },
      h('button', { class: 'btn sm', type: 'button', text: 'Inicio', onclick: () => showScreen('home') }),
      h('button', { class: 'btn sm', type: 'button', id: 'abandonBtn', text: 'Abandonar', onclick: e => {
        if (Date.now() - abandonArm < 3000) { wc = null; saveWc(); buildWcSetup(); showScreen('wcsetup'); }
        else { abandonArm = Date.now(); e.target.textContent = '¿Seguro?'; setTimeout(() => { if (e.target.isConnected) e.target.textContent = 'Abandonar'; }, 3000); }
      } }))));
  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  for (const [k, label] of [['match', 'Partido'], ['groups', 'Grupos'], ['ko', 'Llaves']]) {
    tabs.append(h('button', { class: 'tab' + (hubTab === k ? ' on' : ''), type: 'button', role: 'tab', 'aria-selected': hubTab === k ? 'true' : 'false', text: label, onclick: () => { hubTab = k; renderHub(); } }));
  }
  c.append(tabs);
  const body = h('div', { class: 'hubbody' });
  c.append(body);
  if (hubTab === 'match') matchTab(body); else if (hubTab === 'groups') groupsTab(body); else koTab(body);
}

/* ---------- Jugar / simular ---------- */
function wcPlay() {
  const p = WC.pending(wc);
  if (!p) return;
  const oppC = p.a === wc.user ? p.b : p.a;
  const kits = WC.kitsFor(wc.user, oppC);
  const diff = WC.diffFor(wc);
  launchGame({
    size: wc.size, diff, humanTeam: 0, timeLimit: wc.minutes, scoreLimit: 0, allowDraw: p.kind === 'group',
    pitch: pitchResolve(wc.pitch), teamNames: [WC.BY[wc.user].n, WC.BY[oppC].n], teamCodes: [wc.user, oppC], kits,
    subtitle: p.kind === 'group' ? 'Grupo ' + wc.groups[p.gi].n + ' · fecha ' + (wc.md + 1) : p.label
  }, 'wc', () => wcMatchOver(p, oppC), () => [
    { text: 'Abandonar partido', fn: () => { onLocalEnd = null; setState('idle'); renderHub(); showScreen('wchub'); } }
  ]);
}

function wcMatchOver(p, oppC) {
  onLocalEnd = null;
  const ug = game.score[0], og = game.score[1];
  sound('end');
  if (game.tied) {
    /* empate en eliminación directa: se define por penales */
    setState('ended');
    startPenalties({ names: [WC.BY[wc.user].n, WC.BY[oppC].n], kits: game.kits, diff: WC.diffFor(wc), onDone: pen => wcMatchEnd(p, oppC, ug, og, pen) });
  } else wcMatchEnd(p, oppC, ug, og, null);
}

function wcMatchEnd(p, oppC, ug, og, pen) {
  WC.submitUser(wc, ug, og, pen ? pen.u : null, pen ? pen.c : null);
  saveWc();
  const win = pen ? pen.u > pen.c : ug > og, draw = !pen && ug === og;
  const u = WC.BY[wc.user], o = WC.BY[oppC];
  let meta = p.label + (pen ? ' · penales ' + pen.u + '–' + pen.c : game.overtime ? ' · gol de oro' : '');
  if (wc.out) meta += ' · Quedaste eliminado';
  else if (wc.stage === 'done') meta += ' · ' + wc.exit;
  else if (p.kind === 'group' && wc.stage === 'ko') meta += ' · ¡Clasificaste!';
  const toHub = () => { setState('idle'); hubTab = 'match'; renderHub(); showScreen('wchub'); };
  showEnd({
    title: win ? '¡Ganaste!' : draw ? 'Empate' : 'Perdiste', res: win ? 'win' : draw ? 'draw' : 'lose',
    score: [ug, og], colors: game.kits, names: [u.n, o.n], meta,
    buttons: [{ text: wc.stage === 'done' ? 'Ver el resultado final' : wc.out ? 'Ver el torneo' : 'Continuar', go: true, fn: toHub }]
  });
}

function wcSim() {
  const p = WC.pending(wc);
  if (!p) return;
  WC.simUser(wc);
  saveWc();
  renderHub();
}

function initWc() {
  mkScreen('wcsetup'); mkScreen('wcteam'); mkScreen('wchub');
  buildWcSetup();
}
