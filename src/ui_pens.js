'use strict';
/* ===== Penales (al estilo del mapa de penales de HaxBall): se juega sobre el arco, con la física del juego =====
   El que patea arranca atrás de la pelota, corre y le pega. El arquero se mueve dentro de su área. */
const PK = { cur: null };

/* o: { names:[tú, rival], kits:[color tú, color rival], diff, first?: 'u'|'c', onDone({u, c, first}) } */
function startPenalties(o) {
  const S = PEN.create(o.first === 'u' || o.first === 'c' ? o.first : (Math.random() < 0.5 ? 'u' : 'c'));
  PK.cur = { S, o, kick: null, who: null, phase: 'intro', t: 0, acc: 0, last: performance.now(), msg: '', good: false, done: false };
  nextPenalty(PK.cur);
  mode = 'pens'; view = null;
  pauseOpts = () => [];
  setState('playing');
  loadFonts(); unlockAudio();
}

function nextPenalty(P) {
  const o = P.o, who = PEN.turn(P.S);
  P.who = who;
  P.kick = PEN.newKick({
    diff: o.diff,
    kits: who === 'u' ? [o.kits[0], o.kits[1]] : [o.kits[1], o.kits[0]],
    names: who === 'u' ? [o.names[0], o.names[1]] : [o.names[1], o.names[0]]
  });
  P.phase = 'intro'; P.t = 0; P.msg = '';
  for (const q of P.kick.G.players) q.me = (who === 'u') === (q.team === 0);   // marca a mi jugador
}

function penFrame(now) {
  const P = PK.cur;
  if (!P || P.done || state === 'ended' || state === 'idle') {
    g2.setTransform(dpr, 0, 0, dpr, 0, 0); g2.fillStyle = COL.bg; g2.fillRect(0, 0, VW, VH);
    return;
  }
  if (state === 'playing') {
    const sp = typeof window.PK_SPEED === 'number' ? window.PK_SPEED : 1;   // PK_SPEED solo lo usan las pruebas
    P.acc += Math.min(now - P.last, 100) * sp;
    let guard = 0;
    while (P.acc >= DT && guard++ < 6 * sp) { P.acc -= DT; penTick(P); if (P.done) return; }
  } else P.acc = 0;
  P.last = now;
  drawPen(P, state === 'playing' ? P.acc / DT : 1);
}

function penTick(P) {
  const Kk = P.kick, idle = { dx: 0, dy: 0, kick: false };
  if (P.phase === 'intro') {
    if (++P.t >= 110) P.phase = 'live';
    return;
  }
  if (P.phase === 'live') {
    const mine = readInput();
    const inS = P.who === 'u' ? mine : PEN.aiShooter(Kk);
    const inK = P.who === 'u' ? PEN.aiKeeper(Kk) : mine;
    PEN.tick(Kk, inS, inK);
    for (const e of Kk.events.splice(0)) if (e === 'kick' || e === 'wall') sound(e);
    if (Kk.result) {
      const goal = Kk.result === 'goal', you = P.who === 'u';
      PEN.record(P.S, P.who, goal);
      P.good = goal === you;
      P.msg = goal ? '¡GOL!' : Kk.result === 'save' ? (you ? '¡Te la atajó!' : '¡Atajaste!') : Kk.reason === 'tiempo' ? '¡Se acabó el tiempo!' : (you ? '¡Afuera!' : '¡Se fue afuera!');
      if (goal) sound('goal');
      P.phase = 'result'; P.t = 0;
    }
    return;
  }
  /* resultado a la vista un momento y sigue el próximo penal */
  PEN.tick(Kk, idle, idle);
  if (++P.t >= 100) {
    if (P.S.done) penFinish(P); else nextPenalty(P);
  }
}

