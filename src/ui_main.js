'use strict';
/* ===== Inicio, partido contra la máquina y arranque ===== */
const LOCAL = Object.assign({ size: '1', diff: 'normal', side: '0', time: '3', goals: '3', pitch: { preset: 'classic' } }, store.get('local', {}));
LOCAL.pitch = pitchValid(LOCAL.pitch);
const saveLocal = () => store.set('local', LOCAL);

const LOCAL_GROUPS = [
  { key: 'size', label: 'Modo', opts: [['1', '1 vs 1'], ['2', '2 vs 2'], ['3', '3 vs 3']] },
  { key: 'diff', label: 'Dificultad de la máquina', opts: [['easy', 'Fácil'], ['normal', 'Normal'], ['hard', 'Difícil'], ['expert', 'Experto']],
    hints: {
      easy: 'Reacciona lento y define con poca puntería. Para entrar en calor.', normal: 'Juego parejo: persigue bien la pelota y a veces falla.',
      hard: 'Anticipa la pelota, se posiciona y define con precisión.', expert: 'Reflejos casi perfectos. Calcula rebotes, ataja y define al ángulo.'
    } },
  { key: 'side', label: 'Tu equipo', opts: [['0', 'Rojo', 'red'], ['1', 'Azul', 'blue']] },
  { key: 'time', label: 'Tiempo', opts: [['3', '3 min'], ['5', '5 min'], ['7', '7 min'], ['0', 'Sin límite']] },
  { key: 'goals', label: 'Goles para ganar', opts: [['3', '3'], ['5', '5'], ['10', '10'], ['0', 'Sin límite']] }
];

/* ---------- Lanzar un partido local (contra la máquina o Mundial) ---------- */
function launchGame(cfg, m, endHandler, pauseBtns) {
  loadFonts(); unlockAudio();
  game = createGame(cfg);
  for (const p of game.players) p.me = p.human;
  view = game; mode = m; acc = 0; lastT = performance.now();
  onLocalEnd = endHandler; pauseOpts = pauseBtns;
  setState('playing');
}

function startLocal() {
  saveLocal();
  launchGame({
    size: +LOCAL.size, diff: LOCAL.diff, humanTeam: +LOCAL.side, timeLimit: +LOCAL.time, scoreLimit: +LOCAL.goals,
    pitch: pitchResolve(LOCAL.pitch)
  }, 'local', localOver, () => [
    { text: 'Reiniciar partido', fn: startLocal },
    { text: 'Cambiar opciones', fn: () => { onLocalEnd = null; setState('idle'); showScreen('local'); } }
  ]);
}

function localOver() {
  onLocalEnd = null;
  sound('end');
  const win = game.winner, me = game.humanTeam;
  showEnd({
    title: win < 0 ? 'Empate' : (win === me ? '¡Ganaste!' : 'Perdiste'), res: win < 0 ? 'draw' : (win === me ? 'win' : 'lose'),
    score: game.score, colors: KIT_DEFAULT,
    meta: DIFF[LOCAL.diff].label + ' · ' + LOCAL.size + ' vs ' + LOCAL.size + ' · cancha ' + pitchText(LOCAL.pitch) + (game.overtime ? ' · definido en prórroga' : ''),
    buttons: [
      { text: 'Revancha', go: true, fn: startLocal },
      { text: 'Cambiar opciones', fn: () => { setState('idle'); showScreen('local'); } },
      { text: 'Inicio', fn: () => { setState('idle'); showScreen('home'); } }
    ]
  });
}

/* ---------- Pantallas ---------- */
const ICONS = {
  bot: '<svg viewBox="0 0 64 40" aria-hidden="true"><circle cx="14" cy="20" r="11" fill="#e56e56" stroke="#101412" stroke-width="3"/><circle cx="50" cy="20" r="11" fill="#5689e5" stroke="#101412" stroke-width="3"/><circle cx="32" cy="20" r="5" fill="#fff" stroke="#101412" stroke-width="2.5"/></svg>',
  online: '<svg viewBox="0 0 64 40" aria-hidden="true"><path d="M20 20h24" stroke="#c7e6bd" stroke-width="3" stroke-dasharray="3 5" stroke-linecap="round"/><circle cx="12" cy="20" r="9" fill="#e56e56" stroke="#101412" stroke-width="3"/><circle cx="52" cy="20" r="9" fill="#5689e5" stroke="#101412" stroke-width="3"/><path d="M26 11a9 9 0 0 1 12 0M22 6a15 15 0 0 1 20 0" fill="none" stroke="#c7e6bd" stroke-width="2.5" stroke-linecap="round"/></svg>',
  cup: '<svg viewBox="0 0 64 40" aria-hidden="true"><path d="M22 4h20v10c0 8-4 12-10 12s-10-4-10-12z" fill="#e8c14a" stroke="#101412" stroke-width="3" stroke-linejoin="round"/><path d="M22 7h-8c0 8 3 11 8 12M42 7h8c0 8-3 11-8 12" fill="none" stroke="#e8c14a" stroke-width="3" stroke-linecap="round"/><path d="M32 26v6M24 36h16" stroke="#e8c14a" stroke-width="4" stroke-linecap="round"/></svg>'
};

