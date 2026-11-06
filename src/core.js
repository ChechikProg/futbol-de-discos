'use strict';
/* ===== Motor compartido (navegador y servidor): física + bots ===== */
const C = {
  ballR: 10, playerR: 15, postR: 8, goalDepth: 40,
  acc: 0.1, kickAcc: 0.07, pDamp: 0.96, bDamp: 0.99, kickStr: 5, kickRange: 4,
  pBC: 0.5, bBC: 0.5, postBC: 0.5, wallBC: 1, goalTicks: 150, goldenTicks: 3600
};

/* física: "futsal" es la de los mapas de futsal de Bazinga (pelota chica y liviana, jugadores sin rebote);
   "classic" es la de la cancha clásica de HaxBall (se usa en los penales) */
const PHYS = {
  futsal: { acc: 0.11, kickAcc: 0.083, kickStr: 5, playerBC: 0, ballR: 6.25, ballInvMass: 1.5, ballBC: 0.4 },
  classic: { acc: 0.1, kickAcc: 0.07, kickStr: 5, playerBC: 0.5, ballR: 10, ballInvMass: 1, ballBC: 0.5 }
};

const PITCHES = {
  futsal:  { label: 'Futsal Bazinga', W: 368, H: 171, gh: 62, kr: 65, bySize: { 1: { W: 368, H: 171, gh: 62, kr: 65 }, 2: { W: 368, H: 171, gh: 62, kr: 65 }, 3: { W: 550, H: 240, gh: 80, kr: 80 }, 4: { W: 700, H: 320, gh: 90, kr: 80 } } },
  small:   { label: 'Chica',   W: 290, H: 130, gh: 55 },
  classic: { label: 'Clásica', W: 370, H: 170, gh: 64 },
  big:     { label: 'Grande',  W: 520, H: 240, gh: 85 },
  huge:    { label: 'Enorme',  W: 700, H: 320, gh: 110 }
};
const PITCH_LIMITS = { W: [220, 800], H: [100, 380], gh: [40, 130] };

const DIFF = {
  easy:   { key: 'easy',   label: 'Fácil',   think: 18, speed: 0.72, predict: 0,    aimErr: 0.5,   kickTol: 0.85, sloppy: 0.14, gkSkill: 0.35 },
  normal: { key: 'normal', label: 'Normal',  think: 11, speed: 0.86, predict: 0.45, aimErr: 0.22,  kickTol: 0.5,  sloppy: 0.05, gkSkill: 0.65 },
  hard:   { key: 'hard',   label: 'Difícil', think: 5,  speed: 0.96, predict: 0.85, aimErr: 0.08,  kickTol: 0.28, sloppy: 0.01, gkSkill: 0.9 },
  expert: { key: 'expert', label: 'Experto', think: 2,  speed: 1,    predict: 1,    aimErr: 0.015, kickTol: 0.14, sloppy: 0,    gkSkill: 1 },
  impossible: { key: 'impossible', label: 'Imposible', think: 1, speed: 1, kick: 1, v2: true, rt: 11, predict: 1, aimErr: 0, kickTol: 0.06, sloppy: 0, gkSkill: 1, smart: true, press: true, attack: true, guard: false, aim: true, wall: true, sure: true, engage: true, cover: true, clear: true }
};

/* Posiciones de saque para el equipo de la izquierda, en la cancha clásica */
const FORM = { 1: [[170, 0]], 2: [[140, -50], [270, 50]], 3: [[140, 0], [240, -100], [330, 0]] };
const BOT_NAMES = [['Tano', 'Beto', 'Nacho', 'Gero'], ['Luca', 'Pipa', 'Tito', 'Lolo']];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);

function makeGeo(p) {
  p = p || PITCHES.classic;
  const W = clamp(Math.round(+p.W || 370), PITCH_LIMITS.W[0], PITCH_LIMITS.W[1]);
  const H = clamp(Math.round(+p.H || 170), PITCH_LIMITS.H[0], PITCH_LIMITS.H[1]);
  const gh = clamp(Math.round(+p.gh || 64), PITCH_LIMITS.gh[0], Math.min(PITCH_LIMITS.gh[1], H - 25));
  const d = C.goalDepth;
  const geo = {
    W, H, gh, d, boxW: W + 50, boxH: H + 30,
    kr: p.kr ? clamp(Math.round(+p.kr), 30, 130) : clamp(Math.round(H * 0.44), 45, Math.min(125, Math.floor(W * 0.32))),
    kx: W / 370, ky: H / 170, segs: []
  };
  const s = geo.segs;
  s.push([-W, -H, W, -H], [-W, H, W, H]);
  for (const sx of [-1, 1]) {
    s.push([sx * W, -H, sx * W, -gh], [sx * W, gh, sx * W, H]);
    s.push([sx * W, -gh, sx * (W + d), -gh], [sx * W, gh, sx * (W + d), gh], [sx * (W + d), -gh, sx * (W + d), gh]);
  }
  return geo;
}

function mkDisc(x, y, r, invMass, bCoef) {
  return { x, y, px: x, py: y, vx: 0, vy: 0, r, invMass, bCoef };
}

function defaultRoster(cfg) {
  const roster = [];
  for (let team = 0; team < 2; team++) {
    for (let i = 0; i < cfg.size; i++) {
      roster.push({ team, human: team === cfg.humanTeam && i === 0, name: team === cfg.humanTeam && i === 0 ? 'Vos' : null });
    }
  }
  return roster;
}

/*
 cfg: { size, diff, humanTeam, timeLimit (min), scoreLimit, pitch:{W,H,gh}, allowDraw,
        roster?:[{team,human,name,diff}], teamNames?:[a,b], kits?, ... }
*/
function createGame(cfg) {
  const geo = makeGeo(cfg.pitch);
  const G = {
    cfg, geo, phys: PHYS[cfg.physics] || PHYS.futsal, kits: cfg.kits || null, players: [], ball: null, posts: [], nTeam: [0, 0],
    score: [0, 0], tick: 0, playTicks: 0, phase: 'kickoff', kickTeam: 0,
    goalTimer: 0, lastGoalTeam: -1, lastTouch: null, tied: false, overtime: false, otTicks: 0, manual: !!cfg.manual, over: false,
    winner: -1, pendingEnd: false, banner: null, events: [], humanTeam: cfg.humanTeam
  };
  G.ball = mkDisc(0, 0, G.phys.ballR, G.phys.ballInvMass, G.phys.ballBC);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    G.posts.push(mkDisc(sx * geo.W, sy * geo.gh, C.postR, 0, C.postBC));
  }
  const roster = cfg.roster || defaultRoster(cfg);
  for (const r of roster) {
    const team = r.team, idx = G.nTeam[team]++;
    const p = mkDisc(0, 0, C.playerR, 0.5, G.phys.playerBC);
    p.acc0 = G.phys.acc; p.kacc0 = G.phys.kickAcc;
    p.team = team; p.idx = idx; p.human = !!r.human; p.me = false;
    p.name = r.name || BOT_NAMES[team][idx % BOT_NAMES[team].length];
    p.in = { dx: 0, dy: 0, kick: false };
    p.armed = true; p.flash = 0;
    const dk = r.diff || (cfg.diffTeams ? cfg.diffTeams[team] : cfg.diff);
    p.diff = DIFF[dk] || DIFF.normal;
    p.ai = { next: 0, tx: 0, ty: 0, kick: false, precise: false, chaser: false };
    G.players.push(p);
  }
  resetKickoff(G, 0);
  return G;
}

function formPos(G, p) {
  const n = clamp(G.nTeam[p.team], 1, 3), g = G.geo;
  const f = FORM[n][Math.min(p.idx, n - 1)];
  const x = Math.max(f[0] * g.kx, g.kr + C.playerR + 12);
  return [(p.team === 0 ? -1 : 1) * Math.min(x, g.W - 30), f[1] * g.ky];
}

function resetKickoff(G, kickTeam) {
  G.phase = 'kickoff'; G.kickTeam = kickTeam; G.lastTouch = null;
  const b = G.ball; b.x = b.px = 0; b.y = b.py = 0; b.vx = b.vy = 0;
  for (const p of G.players) {
    const f = formPos(G, p);
    p.x = p.px = f[0]; p.y = p.py = f[1];
    p.vx = p.vy = 0; p.armed = true; p.flash = 0;
    p.ai.next = 0; p.ai.kick = false;
  }
}

