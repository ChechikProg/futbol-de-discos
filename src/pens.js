'use strict';
/* ===== Tanda de penales: reglas y probabilidades (sin interfaz) =====
   "u" es el jugador y "c" la máquina. Cada tiro apunta a una zona del arco:
   columna 0 (izquierda), 1 (centro), 2 (derecha) y fila 0 (arriba) o 1 (abajo). */
const PEN = (() => {
  const READ = { easy: 0.15, normal: 0.3, hard: 0.45, expert: 0.55 };   // chance de que el arquero lea tus tiros anteriores
  const HIGH = { easy: 0.25, normal: 0.35, hard: 0.45, expert: 0.5 };   // chance de que la máquina patee arriba

  function create(first) { return { first, u: [], c: [], done: false, winner: null }; }
  function turn(s) {
    const second = s.first === 'u' ? 'c' : 'u';
    return (s.u.length + s.c.length) % 2 === 0 ? s.first : second;
  }
  function score(s) { return [s.u.filter(Boolean).length, s.c.filter(Boolean).length]; }

  /* anota un tiro y decide si la tanda ya terminó: 5 tiros cada uno (se corta apenas uno no puede alcanzar) y después muerte súbita */
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

  /* 'goal' | 'save' | 'miss' */
  function resolve(shot, keeperCol, rnd) {
    const high = shot.row === 0, side = shot.col !== 1;
    const missP = high ? (side ? 0.12 : 0.05) : 0.03;
    if (rnd() < missP) return 'miss';
    if (keeperCol === shot.col) {
      const saveP = high ? (side ? 0.5 : 0.6) : (side ? 0.7 : 0.85);
      return rnd() < saveP ? 'save' : 'goal';
    }
    return 'goal';
  }

  function aiShot(rnd, diff) {
    const row = rnd() < (HIGH[diff] != null ? HIGH[diff] : 0.35) ? 0 : 1;
    const col = rnd() < 0.2 ? 1 : (rnd() < 0.5 ? 0 : 2);
    return { col, row };
  }

  /* el arquero a veces lee hacia dónde pateás más seguido */
  function aiKeeper(rnd, diff, hist) {
    if (hist.length >= 2 && rnd() < (READ[diff] != null ? READ[diff] : 0.3)) {
      const n = [0, 0, 0];
      for (const c of hist) n[c]++;
      const best = Math.max(...n), tops = [0, 1, 2].filter(c => n[c] === best);
      return tops[Math.floor(rnd() * tops.length)];
    }
    return Math.floor(rnd() * 3);
  }

  return { create, turn, score, record, resolve, aiShot, aiKeeper };
})();

if (typeof module !== 'undefined') module.exports = PEN;
