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
  expert: { key: 'expert', label: 'Experto', think: 2,  speed: 1,    predict: 1,    aimErr: 0.015, kickTol: 0.14, sloppy: 0,    gkSkill: 1 },
  impossible: { key: 'impossible', label: 'Imposible', think: 2, speed: 1.12, predict: 1, aimErr: 0, kickTol: 0.06, sloppy: 0, gkSkill: 1, smart: true }
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
    if (inp.kick && !p.noKick && !p.noBall) {
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
  for (const p of P) if (!p.noBall && discDisc(p, ball)) touchBall(G, p);
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

/* ===== Bot "Imposible" =====
   Cada pocos ticks:
   - predice el recorrido de la pelota (con rebotes) y calcula cuántos ticks tarda cada jugador en llegar a ella;
   - si llega primero, prueba varios tiros (al arco y de rebote en la pared), simula cada uno y elige el que
     ningún rival alcanza a cortar; si no hay tiro limpio, conduce la pelota hacia el arco alejándola del rival;
   - si el rival llega primero, se para entre la pelota y su arco (cerrando el ángulo) y tapa los tiros
     yendo al punto del recorrido que alcanza antes.
   En cada tick, si tiene la pelota al alcance, simula qué pasaría si patea ahora y solo patea si conviene.
 */

const SM = { tables: {}, BPx: new Float64Array(181), BPy: new Float64Array(181), BPvx: new Float64Array(181), BPvy: new Float64Array(181),
  SPx: new Float64Array(181), SPy: new Float64Array(181), pw: null };
(function () { SM.pw = new Float64Array(401); let v = 1; for (let n = 0; n <= 400; n++) { SM.pw[n] = v; v *= C.pDamp; } })();

function smAcc(p) { return C.acc * (p.human ? 1 : p.diff.speed) * (p.accMul || 1); }
function smTable(a) {
  const key = a.toFixed(5);
  if (SM.tables[key]) return SM.tables[key];
  const t = new Float64Array(401); let v = 0, s = 0;
  for (let n = 1; n <= 400; n++) { v = (v + a) * C.pDamp; s += v; t[n] = s; }
  return (SM.tables[key] = t);
}
/* ticks que tarda q en quedar a "near" de (x, y), teniendo en cuenta su velocidad actual */
function smReach(q, x, y, near) {
  const dx = x - q.x, dy = y - q.y, full = Math.hypot(dx, dy), d = full - near;
  if (d <= 0) return 0;
  const ux = dx / full, uy = dy / full, a = smAcc(q);
  const v0 = q.vx * ux + q.vy * uy, lat = Math.abs(q.vx * uy - q.vy * ux);
  const T = smTable(a), k = C.pDamp / (1 - C.pDamp);
  let n = 0;
  while (n < 400) {
    n += n < 24 ? 1 : 3;
    if (n > 400) n = 400;
    if (T[n] + v0 * k * (1 - SM.pw[n]) >= d) break;
  }
  return n + lat / a * 0.45;
}

/* recorrido de la pelota: llena xs/ys(/vxs/vys) hasta n ticks; devuelve el equipo que hace el gol (o -1) y en qué tick */
function smSim(G, x, y, vx, vy, n, xs, ys, vxs, vys) {
  const g = G.geo, r = G.ball.r, H = g.H - r, W = g.W - r, mouth = g.gh - r;
  xs[0] = x; ys[0] = y; if (vxs) { vxs[0] = vx; vys[0] = vy; }
  for (let i = 1; i <= n; i++) {
    x += vx; y += vy;
    if (y > H) { y = H; vy = -vy * 0.5; } else if (y < -H) { y = -H; vy = -vy * 0.5; }
    if (Math.abs(y) > mouth) {
      if (x > W) { x = W; vx = -vx * 0.5; } else if (x < -W) { x = -W; vx = -vx * 0.5; }
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

/* qué tan holgado es un tiro (recorrido en SP): ticks de ventaja sobre el rival que mejor lo corta */
function smMargin(G, team, n) {
  let m = 99;
  for (const q of G.players) {
    if (q.team === team) continue;
    const near = q.r + G.ball.r - 3;
    for (let k = 2; k <= n; k += 2) {
      const mk = smReach(q, SM.SPx[k], SM.SPy[k], near) - k;
      if (mk < m) { m = mk; if (m < -25) return m; }
    }
  }
  return m;
}

/* simula patear ahora: { goal, margin, vx } o null si la pelota no está al alcance */
function smKickNow(G, p) {
  const b = G.ball, dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy);
  if (d === 0 || d - p.r - b.r >= C.kickRange) return null;
  const ux = dx / d, uy = dy / d, vx = b.vx + ux * C.kickStr, vy = b.vy + uy * C.kickStr;
  const res = smSim(G, b.x, b.y, vx, vy, 170, SM.SPx, SM.SPy);
  const n = res.goal >= 0 ? res.t : Math.min(res.n, 120);
  return { goal: res.goal, margin: smMargin(G, p.team, n), vx, vy };
}

function smDecide(G, p) {
  const A = p.ai, g = G.geo, b = G.ball, W = g.W, H = g.H, gh = g.gh;
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
  /* quién de mi equipo va a la pelota (con algo de memoria para que no cambien a cada rato) */
  let att = mates[0], best = 1e9;
  for (const q of mates) { const s = tOf.get(q) - (q.ai.chaser ? 5 : 0); if (s < best) { best = s; att = q; } }
  for (const q of mates) q.ai.chaser = q === att;
  const tMe = tOf.get(p);
  const shotOnUs = path.goal === 1 - p.team;
  A.kick = false;

  const block = () => {
    /* tapar un tiro: el primer punto del recorrido al que llego a tiempo */
    for (let k = 1; k <= nb; k++) {
      if (smReach(p, SM.BPx[k], SM.BPy[k], R - 4) <= k) { A.tx = SM.BPx[k]; A.ty = SM.BPy[k]; A.mode = 'seek'; return true; }
    }
    A.tx = ownX + dir * 18; A.ty = clamp(SM.BPy[nb], -gh + 8, gh - 8); A.mode = 'seek';
    return true;
  };
  const goalSide = (px, py, dist) => {
    /* pararse entre la pelota y el centro del arco propio, a "dist" de la pelota */
    let gx = ownX - px, gy = -py * 0.85; const gl = Math.hypot(gx, gy) || 1;
    const dd = Math.min(dist, Math.max(0, gl - 22));
    A.tx = px + gx / gl * dd; A.ty = py + gy / gl * dd; A.mode = 'arrive';
  };

  if (p !== att) {
    /* sin la pelota: uno cuida el arco y el otro se ofrece para el rebote */
    const others = mates.filter(q => q !== att).sort((a, c) => dir * a.x - dir * c.x);
    const keeper = others[0] === p;
    if (shotOnUs && (keeper || others.length === 1)) { block(); return; }
    if (keeper) {
      const tp = Math.min(Math.round(tOpp), nb), px = SM.BPx[tp], py = SM.BPy[tp];
      const far = Math.hypot(px - ownX, py);
      if (others.length >= 2 || far < W * 0.9) goalSide(px, py, Math.max(30, far - 34 - (others.length >= 2 ? 0 : far * 0.35)));
      else goalSide(px, py, far * 0.5);
      return;
    }
    if (tOpp + 2 < tOf.get(att)) {
      /* el rival tiene la pelota: marcar al rival libre más peligroso, entre él y el arco */
      let mark = null, md = 1e9;
      for (const q of opps) { if (q === oppFirst) continue; const dd = Math.hypot(q.x - ownX, q.y); if (dd < md) { md = dd; mark = q; } }
      if (mark) {
        const gx = ownX - mark.x, gy = -mark.y; const gl = Math.hypot(gx, gy) || 1;
        A.tx = mark.x + gx / gl * 34; A.ty = mark.y + gy / gl * 34; A.mode = 'arrive';
        return;
      }
    }
    A.tx = clamp(b.x + dir * 120 * g.kx, -(W - 40), W - 40);
    A.ty = clamp(b.y > 0 ? b.y - 110 * g.ky : b.y + 110 * g.ky, -H * 0.8, H * 0.8);
    A.mode = 'arrive';
    return;
  }

  /* voy yo a la pelota */
  if (shotOnUs && mates.length === 1 && tMe > 3) { block(); return; }
  if (tOpp + 4 < tMe && G.phase !== 'kickoff') {
    /* el rival llega antes: cerrarle el arco desde adelante */
    const tp = Math.min(Math.round(tOpp), nb), px = SM.BPx[tp], py = SM.BPy[tp];
    const far = Math.hypot(px - ownX, py);
    goalSide(px, py, clamp(far * 0.3, 32, 70));
    if (smReach(p, A.tx, A.ty, 4) > tOpp + 10 && mates.length === 1) goalSide(px, py, far * 0.6);
    return;
  }

  /* llego primero: elegir el mejor tiro desde donde voy a tomar la pelota */
  const t0 = clamp(Math.round(tMe), 0, nb);
  const bx = SM.BPx[t0], by = SM.BPy[t0], bvx = SM.BPvx[t0], bvy = SM.BPvy[t0];
  const Hc = H - b.r;
  let bestU = null, bestV = -1e9;
  const tries = [];
  for (const f of [-0.8, -0.55, -0.3, 0, 0.3, 0.55, 0.8]) tries.push([oppX + dir * 12, f * gh]);
  for (const f of [-0.5, 0.5]) { tries.push([oppX + dir * 12, 2 * Hc - f * gh]); tries.push([oppX + dir * 12, -2 * Hc - f * gh]); }
  for (const [tx, ty] of tries) {
    let dx = tx - bx, dy = ty - by; const dl = Math.hypot(dx, dy); dx /= dl; dy /= dl;
    const dv = dx * bvx + dy * bvy, disc = dv * dv - (bvx * bvx + bvy * bvy) + C.kickStr * C.kickStr;
    if (disc < 0) continue;
    const s = dv + Math.sqrt(disc);
    const ux = (s * dx - bvx) / C.kickStr, uy = (s * dy - bvy) / C.kickStr;
    const res = smSim(G, bx, by, s * dx, s * dy, 170, SM.SPx, SM.SPy);
    if (res.goal !== p.team) continue;
    const m = smMargin(G, p.team, res.t);
    /* cuánto me cuesta acomodarme detrás de la pelota para ese tiro */
    const ax = (p.x - bx) * ux + (p.y - by) * uy, lat = Math.abs((p.x - bx) * uy - (p.y - by) * ux);
    const setup = ax > -R * 0.5 ? 12 + lat * 0.05 : lat * 0.04;
    const v = clamp(m - t0 * 0.02, -30, 30) * 3 - setup - res.t * 0.05;
    if (v > bestV) { bestV = v; bestU = [ux, uy]; }
  }
  let ux, uy;
  A.plan = bestU && bestV > -6 ? 'shoot' : 'carry';
  if (A.plan === 'shoot') { ux = bestU[0]; uy = bestU[1]; }
  else {
    /* conducir: hacia el arco, abriéndose del rival más cercano */
    let cx = oppX - bx, cy = -by * 0.6; const cl = Math.hypot(cx, cy) || 1; cx /= cl; cy /= cl;
    if (oppFirst) {
      const ox = oppFirst.x - bx, oy = oppFirst.y - by, side = (ox * cy - oy * cx) > 0 ? -1 : 1;
      const ang = 0.45 * side, c = Math.cos(ang), s = Math.sin(ang);
      const nx = cx * c - cy * s, ny = cx * s + cy * c; cx = nx; cy = ny;
    }
    ux = cx; uy = cy;
  }
  A.ux = ux; A.uy = uy;
  /* llegar por detrás de la pelota en la dirección elegida */
  const qx = p.x - bx, qy = p.y - by;
  const along = qx * ux + qy * uy, lat = qx * -uy + qy * ux;
  if (along < -R * 0.55 && Math.abs(lat) < 6 + (-along) * 0.3) { A.tx = bx + ux * 6; A.ty = by + uy * 6; A.mode = 'seek'; }
  else if (along < -R * 0.55) { A.tx = bx - ux * (R + 6); A.ty = by - uy * (R + 6); A.mode = 'seek'; }
  else {
    const side = lat >= 0 ? 1 : -1;
    A.tx = bx - ux * (R + 18) - uy * side * (R + 16); A.ty = by - uy * (R + 18) + ux * side * (R + 16); A.mode = 'seek';
  }
  A.tx = clamp(A.tx, -g.boxW + 16, g.boxW - 16); A.ty = clamp(A.ty, -g.boxH + 16, g.boxH - 16);
}

/* cada tick: patear solo si conviene, y moverse con control de velocidad */
function smTick(G, p) {
  const A = p.ai, D = p.diff;
  if (G.phase === 'goal') { p.in.dx = p.in.dy = 0; p.in.kick = false; return; }
  if (G.tick >= A.next || A.tx == null) { smDecide(G, p); A.next = G.tick + D.think; }
  let kick = false;
  const o = smKickNow(G, p);
  if (o) {
    const dir = p.team === 0 ? 1 : -1, b = G.ball;
    if (o.goal === p.team && o.margin > -2) kick = true;
    else if (o.goal === 1 - p.team) kick = false;
    else {
      let opT = 1e9;
      for (const q of G.players) if (q.team !== p.team) opT = Math.min(opT, smReach(q, b.x, b.y, q.r + b.r));
      const fwd = o.vx * dir > 1.2;
      if (fwd && (opT < 7 || (b.x * dir < -G.geo.W * 0.45 && opT < 22)) && o.margin > -14) kick = true;
    }
  }
  /* control: velocidad deseada hacia el objetivo, corrigiendo la que ya trae */
  const a = smAcc(p), vmax = a * C.pDamp / (1 - C.pDamp);
  let dx = A.tx - p.x, dy = A.ty - p.y; const d = Math.hypot(dx, dy);
  let ix = 0, iy = 0;
  if (d > 1) {
    dx /= d; dy /= d;
    const sp = A.mode === 'arrive' ? Math.min(vmax, Math.sqrt(2 * a * 8 * d) * 0.55) : vmax;
    let wx = dx * sp - p.vx, wy = dy * sp - p.vy; const wl = Math.hypot(wx, wy);
    if (wl > 0.02) { ix = wx / wl * Math.min(1, wl / (a * 2)); iy = wy / wl * Math.min(1, wl / (a * 2)); }
  } else { ix = -p.vx * 4; iy = -p.vy * 4; }
  p.in.dx = clamp(ix, -1, 1); p.in.dy = clamp(iy, -1, 1); p.in.kick = kick;
}

if (typeof module !== 'undefined') module.exports = { predictCross, C, PITCHES, PITCH_LIMITS, DIFF, makeGeo, createGame, step };
