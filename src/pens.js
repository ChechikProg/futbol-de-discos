'use strict';
/* ===== Tanda de penales al estilo del mapa de penales de HaxBall (sin interfaz) =====
   Cada penal se juega con la misma física del juego: la pelota está en el punto penal, el que patea
   arranca unos pasos atrás y corre a pegarle, y el arquero (un disco limitado a su área) trata de taparla.
   "u" es el jugador y "c" la máquina. */
const PEN = (() => {
  const K = typeof module !== 'undefined' ? require('./core.js') : { createGame, step, predictCross, C, DIFF };
  const SPOT = 150;          // distancia del punto penal a la línea de gol
  const RUN = 95;            // cuánto detrás de la pelota arranca el que patea
  const AIM_TICKS = 600;     // tiempo para patear (10 s)
  const KEEPER = { acc: 2.2, damp: 0.9, x0: 34, x1: 14, edge: 14 };   // arquero pegado a la línea (no puede adelantarse), más ágil que un jugador común
  const REACT = { easy: 26, normal: 18, hard: 16, expert: 14 };
  const AIMBAND = { easy: [0.3, 0.7], normal: [0.45, 0.8], hard: [0.6, 0.84], expert: [0.7, 0.84] };   // qué tan cerca del palo patea la máquina          // ticks que tarda el arquero en reaccionar al tiro
  const AIMERR = { easy: 0.32, normal: 0.16, hard: 0.08, expert: 0.03 };
  const GUESS = { easy: 0.4, normal: 0.22, hard: 0.1, expert: 0.03 };   // chance de que el arquero se tire para el lado equivocado

  /* ---- tanda: 5 tiros cada uno y muerte súbita ---- */
  function create(first) { return { first, u: [], c: [], done: false, winner: null }; }
  function turn(s) {
    const second = s.first === 'u' ? 'c' : 'u';
    return (s.u.length + s.c.length) % 2 === 0 ? s.first : second;
  }
  function score(s) { return [s.u.filter(Boolean).length, s.c.filter(Boolean).length]; }
  function record(s, who, goal) {
    if (s.done) return s;
    s[who].push(!!goal);
    const [su, sc] = score(s), nu = s.u.length, nc = s.c.length;
    if (nu < 5 || nc < 5) {
      if (su > sc + (5 - nc)) { s.done = true; s.winner = 'u'; }
      else if (sc > su + (5 - nu)) { s.done = true; s.winner = 'c'; }
    } else if (nu === nc && su !== sc) { s.done = true; s.winner = su > sc ? 'u' : 'c'; }
    return s;
  }

  /* ---- un penal ---- */
  /* o: { diff, kits:[color del que patea, color del arquero], names:[patea, ataja] } */
  function newKick(o) {
    const G = K.createGame({
      size: 1, diff: o.diff, humanTeam: -1, timeLimit: 0, scoreLimit: 0, manual: true,
      pitch: { W: 370, H: 170, gh: 64 }, kits: o.kits, teamNames: o.names,
      roster: [{ team: 0, human: true, name: o.names[0] }, { team: 1, human: true, name: o.names[1] }]
    });
    const W = G.geo.W, gh = G.geo.gh, sh = G.players[0], gk = G.players[1];
    G.phase = 'play'; G.kickTeam = 0;
    G.ball.x = G.ball.px = W - SPOT; G.ball.y = G.ball.py = 0; G.ball.vx = G.ball.vy = 0;
    sh.x = sh.px = W - SPOT - RUN; sh.y = sh.py = 0;
    gk.x = gk.px = W - 24; gk.y = gk.py = 0; gk.accMul = KEEPER.acc; gk.damp = KEEPER.damp; gk.noKick = true;   // el arquero ataja, no patea
    const err = AIMERR[o.diff] != null ? AIMERR[o.diff] : 0.28;
    const side = Math.random() < 0.5 ? -1 : 1, band = AIMBAND[o.diff] || AIMBAND.normal;
    return {
      G, o, ticks: 0, shotTick: null, touched: false, pastLine: null, result: null, reason: '', events: [],
      ai: {
        wait: 40 + Math.floor(Math.random() * 40), phase: 0, side,
        aimY: side * gh * (band[0] + Math.random() * (band[1] - band[0])) + (Math.random() * 2 - 1) * err * gh,
        react: REACT[o.diff] != null ? REACT[o.diff] : 13, guess: Math.random() < (GUESS[o.diff] != null ? GUESS[o.diff] : 0.22),
        noise: (Math.random() * 2 - 1) * err * 30
      }
    };
  }

  /* controles de la máquina como arquero */
  function aiKeeper(Kk) {
    const G = Kk.G, gk = G.players[1], b = G.ball, W = G.geo.W, gh = G.geo.gh, a = Kk.ai;
    let ty = 0, tx = W - 24;
    if (Kk.shotTick != null && Kk.ticks - Kk.shotTick >= a.react) {
      const cr = K.predictCross(G, W, -1);
      if (cr) ty = cr.y + a.noise;
      else if (Math.abs(b.vx) > 0.3 && b.vx < 0) ty = gk.y * 0.9;      // el tiro se aleja o va al costado
      else ty = Math.max(-gh, Math.min(gh, b.y));
      if (a.guess && cr) ty = -Math.sign(cr.y || 1) * Math.abs(ty);     // se tiró para el lado equivocado
    } else if (Kk.shotTick == null) ty = Math.sin(Kk.ticks / 28) * 7;   // se mueve un poco esperando
    ty = Math.max(-(gh - KEEPER.edge), Math.min(gh - KEEPER.edge, ty));
    const dy = (ty - gk.y) / 10 - gk.vy * 0.35, dx = (tx - gk.x) / 10 - gk.vx * 0.35;
    return { dx: Math.max(-1, Math.min(1, dx)), dy: Math.max(-1, Math.min(1, dy)), kick: false };
  }

  /* controles de la máquina como pateador: espera, se acomoda detrás de la pelota y corre a pegarle */
  function aiShooter(Kk) {
    const G = Kk.G, sh = G.players[0], b = G.ball, W = G.geo.W, a = Kk.ai;
    if (Kk.shotTick != null) return { dx: 0, dy: 0, kick: false };
    if (Kk.ticks < a.wait) return { dx: 0, dy: 0, kick: false };
    let ux = W - b.x, uy = a.aimY - b.y; const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
    const px = b.x - ux * 42, py = b.y - uy * 42;
    if (a.phase === 0) {
      const d = Math.hypot(px - sh.x, py - sh.y);
      if (d < 10 && Math.hypot(sh.vx, sh.vy) < 0.9) a.phase = 1;
      else return { dx: (px - sh.x) / 25 - sh.vx * 0.9, dy: (py - sh.y) / 25 - sh.vy * 0.9, kick: false };
    }
    const dx = b.x - sh.x, dy = b.y - sh.y, d = Math.hypot(dx, dy) || 1;
    return { dx: dx / d, dy: dy / d, kick: true };
  }

  /* avanza un tick. inS / inK: controles del que patea y del arquero ({dx,dy,kick}) */
  function tick(Kk, inS, inK) {
    if (Kk.result) {                       // después del resultado la pelota sigue rodando un rato
      if ((Kk.after = (Kk.after || 0) + 1) < 95) {
        for (const q of Kk.G.players) { q.in.dx = q.in.dy = 0; q.in.kick = false; }
        K.step(Kk.G); Kk.G.events.length = 0;
      }
      return;
    }
    const G = Kk.G, sh = G.players[0], gk = G.players[1], b = G.ball, W = G.geo.W, gh = G.geo.gh;
    const clamp1 = v => Math.max(-1, Math.min(1, +v || 0));
    const taken = Kk.shotTick != null;     // después del tiro el que patea queda quieto y no puede volver a tocar la pelota
    sh.in.dx = taken ? 0 : clamp1(inS.dx); sh.in.dy = taken ? 0 : clamp1(inS.dy); sh.in.kick = taken ? false : !!inS.kick;
    gk.in.dx = clamp1(inK.dx); gk.in.dy = clamp1(inK.dy); gk.in.kick = !!inK.kick;
    K.step(G);
    Kk.ticks++;
    for (const e of G.events.splice(0)) Kk.events.push(e);
    /* un solo toque: el primer contacto con la pelota es el tiro */
    if (G.lastTouch === sh) sh.noBall = true;
    if (sh.x > W - SPOT + 10) { sh.x = W - SPOT + 10; if (sh.vx > 0) sh.vx = 0; }   // no puede pasar la línea de la pelota
    /* el arquero no sale de su zona */
    const ylim = gh - KEEPER.edge, xmin = W - KEEPER.x0, xmax = W - KEEPER.x1;
    if (gk.y > ylim) { gk.y = ylim; if (gk.vy > 0) gk.vy = 0; } if (gk.y < -ylim) { gk.y = -ylim; if (gk.vy < 0) gk.vy = 0; }
    if (gk.x > xmax) { gk.x = xmax; if (gk.vx > 0) gk.vx = 0; } if (gk.x < xmin) { gk.x = xmin; if (gk.vx < 0) gk.vx = 0; }

    if (Kk.shotTick == null) {
      if (sh.noBall || Math.hypot(b.x - (W - SPOT), b.y) > 22) Kk.shotTick = Kk.ticks;
      else if (Kk.ticks > AIM_TICKS) { Kk.result = 'miss'; Kk.reason = 'tiempo'; }
      return;
    }
    if (G.lastTouch === gk) Kk.touched = Kk.touched || Kk.ticks;
    if (G.phase === 'goal') { Kk.result = 'goal'; return; }
    if (b.x > W - b.r - 2 && Kk.pastLine == null) Kk.pastLine = Kk.ticks;
    const speed = Math.hypot(b.vx, b.vy), since = Kk.ticks - Kk.shotTick;
    if (Kk.touched && Kk.ticks - Kk.touched > 40) { Kk.result = 'save'; Kk.reason = 'atajada'; }
    else if (Kk.pastLine != null && Kk.ticks - Kk.pastLine > 30) { Kk.result = Kk.touched ? 'save' : 'miss'; Kk.reason = 'afuera'; }
    else if (b.x < W - SPOT - 70) { Kk.result = Kk.touched ? 'save' : 'miss'; Kk.reason = 'atrás'; }
    else if ((speed < 0.12 && since > 25) || since > 330) { Kk.result = Kk.touched ? 'save' : 'miss'; Kk.reason = 'parada'; }
  }

  return { create, turn, score, record, newKick, tick, aiKeeper, aiShooter, SPOT, RUN, AIM_TICKS, KEEPER };
})();

if (typeof module !== 'undefined') module.exports = PEN;