function ev(G, t) { if (G.events.length < 64) G.events.push(t); }

/* pedir la pelota: los compañeros de la máquina buscan pasársela al que la pidió (dura 2 segundos) */
function callForBall(G, p) {
  if (!p || G.nTeam[p.team] < 2) return false;
  G.call = { p, until: G.tick + 120 };
  return true;
}
function callerFor(G, p) {
  const c = G.call;
  if (!c || G.tick > c.until || c.p === p || c.p.team !== p.team) return null;
  return c.p;
}

function touchBall(G, p) {
  G.lastTouch = p;
  if (G.call && (G.call.p === p || G.call.p.team !== p.team)) G.call = null;
  if (G.phase === 'kickoff') G.phase = 'play';
}

function discDisc(a, b) {
  let dx = b.x - a.x, dy = b.y - a.y;
  const rr = a.r + b.r, d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr) return 0;
  let d = Math.sqrt(d2);
  if (d === 0) { dx = 1; dy = 0; d = 1; }
  const nx = dx / d, ny = dy / d, im = a.invMass + b.invMass;
  if (im === 0) return 0;
  const pen = rr - d;
  a.x -= nx * pen * a.invMass / im; a.y -= ny * pen * a.invMass / im;
  b.x += nx * pen * b.invMass / im; b.y += ny * pen * b.invMass / im;
  const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (vn < 0) {
    const j = -(1 + a.bCoef * b.bCoef) * vn / im;
    a.vx -= nx * j * a.invMass; a.vy -= ny * j * a.invMass;
    b.vx += nx * j * b.invMass; b.vy += ny * j * b.invMass;
  }
  return Math.max(0, -vn) + 0.0001;
}

function collideSeg(d, s) {
  const ax = s[0], ay = s[1], bx = s[2], by = s[3];
  const abx = bx - ax, aby = by - ay;
  const t = clamp(((d.x - ax) * abx + (d.y - ay) * aby) / (abx * abx + aby * aby), 0, 1);
  const dx = d.x - (ax + abx * t), dy = d.y - (ay + aby * t);
  const dist = Math.hypot(dx, dy);
  if (dist >= d.r || dist === 0) return 0;
  const nx = dx / dist, ny = dy / dist;
  d.x += nx * (d.r - dist); d.y += ny * (d.r - dist);
  const vn = d.vx * nx + d.vy * ny;
  if (vn < 0) {
    const j = -(1 + d.bCoef * C.wallBC) * vn;
    d.vx += nx * j; d.vy += ny * j;
    return -vn;
  }
  return 0;
}

/* Si en este tick la pelota atravesó una pared (empujada por un jugador o muy rápida), vuelve del lado de adentro */
function uncross(d, x0, y0, s) {
  const ax = s[0], ay = s[1], ex = s[2] - ax, ey = s[3] - ay;
  const s0 = ex * (y0 - ay) - ey * (x0 - ax), s1 = ex * (d.y - ay) - ey * (d.x - ax);
  if (s0 === 0 || (s0 > 0) === (s1 > 0)) return;
  const t = s0 / (s0 - s1), ix = x0 + (d.x - x0) * t, iy = y0 + (d.y - y0) * t;
  const L = Math.hypot(ex, ey), u = ((ix - ax) * ex + (iy - ay) * ey) / (L * L);
  if (u < 0 || u > 1) return;
  let nx = -ey / L, ny = ex / L; if (s0 < 0) { nx = -nx; ny = -ny; }
  d.x = ix + nx * d.r; d.y = iy + ny * d.r;
  const vn = d.vx * nx + d.vy * ny; if (vn < 0) { d.vx -= nx * vn * (1 + d.bCoef * C.wallBC); d.vy -= ny * vn * (1 + d.bCoef * C.wallBC); }
}

/* Límites de movimiento de un jugador (los usa step() y la predicción del cliente) */
function clampPlayerBox(geo, p) {
  const bx = geo.boxW - C.playerR, by = geo.boxH - C.playerR;
  if (p.x > bx) { p.x = bx; if (p.vx > 0) p.vx *= -0.1; }
  if (p.x < -bx) { p.x = -bx; if (p.vx < 0) p.vx *= -0.1; }
  if (p.y > by) { p.y = by; if (p.vy > 0) p.vy *= -0.1; }
  if (p.y < -by) { p.y = -by; if (p.vy < 0) p.vy *= -0.1; }
}

function kickoffLimit(G, p) {
  if (p.team === 0 && p.x > -p.r) { p.x = -p.r; if (p.vx > 0) p.vx = 0; }
  if (p.team === 1 && p.x < p.r) { p.x = p.r; if (p.vx < 0) p.vx = 0; }
  if (p.team !== G.kickTeam) {
    const d = Math.hypot(p.x, p.y), lim = G.geo.kr + p.r;
    if (d < lim) {
      if (d < 0.001) { p.x = (p.team === 0 ? -1 : 1) * lim; p.y = 0; }
      else {
        const k = lim / d, ux = p.x / d, uy = p.y / d;
        p.x *= k; p.y *= k;
        const vr = p.vx * ux + p.vy * uy;
        if (vr < 0) { p.vx -= vr * ux; p.vy -= vr * uy; }
      }
    }
  }
}

function step(G) {
  if (G.over) return;
  G.tick++;
  const ball = G.ball, P = G.players, geo = G.geo;
  if (!G.manual) for (const p of P) if (!p.human) aiUpdate(G, p);

  ball.px = ball.x; ball.py = ball.y;
  for (const p of P) {
    p.px = p.x; p.py = p.y;
    if (p.flash > 0) p.flash--;
    const inp = p.in;
    let dx = inp.dx, dy = inp.dy;
    const m = Math.hypot(dx, dy);
    if (m > 1) { dx /= m; dy /= m; }
    const a = (inp.kick ? p.kacc0 : p.acc0) * (p.human ? 1 : p.diff.speed) * (p.accMul || 1);
    p.vx += dx * a; p.vy += dy * a;
    if (inp.kick && !p.noKick && !p.noBall) {
      if (p.armed) {
        const ddx = ball.x - p.x, ddy = ball.y - p.y, d = Math.hypot(ddx, ddy);
        if (d > 0 && d - p.r - ball.r < C.kickRange) {
          const ks = G.phys.kickStr * (p.human ? 1 : (p.diff.kick || 1));
          ball.vx += ddx / d * ks * ball.invMass;
          ball.vy += ddy / d * ks * ball.invMass;
          p.armed = false; p.flash = 10;
          touchBall(G, p); ev(G, 'kick');
        }
      }
    } else p.armed = true;
  }

  for (const p of P) { p.x += p.vx; p.y += p.vy; }
  const bx0 = ball.x, by0 = ball.y;
  ball.x += ball.vx; ball.y += ball.vy;

  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) discDisc(P[i], P[j]);
  for (const p of P) if (!p.noBall && discDisc(p, ball)) touchBall(G, p);
  for (const post of G.posts) {
    for (const p of P) discDisc(post, p);
    if (discDisc(post, ball) > 1.5) ev(G, 'wall');
  }
  for (const s of geo.segs) uncross(ball, bx0, by0, s);
  for (const s of geo.segs) if (collideSeg(ball, s) > 2.5) ev(G, 'wall');

  for (const p of P) clampPlayerBox(geo, p);
  if (G.phase === 'kickoff') for (const p of P) kickoffLimit(G, p);

  for (const p of P) { const dm = p.damp || C.pDamp; p.vx *= dm; p.vy *= dm; }
  ball.vx *= C.bDamp; ball.vy *= C.bDamp;

  if (G.banner && G.banner.t > 0) G.banner.t--;

  if (G.phase === 'play') {
    G.playTicks++;
    if (ball.x < -geo.W) goal(G, 1);
    else if (ball.x > geo.W) goal(G, 0);
    else if (G.cfg.timeLimit > 0 && !G.overtime && G.playTicks >= G.cfg.timeLimit * 3600) {
      const tt = totals(G);
      if (tt[0] !== tt[1] || G.cfg.allowDraw) finish(G);   // la fase de grupos admite empates; en una vuelta cuenta el global
      else {
        /* empate en un partido que no admite empate: gol de oro de 1 minuto */
        G.overtime = true; G.otTicks = 0;
        G.banner = { text: 'Gol de oro', sub: '1 minuto · el próximo gol gana', team: -1, t: 150 };
        ev(G, 'overtime');
      }
    } else if (G.overtime && ++G.otTicks >= C.goldenTicks) {
      /* nadie convirtió: se define por penales (lo resuelve la interfaz) */
      G.tied = true;
      finish(G);
    }
  } else if (G.phase === 'goal') {
    G.goalTimer--;
    if (G.goalTimer <= 0) {
      if (G.pendingEnd) finish(G);
      else resetKickoff(G, 1 - G.lastGoalTeam);
    }
  }
}

