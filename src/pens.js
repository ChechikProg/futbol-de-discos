'use strict';
/* ===== Tanda de penales al estilo del mapa de penales de HaxBall (sin interfaz) =====
   Cada penal se juega con la misma física del juego: la pelota está en el punto penal, el que patea
   arranca unos pasos atrás y corre a pegarle, y el arquero (un disco limitado a su área) trata de taparla.
   "u" es el jugador y "c" la máquina. */
const PEN = (() => {
  const K = typeof module !== 'undefined' ? require('./core.js') : { createGame, step, predictCross, C, DIFF };
  const SPOT = 220;          // distancia del punto penal a la línea de gol
  const RUN = 165;           // cuánto detrás de la pelota arranca el que patea (afuera de la medialuna)
  const BOOST = 1.4;         // el tiro sale bastante más rápido que uno común
  const AIM_TICKS = 600;      // tiempo para patear (10 s)
  const FEINT = { stop: 36, k: -2, over: 2.2 };   // se frena a 36 de la pelota y el último paso sale cruzado (corrige de más porque el toque abre menos)
  const KEEPER = { acc: 1.9, damp: 0.9, x0: 24, x1: 24, edge: 14 };   // arquero clavado en la línea (no puede adelantarse, solo se mueve de costado), más ágil que un jugador común
  const REACT = { easy: 11, normal: 8, hard: 6, expert: 5, impossible: 6 };
  const AIMBAND = { easy: [0.05, 0.6], normal: [0.2, 0.75], hard: [0.4, 0.85], expert: [0.6, 0.88], impossible: [0.8, 0.9] };   // qué tan cerca del palo patea la máquina          // ticks que tarda el arquero en reaccionar al tiro
  const AIMERR = { easy: 0.45, normal: 0.3, hard: 0.18, expert: 0.08, impossible: 0.02 };
  const GUESS = { easy: 0.4, normal: 0.22, hard: 0.1, expert: 0.03, impossible: 0 };   // chance de que el arquero se tire para el lado equivocado

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
      size: 1, diff: o.diff, humanTeam: -1, timeLimit: 0, scoreLimit: 0, manual: true, physics: 'classic',
      pitch: { W: 520, H: 240, gh: 100 }, kits: o.kits, teamNames: o.names,
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
        noise: (Math.random() * 2 - 1) * err * 30, read: o.diff === 'impossible',
        feint: o.diff === 'expert' || o.diff === 'impossible'
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
    } else if (Kk.shotTick == null) {
      ty = Math.sin(Kk.ticks / 28) * 7;                                 // se mueve un poco esperando
      if (a.read) {
        /* Imposible: lee la carrera del que patea (la pelota sale en la línea que une su centro con la pelota) */
        const sh = G.players[0], dx = b.x - sh.x, dy = b.y - sh.y, dd = Math.hypot(dx, dy) || 1;
        const spd = Math.hypot(sh.vx, sh.vy), cosA = spd > 0 ? (sh.vx * dx + sh.vy * dy) / (dd * spd) : 0;
        if (dd < 90 && spd > 1 && cosA > 0.93 && dx > 1) ty = b.y + (W - b.x) * dy / dx;   // solo cuando ya corre derecho a la pelota
      }
    }
    ty = Math.max(-(gh - KEEPER.edge), Math.min(gh - KEEPER.edge, ty));
    const dy = (ty - gk.y) / 10 - gk.vy * 0.35, dx = (tx - gk.x) / 10 - gk.vx * 0.35;
    return { dx: Math.max(-1, Math.min(1, dx)), dy: Math.max(-1, Math.min(1, dy)), kick: false };
  }

  /* controles de la máquina como pateador: espera, se acomoda detrás de la pelota y corre a pegarle */
  function aiShooter(Kk) {
    const G = Kk.G, sh = G.players[0], b = G.ball, W = G.geo.W, a = Kk.ai;
    if (Kk.shotTick != null) return { dx: 0, dy: 0, kick: false };
    if (Kk.ticks < a.wait) return { dx: 0, dy: 0, kick: false };
    /* corre derecho hasta quedar parado detrás de la pelota (sin delatar el lado), hace una pausa
       y recién en el último paso sale cruzado hacia el palo elegido */
    if (a.phase === 0) {
      const px = b.x - FEINT.stop, py = b.y, dx = px - sh.x, dy = py - sh.y, d = Math.hypot(dx, dy);
      if (d < 3 && Math.hypot(sh.vx, sh.vy) < 0.25) { a.phase = 1; a.hold = Kk.ticks + 6 + Math.floor(Math.random() * 30); }
      else {
        const sp = Math.min(2.4, Math.sqrt(2 * 0.1 * d) * 0.8);
        const ex = (d ? dx / d : 0) * sp - sh.vx, ey = (d ? dy / d : 0) * sp - sh.vy, el = Math.hypot(ex, ey);
        return el > 0.02 ? { dx: ex / el * Math.min(1, el / 0.2), dy: ey / el * Math.min(1, el / 0.2), kick: false } : { dx: 0, dy: 0, kick: false };
      }
    }
    if (a.phase === 1) {
      if (Kk.ticks < a.hold) return { dx: -sh.vx * 5, dy: -sh.vy * 5, kick: false };
      a.phase = 2;
    }
    let vx = W - b.x, vy = a.aimY * FEINT.over - b.y; const vl = Math.hypot(vx, vy) || 1; vx /= vl; vy /= vl;
    const R = sh.r + b.r, tx = b.x - vx * (R - FEINT.k), ty = b.y - vy * (R - FEINT.k);
    const ex = tx - sh.x, ey = ty - sh.y, el = Math.hypot(ex, ey) || 1;
    return { dx: ex / el, dy: ey / el, kick: true };
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
    sh.in.dx = taken ? 0 : clamp1(inS.dx); sh.in.dy = taken ? 0 : clamp1(inS.dy);
    sh.in.kick = !taken;                   // patea solo al tocar la pelota: no hace falta apretar nada
    gk.in.dx = clamp1(inK.dx); gk.in.dy = clamp1(inK.dy); gk.in.kick = !!inK.kick;
    K.step(G);
    Kk.ticks++;
    for (const e of G.events.splice(0)) Kk.events.push(e);
    /* un solo toque: el primer contacto con la pelota es el tiro */
    if (G.lastTouch === sh && !sh.noBall) { sh.noBall = true; b.vx *= BOOST; b.vy *= BOOST; }
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

  return { create, turn, score, record, newKick, tick, aiKeeper, aiShooter, SPOT, RUN, AIM_TICKS, KEEPER, FEINT, REACT };
})();

if (typeof module !== 'undefined') module.exports = PEN;