function penFinish(P) {
  P.done = true;
  sound('end');
  const [su, sc] = PEN.score(P.S), win = P.S.winner === 'u';
  setState('ended');
  const el = SCREENS.pens, c = card('small');
  clearEl(el); el.append(c);
  const dotsRow = (k, i) => {
    const row = h('div', { class: 'pk-row' }, h('b', { text: P.o.names[i] }));
    const dots = h('span', { class: 'pk-dots' });
    for (const v of P.S[k]) dots.append(h('i', { class: v ? 'ok' : 'no' }));
    row.append(dots);
    return row;
  };
  c.append(
    h('h2', { id: 'endTitle', 'data-res': win ? 'win' : 'lose', text: win ? '¡Ganaste por penales!' : 'Perdiste por penales' }),
    h('div', { id: 'endScore' }, h('b', { class: 'r', style: 'color:' + P.o.kits[0], text: su }), h('i', { text: '–' }), h('b', { class: 'b', style: 'color:' + P.o.kits[1], text: sc })),
    dotsRow('u', 0), dotsRow('c', 1),
    h('div', { class: 'stack' }, h('button', { class: 'btn go', type: 'button', text: 'Continuar', onclick: () => { PK.cur = null; P.o.onDone({ u: su, c: sc, first: P.S.first }); } })));
  showScreen('pens');
}