function teamName(G, t) {
  return (G.cfg.teamNames && G.cfg.teamNames[t]) || (t === 0 ? 'Rojo' : 'Azul');
}

function goal(G, team) {
  G.score[team]++;
  G.phase = 'goal'; G.goalTimer = C.goalTicks; G.lastGoalTeam = team;
  const sc = G.lastTouch, own = !!sc && sc.team !== team;
  G.banner = {
    text: '¡GOL!', team,
    sub: teamName(G, team) + (sc ? ' · ' + sc.name : '') + (own ? ' (en contra)' : ''),
    t: C.goalTicks
  };
  const lim = G.cfg.scoreLimit;
  G.pendingEnd = (lim > 0 && G.score[team] >= lim) || G.overtime;
  ev(G, 'goal');
}

/* goles que definen: el resultado del partido, más los de la ida si es una vuelta (cfg.agg) */
function totals(G) {
  const a = G.cfg.agg;
  return a ? [G.score[0] + a[0], G.score[1] + a[1]] : G.score;
}

function finish(G) {
  G.over = true;
  const tt = totals(G);
  G.winner = tt[0] === tt[1] ? -1 : (tt[0] > tt[1] ? 0 : 1);
  ev(G, 'end');
}

/* ===== Bots ===== */
function predictBall(G, steps) {
  const b = G.ball, g = G.geo, bc = b.bCoef * C.wallBC;
  let x = b.x, y = b.y, vx = b.vx, vy = b.vy;
  const H = g.H - b.r, W = g.W - b.r, mouth = g.gh - b.r;
  for (let i = 0; i < steps; i++) {
    x += vx; y += vy; vx *= C.bDamp; vy *= C.bDamp;
    if (y > H) { y = H; vy = -vy * bc; } else if (y < -H) { y = -H; vy = -vy * bc; }
    if (Math.abs(y) > mouth) {
      if (x > W) { x = W; vx = -vx * bc; } else if (x < -W) { x = -W; vx = -vx * bc; }
    }
  }
  return { x, y };
}

function predictCross(G, ownX, dir) {
  const b = G.ball, g = G.geo, bc = b.bCoef * C.wallBC;
  if (b.vx * dir > -0.3) return null;
  let x = b.x, y = b.y, vx = b.vx, vy = b.vy;
  const H = g.H - b.r;
  const horizon = clamp(Math.ceil(Math.abs(b.x - ownX) / Math.max(0.3, Math.abs(b.vx)) * 1.6) + 10, 30, 500);
  for (let i = 0; i < horizon; i++) {
    x += vx; y += vy; vx *= C.bDamp; vy *= C.bDamp;
    if (y > H) { y = H; vy = -vy * bc; } else if (y < -H) { y = -H; vy = -vy * bc; }
    if ((x - ownX) * dir < 0) return Math.abs(y) < g.gh + 6 ? { t: i, y } : null;
  }
  return null;
}

function aiUpdate(G, p) {
  const A = p.ai, D = p.diff;
  if (D.smart) return smTick(G, p);
  if (G.phase === 'goal') { p.in.dx = p.in.dy = 0; p.in.kick = false; return; }
  if (G.tick >= A.next) {
    aiDecide(G, p);
    A.next = G.tick + D.think + (Math.random() < 0.35 ? Math.floor(Math.random() * D.think * 0.6) : 0);
  }
  let dx = A.tx - p.x, dy = A.ty - p.y;
  const d = Math.hypot(dx, dy);
  if (d < 3) { dx = dy = 0; }
  else {
    const m = A.precise ? Math.min(1, d / 40) : 1;
    dx = dx / d * m; dy = dy / d * m;
    if (A.precise) { dx -= p.vx * 0.5; dy -= p.vy * 0.5; }
  }
  p.in.dx = dx; p.in.dy = dy; p.in.kick = A.kick;
  /* pase pedido: se decide en cada tick, para patear justo cuando la pelota sale hacia el compañero */
  const caller = A.chaser ? callerFor(G, p) : null;
  if (caller) {
    const b = G.ball, bd = Math.hypot(b.x - p.x, b.y - p.y) || 1;
    /* ponerse detrás de la pelota en la línea del pase y salir derecho */
    let sx = caller.x + caller.vx * 12 - b.x, sy = caller.y + caller.vy * 12 - b.y; const sl = Math.hypot(sx, sy) || 1; sx /= sl; sy /= sl;
    const R2 = p.r + b.r, al = (p.x - b.x) * sx + (p.y - b.y) * sy, la = (p.x - b.x) * -sy + (p.y - b.y) * sx;
    let gx, gy;
    if (al < -R2 * 0.6 && Math.abs(la) < 6) { gx = b.x; gy = b.y; }
    else if (al < -R2 * 0.6) { gx = b.x - sx * (R2 + 6); gy = b.y - sy * (R2 + 6); }
    else { const sd = la >= 0 ? 1 : -1; gx = b.x - sx * (R2 + 16) - sy * sd * (R2 + 14); gy = b.y - sy * (R2 + 16) + sx * sd * (R2 + 14); }
    let mx = gx - p.x, my = gy - p.y; const ml = Math.hypot(mx, my) || 1;
    p.in.dx = mx / ml - p.vx * 0.15; p.in.dy = my / ml - p.vy * 0.15;
    const ux = (b.x - p.x) / bd, uy = (b.y - p.y) / bd;
    let tx = caller.x + caller.vx * 12 - b.x, ty = caller.y + caller.vy * 12 - b.y; const tl = Math.hypot(tx, ty) || 1;
    const ang = Math.acos(clamp((ux * tx + uy * ty) / tl, -1, 1));
    p.in.kick = bd - p.r - b.r < C.kickRange + 1 && ang < 0.09 + D.aimErr * 0.05;
  }
}

