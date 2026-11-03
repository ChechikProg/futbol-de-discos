// (Si el jugador choca con un bot puede haber algún salto chico: el servidor resuelve ese choque distinto.)
// Mide la respuesta del juego online con latencia simulada.
// Un proxy TCP retrasa cada sentido DELAY ms (ping = 2 x DELAY).
const net = require('net');
const { chromium } = require('playwright');
const { server } = require('../server.js');
const DELAY = +(process.env.DELAY || 140);
const OUT = process.env.SHOTS || '/tmp/claude-0/-home-claude/076ee193-bcaa-50b1-85a6-0bef0beeee81/scratchpad/shots';
const errors = [];

function pipe(from, to) {
  from.on('data', b => setTimeout(() => { if (!to.destroyed) to.write(b); }, DELAY));
  from.on('end', () => setTimeout(() => to.end(), DELAY));
  from.on('error', () => to.destroy());
}

(async () => {
  await new Promise(r => server.listen(3300, r));
  const proxy = net.createServer(c => { const s = net.connect(3300, '127.0.0.1'); pipe(c, s); pipe(s, c); c.on('error', () => s.destroy()); });
  await new Promise(r => proxy.listen(3301, r));

  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 700 } })).newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto('http://127.0.0.1:3301/');
  await page.waitForSelector('.mode');
  await page.click('.mode >> nth=1');
  await page.waitForSelector('.status.ok', { timeout: 15000 });
  await page.click('text=Crear sala');
  await page.waitForSelector('#room:not([hidden])');
  await page.click('label[for="on-size-1"]');
  await page.click('label[for="on-diff-easy"]');
  await page.waitForTimeout(1200);
  await page.click('text=Empezar partido');
  await page.waitForFunction(() => mode === 'online' && state === 'playing' && NET.snaps.length > 30 && PR.init, null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  const rtt = await page.evaluate(() => NET.rtt);
  console.log('ping medido por el juego:', rtt, 'ms | retardo de dibujo adaptativo:', Math.round(await page.evaluate(() => NET.delay)), 'ms');

  const res = await page.evaluate(() => new Promise(resolve => {
    const me = () => ogame.players[NET.you];
    const press = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true, cancelable: true }));
    const out = { jumps: [], visLat: null, srvLat: null };
    const lastSnapX = () => { const s = NET.snaps[NET.snaps.length - 1]; return s.m.p[NET.you * 6]; };
    const x0 = me().x, sx0 = lastSnapX();
    const t0 = performance.now();
    press('ArrowRight', true);
    let prev = { x: me().x, y: me().y };
    const plan = [[0, 'ArrowRight', true], [1100, 'ArrowRight', false], [1100, 'ArrowDown', true], [1900, 'ArrowDown', false], [1900, 'ArrowLeft', true], [2900, 'ArrowLeft', false]];
    const done = new Set([0]);
    function loop() {
      const t = performance.now() - t0, p = me();
      if (out.visLat == null && Math.abs(p.x - x0) > 0.5) out.visLat = t;
      if (out.srvLat == null && Math.abs(lastSnapX() - sx0) > 0.5) out.srvLat = t;
      const j = Math.hypot(p.x - prev.x, p.y - prev.y);
      out.jumps.push(j); prev = { x: p.x, y: p.y };
      plan.forEach((s, i) => { if (!done.has(i) && t >= s[0]) { done.add(i); press(s[1], s[2]); } });
      if (t < 4500) requestAnimationFrame(loop);
      else {
        const s = NET.snaps[NET.snaps.length - 1].m, k = NET.you * 6;
        out.finalDiff = Math.hypot(p.x - s.p[k], p.y - s.p[k + 1]);
        out.errMax = PR.errMax; out.maxJump = Math.max(...out.jumps); out.avgJump = out.jumps.reduce((a, b) => a + b, 0) / out.jumps.length;
        out.big = out.jumps.filter(v => v > 4).length; delete out.jumps;
        resolve(out);
      }
    }
    requestAnimationFrame(loop);
  }));
  console.log('--- con ping de ~' + DELAY * 2 + ' ms ---');
  console.log('tarda en verse mi movimiento:', Math.round(res.visLat), 'ms (el servidor lo confirma a los', Math.round(res.srvLat), 'ms)');
  console.log('mayor salto entre cuadros:', res.maxJump.toFixed(2), 'px | saltos > 4px:', res.big, '| velocidad media', res.avgJump.toFixed(2), 'px/cuadro');
  console.log('error máximo de predicción vs. servidor:', res.errMax.toFixed(2), 'px | diferencia final al frenar:', res.finalDiff.toFixed(2), 'px');
  await page.screenshot({ path: OUT + '/30-lag-game.png' });
  for (const k of ['visLat', 'maxJump', 'avgJump', 'errMax', 'finalDiff']) if (!Number.isFinite(res[k])) errors.push('valor inválido en ' + k);
  if (res.avgJump < 0.3) errors.push('el jugador no se movió');
  if (res.visLat > 120) errors.push('el movimiento propio tarda demasiado en verse: ' + res.visLat);
  if (res.big > 10 || res.maxJump > 8) errors.push('hay saltos visibles al corregir: ' + res.big);
  if (res.finalDiff > 3) errors.push('no converge con el servidor: ' + res.finalDiff);

  await browser.close(); proxy.close(); server.close();
  console.log(errors.length ? 'ERRORES:\n' + errors.join('\n') : 'LAG OK');
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('FALLÓ', e.message.slice(0, 500)); process.exit(1); });