/* ---------- Dibujo ---------- */
function drawPen(P, alpha) {
  const Kk = P.kick, G = Kk.G, geo = G.geo, W = geo.W, gh = geo.gh, d = geo.d;
  g2.setTransform(dpr, 0, 0, dpr, 0, 0);
  g2.fillStyle = COL.bg; g2.fillRect(0, 0, VW, VH);
  const x0 = W - 278, x1 = W + d + 22, yh = gh + 58;
  const top = 108, bot = 34, aw = VW - 16, ah = Math.max(60, VH - top - bot);
  const sc = Math.min(aw / (x1 - x0), ah / (2 * yh)), cx = (x0 + x1) / 2;
  const ix = q => q.px + (q.x - q.px) * alpha, iy = q => q.py + (q.y - q.py) * alpha;

  g2.save();
  g2.translate(VW / 2 - cx * sc, top + ah / 2); g2.scale(sc, sc);
  g2.beginPath(); g2.rect(x0 - 6, -yh, x1 - x0 + 12, yh * 2); g2.clip();
  g2.fillStyle = COL.pitch; g2.fillRect(x0 - 10, -yh - 10, x1 - x0 + 30, yh * 2 + 20);
  g2.fillStyle = 'rgba(255,255,255,.045)';
  for (let x = x0 - 10; x < W; x += 80) g2.fillRect(x, -yh - 10, 40, yh * 2 + 20);
  /* red del arco */
  g2.fillStyle = 'rgba(8,14,10,.3)'; g2.fillRect(W, -gh, d, gh * 2);
  g2.strokeStyle = 'rgba(255,255,255,.14)'; g2.lineWidth = 1; g2.beginPath();
  for (let x = 8; x < d; x += 8) { g2.moveTo(W + x, -gh); g2.lineTo(W + x, gh); }
  for (let y = -gh + 8; y < gh; y += 8) { g2.moveTo(W, y); g2.lineTo(W + d, y); }
  g2.stroke();
  /* líneas */
  g2.strokeStyle = COL.line; g2.lineWidth = 3; g2.lineJoin = 'round'; g2.lineCap = 'round';
  g2.beginPath();
  g2.moveTo(W, -yh); g2.lineTo(W, yh);
  g2.moveTo(W, -105); g2.lineTo(W - 165, -105); g2.lineTo(W - 165, 105); g2.lineTo(W, 105);
  g2.moveTo(W, -gh - 6); g2.lineTo(W - 62, -gh - 6); g2.lineTo(W - 62, gh + 6); g2.lineTo(W, gh + 6);
  g2.stroke();
  g2.strokeStyle = 'rgba(199,230,189,.75)'; g2.lineWidth = 2;
  g2.beginPath(); g2.moveTo(W, -gh); g2.lineTo(W + d, -gh); g2.lineTo(W + d, gh); g2.lineTo(W, gh); g2.stroke();
  g2.beginPath(); g2.arc(W - PEN.SPOT, 0, 3.5, 0, TAU); g2.fillStyle = COL.line; g2.fill();
  /* zona del arquero */
  g2.setLineDash([6, 6]); g2.strokeStyle = 'rgba(255,255,255,.28)'; g2.lineWidth = 1.5;
  g2.strokeRect(W - PEN.KEEPER.x0 - 15, -(gh - PEN.KEEPER.edge) - 15, PEN.KEEPER.x0 - PEN.KEEPER.x1 + 30, (gh - PEN.KEEPER.edge) * 2 + 30);
  g2.setLineDash([]);
  for (const post of G.posts) {
    if (post.x < 0) continue;
    g2.beginPath(); g2.arc(post.x, post.y, post.r, 0, TAU); g2.fillStyle = '#f2f2f2'; g2.fill();
    g2.lineWidth = 2; g2.strokeStyle = COL.ink; g2.stroke();
  }
  const b = G.ball;
  g2.beginPath(); g2.arc(ix(b), iy(b), b.r, 0, TAU); g2.fillStyle = '#fff'; g2.fill(); g2.lineWidth = 2; g2.strokeStyle = COL.ink; g2.stroke();
  const labels = [];
  for (const p of G.players) {
    const x = ix(p), y = iy(p), fill = kitOf(G, p.team);
    g2.globalAlpha = p.noBall ? 0.45 : 1;      // el que ya pateó queda "fantasma": no puede volver a tocar la pelota
    g2.beginPath(); g2.arc(x, y, p.r, 0, TAU); g2.fillStyle = fill; g2.fill();
    const hot = p.flash > 0;
    g2.lineWidth = hot ? 3.2 : 2.4; g2.strokeStyle = hot ? '#fff' : COL.ink; g2.stroke();
    if (p.me) {
      g2.beginPath(); g2.moveTo(x - 6, y - p.r - 11); g2.lineTo(x + 6, y - p.r - 11); g2.lineTo(x, y - p.r - 3); g2.closePath();
      g2.fillStyle = '#fff'; g2.fill(); g2.lineWidth = 1.5; g2.strokeStyle = COL.ink; g2.stroke();
    }
    g2.globalAlpha = 1;
    labels.push({ x: VW / 2 + (x - cx) * sc, y: top + ah / 2 + (y + p.r) * sc, name: p.name, me: p.me });
  }
  g2.restore();
  g2.font = '600 12px ' + BODY; g2.textAlign = 'center'; g2.textBaseline = 'alphabetic';
  for (const l of labels) {
    g2.lineWidth = 3; g2.strokeStyle = 'rgba(8,12,10,.7)'; g2.strokeText(l.name, l.x, l.y + 14);
    g2.fillStyle = l.me ? '#fff' : 'rgba(255,255,255,.78)'; g2.fillText(l.name, l.x, l.y + 14);
  }
  drawPenHud(P);

  /* cartel de resultado / aviso de arranque */
  const big = (text, col, y) => {
    g2.font = '700 ' + Math.round(Math.min(64, VW / 9)) + 'px ' + FONT; g2.textAlign = 'center'; g2.textBaseline = 'middle';
    g2.lineWidth = 8; g2.lineJoin = 'round'; g2.strokeStyle = 'rgba(8,12,10,.85)'; g2.strokeText(text, VW / 2, y);
    g2.fillStyle = col; g2.fillText(text, VW / 2, y); g2.textBaseline = 'alphabetic';
  };
  if (P.phase === 'result') big(P.msg, P.good ? COL.line : '#ff9a86', top + ah / 2);
  else if (P.phase === 'intro') big(P.who === 'u' ? 'Te toca patear' : 'Te toca atajar', '#fff', top + ah / 2);
}