function aiDecide(G, p) {
  const A = p.ai, D = p.diff, ball = G.ball, g = G.geo;
  const dir = p.team === 0 ? 1 : -1, W = g.W, H = g.H, gh = g.gh, kx = g.kx, ky = g.ky;
  const ownX = -dir * W, oppX = dir * W;
  A.kick = false; A.precise = false;

  const mates = G.players.filter(q => q.team === p.team);
  /* con 3 o más, el último hombre cuida el arco y sólo sale si la pelota está encima */
  let lastMan = null;
  const incoming = ball.vx * dir < -1.8;
  if (mates.length >= 3 && (Math.abs(ball.x - ownX) > 140 * kx || incoming)) {
    lastMan = mates.reduce((a, b) => (dir * b.x < dir * a.x ? b : a));
  }
  let chaser = mates[0] === lastMan ? mates[1] : mates[0], best = 1e9;
  for (const q of mates) {
    if (q === lastMan) continue;
    const s = Math.hypot(ball.x - q.x, ball.y - q.y) - (q.ai.chaser ? 22 : 0);
    if (s < best) { best = s; chaser = q; }
  }
  for (const q of mates) q.ai.chaser = q === chaser;

  let role = 'chase';
  if (chaser !== p) {
    const others = mates.filter(q => q !== chaser).sort((a, b) => dir * a.x - dir * b.x);
    role = others.length === 1 ? 'defend' : (others[0] === p ? 'keeper' : 'support');
  }

  if (role === 'keeper') {
    A.precise = true;
    let gy = clamp(ball.y * 0.4, -gh * 0.81, gh * 0.81);
    const cr = predictCross(G, ownX, dir);
    if (cr && Math.random() < D.gkSkill) gy = clamp(cr.y, -gh * 0.88, gh * 0.88);
    A.tx = ownX + dir * (30 * Math.sqrt(kx) + (1 - D.gkSkill) * 20); A.ty = gy;
    return;
  }
  if (role === 'defend') {
    A.precise = true;
    let tx = ownX + (ball.x - ownX) * 0.42;
    if (dir * tx > -40 * kx) tx = -dir * 40 * kx;
    A.tx = tx; A.ty = clamp(ball.y * 0.42, -H * 0.7, H * 0.7);
    return;
  }
  if (role === 'support') {
    A.precise = true;
    A.tx = clamp(ball.x + dir * 110 * kx, -(W - 40), W - 40);
    A.ty = clamp(ball.y > 0 ? ball.y - 95 * ky : ball.y + 95 * ky, -H * 0.82, H * 0.82);
    return;
  }

  /* jugador solo: si viene un tiro al arco, vuelve a taparlo */
  if (mates.length === 1 && incoming) {
    const cr = predictCross(G, ownX, dir);
    if (cr && Math.random() < D.gkSkill) {
      A.precise = true;
      A.tx = ownX + dir * 30 * Math.sqrt(kx); A.ty = clamp(cr.y, -gh * 0.88, gh * 0.88);
      return;
    }
  }

  /* chaser */
  const dist = Math.hypot(ball.x - p.x, ball.y - p.y);
  const look = Math.round(D.predict * clamp(dist / 2, 0, 50));
  const bp = look > 0 ? predictBall(G, look) : { x: ball.x, y: ball.y };

  let gk = null, gd = 1e9;
  for (const q of G.players) {
    if (q.team === p.team) continue;
    const dd = Math.abs(q.x - oppX);
    if (dd < gd) { gd = dd; gk = q; }
  }
  let aimY = gk && gd < 140 * kx ? (gk.y > 0 ? -gh * 0.66 : gh * 0.66) : (ball.y > 0 ? -gh * 0.55 : gh * 0.55);
  aimY += rnd(-1, 1) * D.aimErr * gh * 2.2;
  const caller = callerFor(G, p);
  let aimX = oppX;
  if (caller) { aimX = caller.x + caller.vx * 12; aimY = caller.y + caller.vy * 12; }   // me la pidieron: apuntar al compañero
  let sx = aimX - bp.x, sy = aimY - bp.y;
  const sl = Math.hypot(sx, sy) || 1; sx /= sl; sy /= sl;
  const nx = -sy, ny = sx;

  const qx = p.x - bp.x, qy = p.y - bp.y;
  const a = qx * sx + qy * sy, l = qx * nx + qy * ny;
  const R = ball.r + p.r;
  let tx, ty;
  if (a < 0) {
    if (caller ? Math.abs(l) < 8 : (Math.abs(l) < 18 + (-a) * 0.12 || dist < R + 25)) { tx = bp.x; ty = bp.y; }   // para el pase hay que estar bien alineado
    else { const back = 30 + clamp(-a * 0.15, 0, 40); tx = bp.x - sx * back; ty = bp.y - sy * back; }
  } else {
    let side = l >= 0 ? 1 : -1;
    if (Math.abs(l) < 8) {
      const y1 = bp.y - sy * 45 + ny * 70, y2 = bp.y - sy * 45 - ny * 70;
      side = Math.abs(y1) <= Math.abs(y2) ? 1 : -1;
    }
    tx = bp.x - sx * 45 + nx * side * 70; ty = bp.y - sy * 45 + ny * side * 70;
  }
  A.tx = clamp(tx, -g.boxW + 20, g.boxW - 20);
  A.ty = clamp(ty, -g.boxH + 20, g.boxH - 20);

  /* patear */
  const range = dist - R;
  if (range < 12) {
    const ux = (ball.x - p.x) / (dist || 1), uy = (ball.y - p.y) / (dist || 1);
    const ang = Math.acos(clamp(ux * sx + uy * sy, -1, 1));
    const toGoal = Math.abs(oppX - ball.x);
    const allowed = toGoal < 380 * kx || ball.x * dir < -20;
    const safe = !!caller || !(ux * dir < -0.4 && ball.x * dir < -W * 0.54 && Math.abs(ball.y) < H * 0.65);
    let pressed = false;
    for (const q of G.players) {
      if (q.team !== p.team && Math.hypot(q.x - p.x, q.y - p.y) < 36) { pressed = true; break; }
    }
    const good = caller ? ang < 0.09 + D.aimErr * 0.05 : ((allowed && ang < D.kickTol) || (pressed && ang < 1.2));
    A.kick = (safe && good) || Math.random() < D.sloppy;
  }
}

/* ===== Bot "Imposible" =====
   Juega "pensando" cada acción antes de hacerla:
   - predice el recorrido de la pelota (con rebotes) y calcula cuántos ticks tarda cada jugador en llegar;
   - con la pelota, evalúa muchas acciones simulándolas: tiros al arco (directos y de rebote), pases a cada
     compañero (directos y por la pared), pases al espacio para sí mismo (para eludir) y seguir conduciendo.
     Cada acción vale según la chance de gol o de que la pelota la vuelva a tomar su equipo y en qué lugar;
   - sin la pelota, se desmarca a un lugar libre adelante para recibir;
   - si el rival tiene la pelota, se para entre la pelota y su arco, marca al rival libre y tapa los tiros
     yendo al punto del recorrido que alcanza primero.
   En cada tick, si tiene la pelota al alcance, compara patear ahora contra seguir con su plan. */

const SM = { tables: {}, inv: {}, BPx: new Float64Array(181), BPy: new Float64Array(181), BPvx: new Float64Array(181), BPvy: new Float64Array(181),
  SPx: new Float64Array(181), SPy: new Float64Array(181), pw: null };
(function () { SM.pw = new Float64Array(401); let v = 1; for (let n = 0; n <= 400; n++) { SM.pw[n] = v; v *= C.pDamp; } })();
const SM_SHOT = 600;     // lo que vale un gol en la escala de las acciones

function smAcc(p) { return (p.acc0 || C.acc) * (p.human ? 1 : p.diff.speed) * (p.accMul || 1); }
/* tabla: distancia recorrida desde parado en n ticks, y su inversa (distancia -> ticks) */
function smTable(a) {
  const key = a.toFixed(5);
  if (SM.tables[key]) return SM.tables[key];
  const t = new Float64Array(401); let v = 0, s = 0;
  for (let n = 1; n <= 400; n++) { v = (v + a) * C.pDamp; s += v; t[n] = s; }
  const inv = new Uint16Array(2001); let n = 0;
  for (let d = 0; d <= 2000; d++) { while (n < 400 && t[n] < d) n++; inv[d] = n; }
  SM.inv[key] = inv;
  return (SM.tables[key] = t);
}
/* ticks que tarda q en quedar a "near" de (x, y), teniendo en cuenta su velocidad actual */
function smReach(q, x, y, near) {
  const dx = x - q.x, dy = y - q.y, full = Math.hypot(dx, dy), d = full - near;
  if (d <= 0) return 0;
  const ux = dx / full, uy = dy / full, a = smAcc(q);
  const v0 = q.vx * ux + q.vy * uy, lat = Math.abs(q.vx * uy - q.vy * ux);
  const key = a.toFixed(5); if (!SM.inv[key]) smTable(a);
  const inv = SM.inv[key], k = C.pDamp / (1 - C.pDamp);
  let n = inv[Math.min(2000, Math.ceil(d))];
  const d2 = d - v0 * k * (1 - SM.pw[Math.min(400, n)]);
  n = d2 <= 0 ? Math.max(0, Math.round(d / Math.max(0.5, v0))) : inv[Math.min(2000, Math.ceil(d2))];
  return n + lat / a * 0.45;
}

/* recorrido de la pelota: llena xs/ys(/vxs/vys) hasta n ticks; devuelve el equipo que hace el gol (o -1) y en qué tick */
function smSim(G, x, y, vx, vy, n, xs, ys, vxs, vys) {
  const bc = G.ball.bCoef * C.wallBC, g = G.geo, r = G.ball.r, H = g.H - r, W = g.W - r, mouth = g.gh - r;
  xs[0] = x; ys[0] = y; if (vxs) { vxs[0] = vx; vys[0] = vy; }
  for (let i = 1; i <= n; i++) {
    x += vx; y += vy;
    if (y > H) { y = H; vy = -vy * bc; } else if (y < -H) { y = -H; vy = -vy * bc; }
    if (Math.abs(y) > mouth) {
      if (x > W) { x = W; vx = -vx * bc; } else if (x < -W) { x = -W; vx = -vx * bc; }
    } else if (x > g.W) { xs[i] = x; ys[i] = y; return { goal: 0, t: i, n: i }; }
    else if (x < -g.W) { xs[i] = x; ys[i] = y; return { goal: 1, t: i, n: i }; }
    vx *= C.bDamp; vy *= C.bDamp;
    xs[i] = x; ys[i] = y; if (vxs) { vxs[i] = vx; vys[i] = vy; }
  }
  return { goal: -1, t: -1, n };
}