function modeCard(icon, title, desc, fn) {
  const b = h('button', { class: 'mode', type: 'button', onclick: fn });
  const ic = h('span', { class: 'mode-i' }); ic.innerHTML = icon;
  b.append(ic, h('span', { class: 'mode-t', text: title }), h('span', { class: 'mode-d', text: desc }));
  return b;
}

function buildHome() {
  const s = SCREENS.home, c = card('home');
  clearEl(s); s.append(c);
  const logo = h('span', { class: 'logo' }); logo.innerHTML = '<svg viewBox="0 0 56 56" aria-hidden="true"><rect x="2" y="8" width="52" height="40" rx="4" fill="#6e8d5a" stroke="#c7e6bd" stroke-width="2.5"/><path d="M28 8v40" stroke="#c7e6bd" stroke-width="2.5"/><circle cx="28" cy="28" r="8" fill="none" stroke="#c7e6bd" stroke-width="2.5"/><circle cx="16" cy="28" r="5.5" fill="#e56e56" stroke="#101412" stroke-width="2"/><circle cx="40" cy="28" r="5.5" fill="#5689e5" stroke="#101412" stroke-width="2"/><circle cx="28" cy="28" r="3.2" fill="#fff" stroke="#101412" stroke-width="1.5"/></svg>';
  c.append(h('div', { class: 'brand' }, logo, h('div', null, h('h1', { text: 'Fútbol de Discos' }), h('p', { class: 'sub', text: 'Elegí cómo querés jugar.' }))));
  c.append(h('div', { class: 'modes' },
    modeCard(ICONS.bot, 'Contra la máquina', '1v1, 2v2 o 3v3 con cuatro dificultades y cancha a medida.', () => { buildLocal(); showScreen('local'); }),
    modeCard(ICONS.online, 'Online', 'Salas con código para jugar con amigos, con bots que completan.', () => openOnline()),
    modeCard(ICONS.cup, 'Mundial', 'Elegí un país, jugá grupos y llaves hasta la final.', () => { buildWcSetup(); showScreen('wcsetup'); })));
  c.append(h('details', { class: 'keys' },
    h('summary', { text: 'Controles' }),
    h('div', null, h('b', { text: 'Mover' }), h('kbd', { text: 'W' }), h('kbd', { text: 'A' }), h('kbd', { text: 'S' }), h('kbd', { text: 'D' }), ' o flechas'),
    h('div', null, h('b', { text: 'Patear' }), h('kbd', { text: 'X' }), ' o ', h('kbd', { text: 'Espacio' }), '. Mantenelo apretado y patea al tocar la pelota.'),
    h('div', null, h('b', { text: 'Pausa' }), h('kbd', { text: 'P' }), ' o ', h('kbd', { text: 'Esc' })),
    h('div', null, h('b', { text: 'Celular' }), 'Joystick a la izquierda y botón a la derecha. Jugá en horizontal.')));
  c.append(h('button', { class: 'btn sm soundbtn', type: 'button', text: 'Sonido: ' + (SND.on ? 'sí' : 'no'), onclick: e => { SND.on = !SND.on; store.set('sound', SND.on); e.target.textContent = 'Sonido: ' + (SND.on ? 'sí' : 'no'); } }));
}

function buildLocal() {
  const s = SCREENS.local, c = card();
  clearEl(s); s.append(c);
  c.append(topbar('Contra la máquina', () => showScreen('home'), 'Inicio'));
  const grid = h('div', { class: 'groups' });
  for (const def of LOCAL_GROUPS) grid.append(segGroup('lc', def, LOCAL, saveLocal));
  grid.append(pitchGroup('lc', () => LOCAL.pitch, v => { LOCAL.pitch = v; saveLocal(); }));
  c.append(grid);
  c.append(h('button', { class: 'btn go', type: 'button', text: 'Jugar', onclick: startLocal }));
}

/* ---------- Arranque ---------- */
function init() {
  mkScreen('home'); mkScreen('local');
  mkScreen('pause', 'overlay').append(card('small'));
  mkScreen('end', 'overlay').append(card('small'));
  initWc();
  initOnline();
  buildHome();
  startLoop();
  let joined = false;
  try {
    const m = /^#sala-([A-Za-z]{4})$/.exec(location.hash);
    if (m) { joined = true; openOnline(m[1].toUpperCase()); }
  } catch (e) { /* ok */ }
  if (!joined) showScreen('home');
}
init();
