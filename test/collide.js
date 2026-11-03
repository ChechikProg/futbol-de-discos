// La predicción del cliente no deja atravesar a otros jugadores.
const assert = require('assert');
const core = require('../src/core.js');
const G = core.createGame({ size: 1, diff: 'normal', humanTeam: 0 });
const me = G.players[0], other = G.players[1];
const S = { x: -50, y: 0, vx: 0, vy: 0, r: me.r, invMass: me.invMass, bCoef: me.bCoef, team: 0 };
const o = [{ x: -20, y: 0, vx: 0, vy: 0, r: other.r, invMass: other.invMass, bCoef: other.bCoef }];
G.phase = 'play';
let minD = 1e9;
for (let i = 0; i < 120; i++) { core.predictPlayer(G, S, { dx: 1, dy: 0, kick: false }, o); minD = Math.min(minD, Math.hypot(S.x - o[0].x, S.y - o[0].y)); }
assert(minD >= me.r + other.r - 0.01, 'atravesó: ' + minD);
console.log('COLLIDE OK', minD.toFixed(2), '>=', (me.r + other.r).toFixed(2));