/* el primer tick en que q alcanza la pelota que sigue el recorrido BP */
function smIntercept(G, q, n) {
  const near = q.r + G.ball.r;
  for (let t = 0; t <= n; t++) if (smReach(q, SM.BPx[t], SM.BPy[t], near) <= t) return t;
  return n + smReach(q, SM.BPx[n], SM.BPy[n], near);
}

const smSig = x => 1 / (1 + Math.exp(-x));
/* valor de tener la pelota en (x, y) para el equipo "team", y peligro de perderla ahí */
function smPos(G, team, x, y) {
  const g = G.geo, dir = team === 0 ? 1 : -1, prog = clamp((x * dir + g.W) / (2 * g.W), 0, 1);
  return 30 + 170 * Math.pow(prog, 1.5) + (prog > 0.6 ? 70 * (prog - 0.6) / 0.4 * (1 - Math.min(1, Math.abs(y) / g.H)) : 0);
}
/* dónde pararse para tapar el arco desde la pelota en (px, py): prueba puntos alrededor de la pelota y elige el que deja menos hueco (sirve para ángulos cerrados),
   que llegue a tiempo y que quede adentro de la cancha */
function smCover(G, p, px, py, tp) {
  const g = G.geo, dir = p.team === 0 ? 1 : -1, ownX = -dir * g.W, R = p.r + G.ball.r;
  const dx = ownX - px, sx = dx >= 0 ? 1 : -1, adx = Math.abs(dx);
  if (adx < 8) return null;
  const yEff = g.gh - 8 - G.ball.r + 1;
  const f1 = Math.atan2(-yEff - py, adx), f2 = Math.atan2(yEff - py, adx), D = Math.hypot(adx, py);
  let best = null, bc = 1e9;
  for (const d of [R + 1, R + 8, R + 18, R + 32, R + 50, R + 75]) {
    const hw = Math.asin(Math.min(1, R / d));
    for (let i = -6; i <= 6; i++) {
      const f = (f1 + f2) / 2 + i * Math.max(0.05, (f2 - f1) / 7);
      const cx = px + sx * d * Math.cos(f), cy = py + d * Math.sin(f);
      if (Math.abs(cx) > g.W - p.r - 2 || Math.abs(cy) > g.H - p.r) continue;
      const ov = Math.max(0, Math.min(f2, f + hw) - Math.max(f1, f - hw)), gap = Math.max(0, f2 - f1 - ov) * D;
      const late = Math.max(0, smReach(p, cx, cy, 3) - (tp + 6));
      const c = gap + late * 5 + 0.05 * Math.abs(d - (R + 8));
      if (c < bc) { bc = c; best = { x: cx, y: cy, gap }; }
    }
  }
  return best;
}
function smDanger(G, team, x, y) {
  const g = G.geo, dir = team === 0 ? 1 : -1, back = clamp((g.W - x * dir) / (2 * g.W), 0, 1);
  return 25 + 230 * back * back * (1 - 0.4 * Math.min(1, Math.abs(y) / g.H));
}

/* valor de patear la pelota desde (bx, by) con velocidad (vx, vy): gol, pase, pase al espacio o pérdida */
/* ticks que tarda un rival humano en reaccionar a una patada nueva (la máquina lo tiene en cuenta en Imposible) */
const smLag = (p, q) => (p.diff.v2 && (q.human || q.diff.slow) ? p.diff.rt || 0 : 0);

function smEval(G, p, bx, by, vx, vy) {
  const team = p.team, br = G.ball.r;
  const res = smSim(G, bx, by, vx, vy, 160, SM.SPx, SM.SPy);
  if (res.goal === 1 - team) return { v: -2000, kind: 'own' };
  const n = res.goal >= 0 ? res.t : res.n;
  if (p.diff.v2) {
    /* nunca mandarla cerca de mi arco (los palos pueden meterla aunque la simulación diga que pega afuera) */
    const ox = team === 0 ? -G.geo.W : G.geo.W, rad = Math.min(G.geo.gh + 34, Math.hypot(bx - ox, by) - 6);   // si ya está encima del arco: que al menos se aleje
    const d1 = Math.hypot(SM.SPx[1] - ox, SM.SPy[1]);
    for (let k = 1; k <= n; k += 2) { const dk = Math.hypot(SM.SPx[k] - ox, SM.SPy[k]); if (dk < rad && !(p.diff.clear && dk > d1 - 3)) return { v: -900, kind: 'own' }; }   // clear: si la pelota se aleja del arco, se puede despejar
  }
  /* cuerpos en el camino en los primeros ticks (la simulación de la pelota no ve a los jugadores) */
  for (let k = 2; k <= Math.min(14, n); k++) {
    for (const q of G.players) {
      const qx = q.x + q.vx * k * 0.6, qy = q.y + q.vy * k * 0.6;
      if (Math.hypot(SM.SPx[k] - qx, SM.SPy[k] - qy) < q.r + br - 1) {
        if (q === p) return { v: -300, kind: 'blocked' };                       // se la tira encima (contra la pared)
        if (q.team !== team) return { v: -0.6 * smDanger(G, team, SM.SPx[k], SM.SPy[k]), kind: 'blocked' };
      }
    }
  }
  if (res.goal === team) {
    /* tiro: cuánto margen le queda al rival que mejor lo corta */
    let m = 99;
    for (const q of G.players) {
      if (q.team === team) continue;
      const near = q.r + br - 3;
      const lag = smLag(p, q) * (p.diff.sure ? 0.45 : 1);   // en el tiro no contar con que el arquero reaccione tarde: tirar solo si entra igual
      for (let k = 2; k <= n; k += 2) { const mk = smReach(q, SM.SPx[k], SM.SPy[k], near) + lag - k; if (mk < m) m = mk; }
    }
    const pg = smSig((m + 1.5) / 2.2);
    return { v: pg * SM_SHOT + (1 - pg) * 35, kind: 'shot', pg, m };   // un tiro atajado igual suele dejar rebote o córner
  }
  /* pase o pelota al espacio: quién la toma primero y con cuánta ventaja */
  for (let k = 3; k <= n; k += 2) {
    const x = SM.SPx[k], y = SM.SPy[k];
    let tUs = 1e9, tThem = 1e9, who = null;
    for (const q of G.players) {
      const t = smReach(q, x, y, q.r + br - 2) + (q === p ? 6 : 0) + (q.team !== team ? smLag(p, q) : 0);
      if (q.team === team) { if (t < tUs) { tUs = t; who = q; } } else if (t < tThem) tThem = t;
    }
    if (Math.min(tUs, tThem) <= k || k >= n - 1) {
      const ps = smSig((tThem - tUs) / 3);
      let close = 1e9;
      if (who && who !== p && G.call && G.call.p === who) {
        /* qué tan cerca le pasa la pelota al que la pidió (pase al pie) */
        for (let j = 1; j <= n; j += 2) close = Math.min(close, Math.hypot(SM.SPx[j] - who.x - who.vx * j * 0.5, SM.SPy[j] - who.y - who.vy * j * 0.5));
      }
      return { v: ps * smPos(G, team, x, y) - (1 - ps) * smDanger(G, team, x, y), kind: who === p ? 'space' : 'pass', ps, x, y, who, close };
    }
  }
  return { v: 0, kind: 'none' };
}

/* valor de seguir con la pelota (conducir) desde donde está */
function smHold(G, p, x, y, t0) {
  let tThem = 1e9;
  for (const q of G.players) if (q.team !== p.team) tThem = Math.min(tThem, smReach(q, x, y, q.r + G.ball.r) - t0);
  const ps = smSig((tThem - 7) / 3), dir = p.team === 0 ? 1 : -1;
  const room = clamp((G.geo.W - x * dir) / 150, 0, 1);      // cerca del arco rival ya no hay adónde conducir
  /* si hay un rival plantado adelante, conducir no lleva a ningún lado: conviene pasarla, tirarla al espacio o rematar */
  let wall = 1;
  for (const q of G.players) {
    if (q.team === p.team) continue;
    const ax = (q.x - x) * dir, ay = Math.abs(q.y - y);
    if (ax > 0 && ax < 150 && ay < 25 + ax * 0.45) wall = Math.min(wall, 0.45 + 0.4 * ax / 150);
  }
  return ps * (smPos(G, p.team, x, y) * (0.75 + 0.25 * room) * wall + 12 * room * wall) - (1 - ps) * smDanger(G, p.team, x, y);
}

