'use strict';
/* ===== Pantalla de penales (se usa cuando un partido termina empatado) ===== */
let pkRun = 0;
const pkSleep = ms => new Promise(r => setTimeout(r, ms * (typeof window.PK_SCALE === 'number' ? window.PK_SCALE : 1)));   // PK_SCALE solo lo usan las pruebas
const PK_COL = { KeyQ: 0, KeyW: 1, KeyE: 2, KeyA: 0, KeyS: 1, KeyD: 2, ArrowLeft: 0, ArrowDown: 1, ArrowRight: 2 };
const PK_ZONE = ['Arriba a la izquierda', 'Arriba al medio', 'Arriba a la derecha', 'Abajo a la izquierda', 'Abajo al medio', 'Abajo a la derecha'];

/* o: { names:[tú, rival], kits:[color tú, color rival], diff, onDone({u, c, first}) } */
function startPenalties(o) {
  const run = ++pkRun;
  const S = PEN.create(Math.random() < 0.5 ? 'u' : 'c');
  const hist = [];
  const el = SCREENS.pens, c = card('pk');
  clearEl(el); el.append(c);

  const dots = { u: h('span', { class: 'pk-dots' }), c: h('span', { class: 'pk-dots' }) };
  const nums = { u: h('em', { text: '0' }), c: h('em', { text: '0' }) };
  const team = (k, i) => h('div', { class: 'pk-team' },
    h('span', { class: 'pk-kit', style: 'background:' + o.kits[i] }), h('b', { text: o.names[i] }), dots[k], nums[k]);
  const info = h('p', { class: 'pk-info' });
  const hint = h('p', { class: 'pk-hint' });
  const keeper = h('div', { class: 'pk-keeper' });
  const ball = h('div', { class: 'pk-ball' });
  const cells = h('div', { class: 'pk-cells' });
  const flash = h('div', { class: 'pk-flash' });
  const goal = h('div', { class: 'pk-goal' }, h('div', { class: 'pk-net' }), keeper, ball, cells, flash);
  const foot = h('div', { class: 'pk-foot' });
  c.append(h('h2', { text: 'Penales' }), h('div', { class: 'pk-head' }, team('u', 0), team('c', 1)), info, goal, hint, foot);

  function paint() {
    const [su, sc] = PEN.score(S);
    nums.u.textContent = su; nums.c.textContent = sc;
    for (const k of ['u', 'c']) {
      clearEl(dots[k]);
      for (let i = 0; i < Math.max(5, S[k].length); i++) {
        const v = S[k][i];
        dots[k].append(h('i', { class: v === undefined ? '' : v ? 'ok' : 'no' }));
      }
    }
  }
  const colX = col => 16.67 + col * 33.33;
  const rowY = row => (row === 0 ? 26 : 70);

  function resetPositions(userKeeps) {
    for (const e of [ball, keeper]) e.style.transition = 'none';
    ball.style.left = '50%'; ball.style.top = '138%'; ball.style.transform = 'translate(-50%,-50%)';
    keeper.style.left = '50%'; keeper.style.transform = 'translate(-50%,0)';
    keeper.style.background = o.kits[userKeeps ? 0 : 1];
    flash.textContent = ''; flash.className = 'pk-flash';
    void goal.offsetWidth;
    for (const e of [ball, keeper]) e.style.transition = '';
  }

  /* espera a que el jugador elija; devuelve { col, row } al patear o { col } al atajar */
  function pick(shooting) {
    return new Promise(resolve => {
      clearEl(cells);
      let done = false;
      const finish = v => {
        if (done || run !== pkRun) return;
        done = true; window.removeEventListener('keydown', onKey); clearEl(cells); resolve(v);
      };
      if (shooting) {
        for (let r = 0; r < 2; r++) for (let col = 0; col < 3; col++) {
          cells.append(h('button', { class: 'pk-cell', type: 'button', 'aria-label': PK_ZONE[r * 3 + col], onclick: () => finish({ col, row: r }) }));
        }
      } else {
        for (let col = 0; col < 3; col++) {
          cells.append(h('button', { class: 'pk-cell keep', type: 'button', style: 'grid-column:' + (col + 1) + ';grid-row:1/3', 'aria-label': ['Izquierda', 'Centro', 'Derecha'][col], onclick: () => finish({ col }) }));
        }
      }
      function onKey(e) {
        if (!(e.code in PK_COL)) return;
        e.preventDefault();
        const col = PK_COL[e.code];
        if (!shooting) return finish({ col });
        if (e.code.startsWith('Key')) finish({ col, row: 'QWE'.includes(e.code[3]) ? 0 : 1 });
        else if (e.code === 'ArrowDown') finish({ col: 1, row: 1 });
        else finish({ col, row: 1 });
      }
      window.addEventListener('keydown', onKey);
    });
  }

  async function playKick(who, shot, keepCol, outcome) {
    keeper.style.left = colX(keepCol) + '%';
    keeper.style.transform = 'translate(-50%,0) scaleX(' + (keepCol === 1 ? 1.1 : 1.6) + ')';
    let x = colX(shot.col), y = rowY(shot.row), sc = 0.75;
    if (outcome === 'miss') {
      if (shot.row === 0 && shot.col !== 1 && Math.random() < 0.5) { x = shot.col === 0 ? -10 : 110; y = 30; }
      else y = -22;
      sc = 0.6;
    }
    sound('kick');
    ball.style.left = x + '%'; ball.style.top = y + '%'; ball.style.transform = 'translate(-50%,-50%) scale(' + sc + ')';
    await pkSleep(620);
    const you = who === 'u';
    const text = outcome === 'goal' ? '¡GOL!' : outcome === 'save' ? (you ? '¡Te la atajó!' : '¡Atajaste!') : (you ? '¡Afuera!' : '¡Se fue afuera!');
    flash.textContent = text; flash.className = 'pk-flash ' + (outcome === 'goal' ? (you ? 'good' : 'bad') : (you ? 'bad' : 'good')) + ' on';
    if (outcome === 'goal') sound('goal');
  }

  async function loop() {
    paint();
    info.textContent = (S.first === 'u' ? 'Empezás vos pateando.' : o.names[1] + ' patea primero.') + ' Cinco tiros cada uno.';
    await pkSleep(1300);
    while (!S.done) {
      if (run !== pkRun) return;
      const who = PEN.turn(S), sudden = S.u.length >= 5 && S.c.length >= 5;
      const pre = sudden ? 'Muerte súbita. ' : '';
      resetPositions(who === 'c');
      let shot, keep;
      if (who === 'u') {
        info.textContent = pre + 'Te toca patear: elegí un rincón del arco.';
        hint.textContent = 'Tocá la zona, o usá Q W E (arriba) y A S D (abajo).';
        shot = await pick(true); if (run !== pkRun) return;
        hist.push(shot.col);
        keep = PEN.aiKeeper(Math.random, o.diff, hist.slice(0, -1));
      } else {
        info.textContent = pre + 'Te toca atajar: elegí hacia dónde tirarte.';
        hint.textContent = 'Tocá un lado, o usá ← ↓ → (también A S D).';
        keep = (await pick(false)).col; if (run !== pkRun) return;
        shot = PEN.aiShot(Math.random, o.diff);
      }
      hint.textContent = '';
      const out = PEN.resolve(shot, keep, Math.random);
      await playKick(who, shot, keep, out);
      PEN.record(S, who, out === 'goal');
      paint();
      await pkSleep(1300);
    }
    if (run !== pkRun) return;
    const [su, sc] = PEN.score(S), win = S.winner === 'u';
    sound('end');
    resetPositions(false);
    info.textContent = win ? '¡Ganaste por penales!' : 'Perdiste por penales.';
    info.classList.add('final');
    hint.textContent = '';
    foot.append(h('button', { class: 'btn go', type: 'button', text: 'Continuar', onclick: () => { pkRun++; o.onDone({ u: su, c: sc, first: S.first }); } }));
  }
  showScreen('pens');
  loop();
}

function initPens() { mkScreen('pens'); }