function drawPenHud(P) {
  const S = P.S, [su, sc] = PEN.score(S), o = P.o;
  const pw = Math.min(250, VW / 2 - 40), y = 8, hh = 62;
  const panel = (x, k, i, goals, active) => {
    g2.fillStyle = COL.hud; rr(x, y, pw, hh, 10); g2.fill();
    if (active) { g2.lineWidth = 2; g2.strokeStyle = o.kits[i]; rr(x, y, pw, hh, 10); g2.stroke(); }
    g2.textBaseline = 'middle'; g2.textAlign = 'left'; g2.font = '600 15px ' + FONT; g2.fillStyle = '#e9f0ea';
    g2.beginPath(); g2.arc(x + 14, y + 20, 6, 0, TAU); g2.fillStyle = o.kits[i]; g2.fill(); g2.lineWidth = 2; g2.strokeStyle = COL.ink; g2.stroke();
    g2.fillStyle = '#e9f0ea'; g2.fillText(o.names[i], x + 28, y + 21, pw - 80);
    const n = Math.max(5, S[k].length);
    for (let j = 0; j < n; j++) {
      const v = S[k][j], cxp = x + 18 + j * 17;
      g2.beginPath(); g2.arc(cxp, y + 45, 5.5, 0, TAU);
      if (v === undefined) { g2.lineWidth = 2; g2.strokeStyle = '#93a89b'; g2.stroke(); }
      else { g2.fillStyle = v ? '#8fd69b' : '#ff9a86'; g2.fill(); }
    }
    g2.textAlign = 'right'; g2.font = '700 30px ' + FONT; g2.fillStyle = '#e9f0ea'; g2.fillText(String(goals), x + pw - 14, y + hh / 2 + 1);
  };
  panel(8, 'u', 0, su, P.who === 'u');
  panel(VW - 62 - pw, 'c', 1, sc, P.who === 'c');   // deja lugar al botón de pausa
  g2.textBaseline = 'alphabetic'; g2.textAlign = 'center';
  const sudden = S.u.length >= 5 && S.c.length >= 5;
  g2.font = '600 13px ' + BODY; g2.fillStyle = 'rgba(233,240,234,.7)';
  if (VW > 640) {
    g2.font = '700 18px ' + FONT; g2.fillStyle = '#e9f0ea'; g2.fillText('PENALES', VW / 2, y + 26);
    g2.font = '600 13px ' + BODY; g2.fillStyle = sudden ? '#ffd27a' : 'rgba(233,240,234,.7)'; g2.fillText(sudden ? 'Muerte súbita' : 'Tiro ' + (Math.floor((S.u.length + S.c.length) / 2) + 1) + ' de 5', VW / 2, y + 46);
  }
  const live = P.phase === 'live' && P.kick.shotTick == null;
  let hint = P.who === 'u'
    ? (isTouch ? 'Corré y tocá PATEAR: tenés un solo toque' : 'Corré y pateala: tenés un solo toque (X o Espacio)')
    : (isTouch ? 'Atajá: solo te movés sobre la línea del arco' : 'Atajá: solo te movés sobre la línea del arco');
  if (sudden && VW <= 640) hint = 'Muerte súbita · ' + hint;
  g2.font = '600 14px ' + BODY; g2.fillStyle = 'rgba(233,240,234,.85)';
  g2.fillText(hint, VW / 2, 96);
  if (live && P.who === 'u') {
    const left = Math.max(0, 1 - P.kick.ticks / PEN.AIM_TICKS), bw = Math.min(360, VW - 40);
    g2.fillStyle = 'rgba(255,255,255,.14)'; g2.fillRect(VW / 2 - bw / 2, VH - 22, bw, 6);
    g2.fillStyle = left < 0.25 ? '#ff9a86' : '#c7e6bd'; g2.fillRect(VW / 2 - bw / 2, VH - 22, bw * left, 6);
  }
}

function initPens() { mkScreen('pens'); }