/* velocidad de salida para que la pelota vaya en la dirección (dx, dy) sumando el impulso de la patada */
function smSolve(bvx, bvy, dx, dy, ks) {
  const dv = dx * bvx + dy * bvy, disc = dv * dv - (bvx * bvx + bvy * bvy) + ks * ks;
  if (disc < 0) return null;
  const s = dv + Math.sqrt(disc);
  return { s, ux: (s * dx - bvx) / ks, uy: (s * dy - bvy) / ks };
}

function smDecide(G, p) {
  const A = p.ai, D = p.diff, g = G.geo, b = G.ball, W = g.W, H = g.H, gh = g.gh;
  const dir = p.team === 0 ? 1 : -1, ownX = -dir * W, oppX = dir * W, R = p.r + b.r;
  const N = 150;
  const path = smSim(G, b.x, b.y, b.vx, b.vy, N, SM.BPx, SM.BPy, SM.BPvx, SM.BPvy);
  const nb = path.goal >= 0 ? Math.max(1, path.t - 1) : path.n;
  if (path.goal >= 0) for (let i = path.t; i <= N; i++) { SM.BPx[i] = SM.BPx[path.t - 1]; SM.BPy[i] = SM.BPy[path.t - 1]; SM.BPvx[i] = 0; SM.BPvy[i] = 0; }

  const mates = G.players.filter(q => q.team === p.team), opps = G.players.filter(q => q.team !== p.team);
  const tOf = new Map();
  for (const q of G.players) tOf.set(q, smIntercept(G, q, Math.min(N, nb + 30)));
  let tOpp = 1e9, oppFirst = null;
  for (const q of opps) if (tOf.get(q) < tOpp) { tOpp = tOf.get(q); oppFirst = q; }
  let att = mates[0], best = 1e9;
  for (const q of mates) { const s = tOf.get(q) - (q.ai.chaser ? 5 : 0); if (s < best) { best = s; att = q; } }
  for (const q of mates) q.ai.chaser = q === att;
  const tMe = tOf.get(p), ours = tOf.get(att) + 4 <= tOpp;
  const shotOnUs = path.goal === 1 - p.team;
  A.plan = null; A.planV = -1e9;

  const block = () => {
    for (let k = 1; k <= nb; k++) {
      if (D.v2) {
        /* llegar adelante de la pelota (del lado de mi arco): si la toco de atrás la empujo para adentro */
        const vl = Math.hypot(SM.BPvx[k], SM.BPvy[k]) || 1, fx = SM.BPx[k] + SM.BPvx[k] / vl * (R - 2), fy = SM.BPy[k] + SM.BPvy[k] / vl * (R - 2);
        if (smReach(p, fx, fy, 6) <= k) { A.tx = fx; A.ty = fy; A.mode = 'seek'; A.plan = 'block'; return; }
        continue;
      }
      if (smReach(p, SM.BPx[k], SM.BPy[k], R - 4) <= k) { A.tx = SM.BPx[k]; A.ty = SM.BPy[k]; A.mode = 'seek'; return; }
    }
    A.tx = ownX + dir * 18; A.ty = clamp(SM.BPy[nb], -gh + 8, gh - 8); A.mode = 'seek';
  };
  const goalSide = (px, py, dist) => {
    if (D.cover && mates.length === 1 && Math.abs(px - ownX) < 300) {   // solo en 1v1: en equipo el arquero y los marcadores se reparten el arco
      const c = smCover(G, p, px, py, Math.min(tOpp, 60));
      if (c) { A.tx = c.x; A.ty = c.y; A.mode = Math.hypot(c.x - p.x, c.y - p.y) > 45 ? 'seek' : 'arrive'; return; }
    }
    if (D.v2) {
      /* si ya me pasaron (la pelota está más cerca de mi arco que yo) y está cerca del arco: volver a la boca del arco */
      const beaten = (p.x - px) * dir > -8 && Math.abs(px - ownX) < 190;
      if (beaten) {
        A.tx = ownX + dir * 20; A.ty = clamp(py * 0.55, -gh + 12, gh - 12); A.mode = 'seek';
        return;
      }
      /* bisectriz del ángulo pelota-palos: desde ahí el cuerpo tapa el arco entero si está a la distancia justa */
      let a1x = ownX - px, a1y = -gh - py, a2x = ownX - px, a2y = gh - py;
      const l1 = Math.hypot(a1x, a1y) || 1, l2 = Math.hypot(a2x, a2y) || 1;
      a1x /= l1; a1y /= l1; a2x /= l2; a2y /= l2;
      let bx = a1x + a2x, by = a1y + a2y; const bl = Math.hypot(bx, by) || 1; bx /= bl; by /= bl;
      const half = Math.acos(clamp(a1x * a2x + a1y * a2y, -1, 1)) / 2;
      const cover = (p.r + b.r - 3) / Math.tan(Math.max(half, 0.04));
      const toLine = Math.abs((ownX - px) / (bx || 1e-6));
      const dd = clamp(Math.min(cover, dist), 26, Math.max(26, toLine - 18));
      A.tx = px + bx * dd; A.ty = py + by * dd; A.mode = Math.hypot(A.tx - p.x, A.ty - p.y) > 45 ? 'seek' : 'arrive';
      return;
    }
    let gx = ownX - px, gy = -py * 0.85; const gl = Math.hypot(gx, gy) || 1;
    const dd = Math.min(dist, Math.max(0, gl - 22));
    A.tx = px + gx / gl * dd; A.ty = py + gy / gl * dd; A.mode = 'arrive';
  };

  if (p !== att) {
    const others = mates.filter(q => q !== att).sort((a, c) => dir * a.x - dir * c.x);
    const keeper = others[0] === p && (others.length >= 2 || !ours);
    if (shotOnUs && (keeper || others.length === 1)) { block(); return; }
    if (!ours) {
      if (keeper) {
        const tp = Math.min(Math.round(tOpp), nb), px = SM.BPx[tp], py = SM.BPy[tp];
        const far = Math.hypot(px - ownX, py);
        goalSide(px, py, others.length >= 2 ? Math.max(30, far - 34) : clamp(far * 0.55, 30, far - 30));
        return;
      }
      /* el rival tiene la pelota: marcar al rival libre más peligroso, entre él y el arco */
      let mark = null, md = 1e9;
      for (const q of opps) { if (q === oppFirst) continue; const dd = Math.hypot(q.x - ownX, q.y); if (dd < md) { md = dd; mark = q; } }
      if (mark) { const gx = ownX - mark.x, gy = -mark.y, gl = Math.hypot(gx, gy) || 1; A.tx = mark.x + gx / gl * 34; A.ty = mark.y + gy / gl * 34; A.mode = 'arrive'; return; }
      const tp = Math.min(Math.round(tOpp), nb);
      goalSide(SM.BPx[tp], SM.BPy[tp], 90);
      return;
    }
    if (keeper && others.length >= 2) {
      /* en 3v3 uno queda atrás aunque ataquemos, a mitad de camino */
      const px = b.x, py = b.y, far = Math.hypot(px - ownX, py);
      goalSide(px, py, Math.max(60, far * 0.55));
      return;
    }
    /* desmarcarse: buscar un lugar libre y adelantado para recibir */
    let bx = p.x, by = p.y, bv = -1e9;
    for (const fx of [40, 100, 160]) for (const fy of [-150, -80, 0, 80, 150]) {
      const x = clamp(b.x + dir * fx * g.kx, -W + 25, W - 25), y = clamp(b.y + fy * g.ky, -H + 22, H - 22);
      let open = 1e9; for (const q of opps) open = Math.min(open, Math.hypot(q.x - x, q.y - y));
      const nearAtt = Math.hypot(att.x - x, att.y - y);
      const v = smPos(G, p.team, x, y) + 0.7 * Math.min(open, 130) - 0.25 * Math.hypot(p.x - x, p.y - y) - (nearAtt < 60 ? 80 : 0);
      if (v > bv) { bv = v; bx = x; by = y; }
    }
    A.tx = bx; A.ty = by; A.mode = 'arrive';
    return;
  }

  /* saque del rival: pararse en la línea pelota-arco, al borde del círculo (tapa el tiro directo del saque) */
  if (D.v2 && G.phase === 'kickoff' && G.kickTeam !== p.team) { A.tx = -dir * (g.kr + p.r + 2); A.ty = 0; A.mode = 'arrive'; A.plan = 'ko'; return; }
  /* voy yo a la pelota */
  if (shotOnUs && mates.length === 1 && tMe > 3) { block(); return; }
  /* cerca de mi arco no me la juego: si el rival está cerca de la pelota, primero tapo */
  const danger = D.v2 && b.x * dir < -W * 0.3;
  /* robar: si el rival no la tiene pegada (pelota suelta o quieta a su lado) y llego casi igual, voy a buscarla */
  let steal = false;
  if (D.v2 && oppFirst && G.phase !== 'kickoff') {
    const od = Math.hypot(oppFirst.x - b.x, oppFirst.y - b.y), bs = Math.hypot(b.vx, b.vy);
    const loose = od > oppFirst.r + b.r + 7, still = bs < 0.6 && Math.hypot(oppFirst.vx, oppFirst.vy) < 0.8;
    const myGoalSide = (p.x - b.x) * dir < -4;
    if (loose && still && myGoalSide && tMe < tOpp + 14) steal = true;   // solo si está todo quieto (si no, mejor tapar)
  }
  if (!steal && (tOpp + 4 < tMe || (danger && tMe > tOpp - 7)) && G.phase !== 'kickoff') {
    const tp = Math.min(Math.round(tOpp), nb), px = SM.BPx[tp], py = SM.BPy[tp];
    const far = Math.hypot(px - ownX, py);
    if (D.engage && Math.hypot(b.vx, b.vy) < 1.8 && Math.abs(b.x - ownX) > 260) {
      /* el rival camina con la pelota: no retroceder hasta el arco. Si la pelota se le despega, ir a sacársela; si la lleva pegada, aguantar a distancia
         (chocarlo de frente es perder el empujón) */
      const gap = oppFirst ? Math.hypot(oppFirst.x - b.x, oppFirst.y - b.y) - oppFirst.r - b.r : 99;
      if (gap > 7) { goalSide(b.x, b.y, R + 3); A.mode = 'seek'; }
      else { goalSide(b.x, b.y, R + 26); if (Math.hypot(A.tx - p.x, A.ty - p.y) > 40) A.mode = 'seek'; }
      A.plan = 'press';
      return;
    }
    if (D.press) {
      /* presión: pegarse a la pelota del lado de mi arco y disputarla (como un buen jugador de HaxBall), sin dejar de cerrar el ángulo */
      const ob = oppFirst ? Math.hypot(oppFirst.x - px, oppFirst.y - py) : 99;
      const myProj = (p.x - px) * (ownX - px) / (far || 1) + (p.y - py) * (-py) / (far || 1);
      const near = far < 150 ? 10 : 0;
      goalSide(px, py, myProj > 8 ? R + 2 + near + (ob < R + 6 ? 0 : 4) : R + 16 + near);
      if (Math.hypot(A.tx - p.x, A.ty - p.y) < 60) A.mode = 'seek';
      A.plan = 'press';
      if (smReach(p, A.tx, A.ty, 4) > tOpp + 18 && mates.length === 1) goalSide(px, py, far * 0.5);
      return;
    }
    goalSide(px, py, clamp(far * 0.3, 32, 70));
    if (smReach(p, A.tx, A.ty, 4) > tOpp + 10 && mates.length === 1) goalSide(px, py, far * 0.6);
    return;
  }

  /* cerca de mi arco y del lado equivocado de la pelota: rodearla por el lado de mi arco (sin empujarla para adentro) */
  if (danger) {
    let gx = ownX - b.x, gy = -b.y * 0.7; const gl = Math.hypot(gx, gy) || 1; gx /= gl; gy /= gl;
    const goalSideNow = (p.x - b.x) * gx + (p.y - b.y) * gy;
    if (goalSideNow < R * 0.4) {
      const lat = (p.x - b.x) * -gy + (p.y - b.y) * gx;
      if (!A.rside || Math.abs(lat) > 20) A.rside = lat >= 0 ? 1 : -1;
      const nearLine = Math.abs(b.x - ownX) < 60, sd = A.rside, wide = goalSideNow < R * 0.4 ? R + (nearLine ? 28 : 18) : 0;
      A.tx = b.x + gx * (R + 10) - gy * sd * wide; A.ty = b.y + gy * (R + 10) + gx * sd * wide;
      A.mode = 'seek'; A.plan = 'recover';
      return;
    }
  }
  /* pelota disputada: si el rival la puede patear ya y yo todavía no, primero tapo la línea a mi arco */
  if (D.guard && oppFirst && G.phase === 'play') {
    const od = Math.hypot(oppFirst.x - b.x, oppFirst.y - b.y) - oppFirst.r - b.r, md = Math.hypot(p.x - b.x, p.y - b.y) - p.r - b.r;
    const far = Math.hypot(b.x - ownX, b.y), gsNow = ((p.x - b.x) * (ownX - b.x) + (p.y - b.y) * -b.y) / (far || 1);
    /* también si llegamos casi juntos: se va a la pelota por el lado de mi arco, no por el costado */
    if (md > C.kickRange + 1 && gsNow < R && (od < C.kickRange + 5 || tOpp < tMe + 12)) {
      const tp = clamp(Math.round(Math.min(tMe, tOpp)), 0, nb);
      goalSide(SM.BPx[tp], SM.BPy[tp], R + 4); A.mode = 'seek'; A.plan = 'guard'; return;
    }
  }
  /* tengo la pelota (o llego primero): evaluar acciones desde donde la voy a tomar */
  const t0 = clamp(Math.round(tMe), 0, nb);
  const bx = SM.BPx[t0], by = SM.BPy[t0], bvx = SM.BPvx[t0], bvy = SM.BPvy[t0];
  const Hc = H - b.r, targets = [], caller = callerFor(G, p);
  if (caller) for (const lead of [0, 8, 16]) targets.push([caller.x + caller.vx * lead, caller.y + caller.vy * lead]);
  for (const f of (D.aim ? [-0.86, -0.72, -0.58, -0.44, -0.3, -0.15, 0, 0.15, 0.3, 0.44, 0.58, 0.72, 0.86] : [-0.82, -0.55, -0.28, 0, 0.28, 0.55, 0.82])) targets.push([oppX + dir * 12, f * gh]);
  /* autopase por la pared: tirarla contra la banda por delante del rival y buscarla del otro lado */
  if (D.wall && opps.some(q => q.human)) for (const fx of [50, 90, 140, 200]) for (const sy of [-1, 1]) targets.push([bx + dir * fx * g.kx, sy * (H + 20)]);
  for (const f of [-0.5, 0.5]) { targets.push([oppX + dir * 12, 2 * Hc - f * gh]); targets.push([oppX + dir * 12, -2 * Hc - f * gh]); }
  for (const q of mates) {
    if (q === p) continue;
    for (const lead of [0, 45]) {
      const x = q.x + q.vx * 8 + dir * lead * g.kx, y = q.y + q.vy * 8;
      targets.push([x, y]); targets.push([x, 2 * Hc - y]); targets.push([x, -2 * Hc - y]);   // directo y por la pared
    }
  }
  for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; targets.push([bx + Math.cos(a) * 200, by + Math.sin(a) * 200]); }
  let bestU = null, bestV = -1e9, bestKind = '';
  for (const [tx, ty] of targets) {
    let dx = tx - bx, dy = ty - by; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
    const sol = smSolve(bvx, bvy, dx, dy, G.phys.kickStr * (p.diff.kick || 1) * b.invMass);
    if (!sol) continue;
    const e = smEval(G, p, bx, by, sol.s * dx, sol.s * dy);
    if (caller && e.kind === 'pass' && e.who === caller) e.v += e.close < 38 ? 360 : 40;     // me la pidieron: al pie
    /* acomodarse detrás de la pelota para ese toque cuesta tiempo */
    const ax = (p.x - bx) * sol.ux + (p.y - by) * sol.uy, lat = Math.abs((p.x - bx) * sol.uy - (p.y - by) * sol.ux);
    const setup = ax > -R * 0.5 ? 25 + lat * 0.1 : lat * 0.08;
    const v = e.v - setup;
    if (v > bestV) { bestV = v; bestU = [sol.ux, sol.uy]; bestKind = e.kind; }
  }
  const holdV = smHold(G, p, bx, by, t0);
  let ux, uy;
  /* pegada a mi arco no se conduce: se despeja */
  const onLine = D.v2 && Math.abs(bx - ownX) < 45 && Math.abs(by) < gh + 30 && bestU && bestV > -800;
  if (bestU && (bestV > holdV || onLine)) { ux = bestU[0]; uy = bestU[1]; A.plan = bestKind; A.planV = bestV; }
  else {
    /* conducir: hacia el arco, abriéndose del rival que está más cerca */
    A.plan = 'carry'; A.planV = holdV;
    let cx = oppX - bx, cy = -by * 0.6; const cl = Math.hypot(cx, cy) || 1; cx /= cl; cy /= cl;
    let near = null, nd = 1e9;
    for (const q of opps) { const d = Math.hypot(q.x - bx, q.y - by); if (d < nd) { nd = d; near = q; } }
    if (near && nd < 120) {
      const ox = near.x - bx, oy = near.y - by;
      let side = (ox * cy - oy * cx) > 0 ? -1 : 1;
      if (D.v2 && nd < 95) {
        /* amague: si el rival ya se está tirando para un lado, salir para el otro */
        const vlat = near.vx * -cy + near.vy * cx;
        if (Math.abs(vlat) > 0.45) side = vlat > 0 ? -1 : 1;
      }
      const ang = (0.35 + 0.5 * (1 - nd / 120)) * side, c = Math.cos(ang), s = Math.sin(ang);
      const nx = cx * c - cy * s, ny = cx * s + cy * c; cx = nx; cy = ny;
    }
    ux = cx; uy = cy;
  }
  A.ux = ux; A.uy = uy;
  const qx = p.x - bx, qy = p.y - by;
  const along = qx * ux + qy * uy, lat = qx * -uy + qy * ux;
  const push = A.plan === 'carry' ? 3 : 6;
  if (along < -R * 0.55 && Math.abs(lat) < 6 + (-along) * 0.3) { A.tx = bx + ux * push; A.ty = by + uy * push; A.mode = A.plan === 'carry' ? 'carry' : 'seek'; }
  else if (along < -R * 0.55) { A.tx = bx - ux * (R + 6); A.ty = by - uy * (R + 6); A.mode = 'seek'; }
  else {
    /* rodear la pelota siempre por el mismo lado (si cambia a cada rato, se queda bailando al lado) */
    if (!A.side || Math.abs(lat) > 14) A.side = lat >= 0 ? 1 : -1;
    const side = A.side;
    A.tx = bx - ux * (R + 18) - uy * side * (R + 16); A.ty = by - uy * (R + 18) + ux * side * (R + 16); A.mode = 'seek';
  }
  A.tx = clamp(A.tx, -g.boxW + 16, g.boxW - 16); A.ty = clamp(A.ty, -g.boxH + 16, g.boxH - 16);
}

