'use strict';
/* ===== Motor compartido (navegador y servidor): física + bots ===== */
const C = {
  ballR: 10, playerR: 15, postR: 8, goalDepth: 40,
  acc: 0.1, kickAcc: 0.07, pDamp: 0.96, bDamp: 0.99, kickStr: 5, kickRange: 4,
  pBC: 0.5, bBC: 0.5, postBC: 0.5, wallBC: 1, goalTicks: 150, goldenTicks: 3600
};

const PITCHES = {
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
  expert: { key: 'expert', label: 'Experto', think: 2,  speed: 1,    predict: 1,    aimErr: 0.015, kickTol: 0.14, sloppy: 0,    gkSkill: 1 }
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
    kr: clamp(Math.round(H * 0.44), 45, Math.min(125, Math.floor(W * 0.32))),
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
    cfg, geo, kits: cfg.kits || null, players: [], ball: mkDisc(0, 0, C.ballR, 1, C.bBC), posts: [], nTeam: [0, 0],
    score: [0, 0], tick: 0, playTicks: 0, phase: 'kickoff', kickTeam: 0,
    goalTimer: 0, lastGoalTeam: -1, lastTouch: null, tied: false, overtime: false, otTicks: 0, manual: !!cfg.manual, over: false,
    winner: -1, pendingEnd: false, banner: null, events: [], humanTeam: cfg.humanTeam
  };
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    G.posts.push(mkDisc(sx * geo.W, sy * geo.gh, C.postR, 0, C.postBC));
  }
  const roster = cfg.roster || defaultRoster(cfg);
  for (const r of roster) {
    const team = r.team, idx = G.nTeam[team]++;
    const p = mkDisc(0, 0, C.playerR, 0.5, C.pBC);
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

function touchBall(G, p) {
  G.lastTouch = p;
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
    const a = (inp.kick ? C.kickAcc : C.acc) * (p.human ? 1 : p.diff.speed) * (p.accMul || 1);
    p.vx += dx * a; p.vy += dy * a;
    if (inp.kick) {
      if (p.armed) {
        const ddx = ball.x - p.x, ddy = ball.y - p.y, d = Math.hypot(ddx, ddy);
        if (d > 0 && d - p.r - ball.r < C.kickRange) {
          ball.vx += ddx / d * C.kickStr * ball.invMass;
          ball.vy += ddy / d * C.kickStr * ball.invMass;
          p.armed = false; p.flash = 10;
          touchBall(G, p); ev(G, 'kick');
        }
      }
    } else p.armed = true;
  }

  for (const p of P) { p.x += p.vx; p.y += p.vy; }
  ball.x += ball.vx; ball.y += ball.vy;

  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) discDisc(P[i], P[j]);
  for (const p of P) if (discDisc(p, ball)) touchBall(G, p);
  for (const post of G.posts) {
    for (const p of P) discDisc(post, p);
    if (discDisc(post, ball) > 1.5) ev(G, 'wall');
  }
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
      if (G.score[0] !== G.score[1] || G.cfg.allowDraw) finish(G);   // la fase de grupos admite empates
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

function finish(G) {
  G.over = true;
  G.winner = G.score[0] === G.score[1] ? -1 : (G.score[0] > G.score[1] ? 0 : 1);
  ev(G, 'end');
}

/* ===== Bots ===== */
function predictBall(G, steps) {
  const b = G.ball, g = G.geo;
  let x = b.x, y = b.y, vx = b.vx, vy = b.vy;
  const H = g.H - b.r, W = g.W - b.r, mouth = g.gh - b.r;
  for (let i = 0; i < steps; i++) {
    x += vx; y += vy; vx *= C.bDamp; vy *= C.bDamp;
    if (y > H) { y = H; vy = -vy * 0.5; } else if (y < -H) { y = -H; vy = -vy * 0.5; }
    if (Math.abs(y) > mouth) {
      if (x > W) { x = W; vx = -vx * 0.5; } else if (x < -W) { x = -W; vx = -vx * 0.5; }
    }
  }
  return { x, y };
}

function predictCross(G, ownX, dir) {
  const b = G.ball, g = G.geo;
  if (b.vx * dir > -0.3) return null;
  let x = b.x, y = b.y, vx = b.vx, vy = b.vy;
  const H = g.H - b.r;
  const horizon = clamp(Math.ceil(Math.abs(b.x - ownX) / Math.max(0.3, Math.abs(b.vx)) * 1.6) + 10, 30, 500);
  for (let i = 0; i < horizon; i++) {
    x += vx; y += vy; vx *= C.bDamp; vy *= C.bDamp;
    if (y > H) { y = H; vy = -vy * 0.5; } else if (y < -H) { y = -H; vy = -vy * 0.5; }
    if ((x - ownX) * dir < 0) return Math.abs(y) < g.gh + 6 ? { t: i, y } : null;
  }
  return null;
}

function aiUpdate(G, p) {
  const A = p.ai, D = p.diff;
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
  let sx = oppX - bp.x, sy = aimY - bp.y;
  const sl = Math.hypot(sx, sy) || 1; sx /= sl; sy /= sl;
  const nx = -sy, ny = sx;

  const qx = p.x - bp.x, qy = p.y - bp.y;
  const a = qx * sx + qy * sy, l = qx * nx + qy * ny;
  const R = ball.r + p.r;
  let tx, ty;
  if (a < 0) {
    if (Math.abs(l) < 18 + (-a) * 0.12 || dist < R + 25) { tx = bp.x; ty = bp.y; }
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
    const safe = !(ux * dir < -0.4 && ball.x * dir < -W * 0.54 && Math.abs(ball.y) < H * 0.65);
    let pressed = false;
    for (const q of G.players) {
      if (q.team !== p.team && Math.hypot(q.x - p.x, q.y - p.y) < 36) { pressed = true; break; }
    }
    const good = (allowed && ang < D.kickTol) || (pressed && ang < 1.2);
    A.kick = (safe && good) || Math.random() < D.sloppy;
  }
}

if (typeof module !== 'undefined') module.exports = { predictCross, C, PITCHES, PITCH_LIMITS, DIFF, makeGeo, createGame, step };