/* cada tick: patear solo si conviene más que seguir con el plan, y moverse con control de velocidad */
function smTick(G, p) {
  const A = p.ai, D = p.diff;
  if (G.phase === 'goal') { p.in.dx = p.in.dy = 0; p.in.kick = false; return; }
  if (G.tick >= A.next || A.tx == null) { smDecide(G, p); A.next = G.tick + D.think; }
  const bb = G.ball, dBall = Math.hypot(bb.x - p.x, bb.y - p.y);
  /* saque del medio a favor: ir derecho a la pelota y sacar (que nunca se quede trabado esperando) */
  const myKickoff = G.phase === 'kickoff' && G.kickTeam === p.team && p.ai.chaser;
  /* pelota quieta al lado mucho rato: destrabarla sí o sí */
  A.idle = Math.hypot(bb.vx, bb.vy) < 0.3 && dBall < 48 ? (A.idle || 0) + 1 : 0;
  if (myKickoff || A.idle > 50) {
    const dir = p.team === 0 ? 1 : -1;
    const wantX = bb.x - dir * (p.r + bb.r + 2), wantY = bb.y + (A.idle > 50 ? 0 : (p.y > bb.y ? 4 : -4));
    const behind = (p.x - bb.x) * dir < -(p.r + bb.r) * 0.5;
    A.tx = behind ? bb.x : wantX; A.ty = behind ? bb.y : wantY; A.mode = 'seek';
    if (dBall - p.r - bb.r < C.kickRange && behind) { A.forceKick = true; }
  } else A.forceKick = false;
  let kick = false;
  const b = G.ball, dx0 = b.x - p.x, dy0 = b.y - p.y, d0 = Math.hypot(dx0, dy0);
  if (d0 > 0 && d0 - p.r - b.r < C.kickRange) {
    const ks = G.phys.kickStr * (p.diff.kick || 1) * b.invMass, vx = b.vx + dx0 / d0 * ks, vy = b.vy + dy0 / d0 * ks;
    const e = smEval(G, p, b.x, b.y, vx, vy), hold = smHold(G, p, b.x, b.y, 0);
    A.lastE = e;
    const plan = A.plan && A.plan !== 'carry' ? A.planV : -1e9;
    /* pelota trabada contra un rival: no quedarse empujando, sacarla */
    let contested = false;
    for (const q of G.players) if (q.team !== p.team && Math.hypot(q.x - b.x, q.y - b.y) < q.r + b.r + 8) contested = true;
    A.stuck = contested || Math.hypot(b.vx, b.vy) < 0.4 ? (A.stuck || 0) + 1 : 0;   // trabada o quieta contra la pared
    const caller = callerFor(G, p);
    if (e.kind === 'own') kick = false;
    else if (caller && e.kind === 'pass' && e.who === caller && e.close < 38 && e.ps > 0.3) kick = true;   // pase al pie del que la pidió
    else if (e.kind === 'shot' && e.pg > (D.sure ? (Math.abs(b.x - (p.team === 0 ? 1 : -1) * G.geo.W) < 130 ? 0.3 : 0.55) : D.attack ? 0.18 : 0.3)) kick = true;
    else if (D.press && contested && e.kind !== 'blocked' && e.v > hold - 40) kick = true;   // disputa: sacarla para adelante
    else if (e.v > hold + 6 && e.v > plan - 25) kick = true;
    else if (A.stuck > 25 && (e.v > hold - 70 || A.stuck > 45)) kick = true;
  } else A.stuck = 0;
  if (A.forceKick) kick = true;
  /* control: velocidad deseada hacia el objetivo, corrigiendo la que ya trae */
  const a = smAcc(p), vmax = a * C.pDamp / (1 - C.pDamp);
  let dx = A.tx - p.x, dy = A.ty - p.y; const d = Math.hypot(dx, dy);
  let ix = 0, iy = 0;
  if (d > 1) {
    dx /= d; dy /= d;
    let sp = vmax;
    if (A.mode === 'arrive') sp = Math.min(vmax, Math.sqrt(2 * a * 8 * d) * 0.55);
    else if (A.mode === 'carry') sp = Math.min(vmax, Math.hypot(b.vx, b.vy) + (D.attack ? 1.6 : 1.1));   // conducir sin pegarle de más
    let wx = dx * sp - p.vx, wy = dy * sp - p.vy; const wl = Math.hypot(wx, wy);
    if (wl > 0.02) { ix = wx / wl * Math.min(1, wl / (a * 2)); iy = wy / wl * Math.min(1, wl / (a * 2)); }
  } else { ix = -p.vx * 4; iy = -p.vy * 4; }
  p.in.dx = clamp(ix, -1, 1); p.in.dy = clamp(iy, -1, 1); p.in.kick = kick;
  if (D.digital) { const q = v => (v > 0.38 ? 1 : v < -0.38 ? -1 : 0); p.in.dx = q(p.in.dx); p.in.dy = q(p.in.dy); }   // como un teclado (solo para pruebas)
}

if (typeof module !== 'undefined') module.exports = { predictCross, totals, callForBall, PHYS, C, PITCHES, PITCH_LIMITS, DIFF, makeGeo, createGame, step };
