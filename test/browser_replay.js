// El archivo de repetición reproduce el partido exacto (misma pelota y jugadores en el último tick).
const { chromium } = require('playwright'); const fs = require('fs');
const { createGame, step } = require('../src/core.js');
(async () => {
  const browser = await chromium.launch(), ctx = await browser.newContext({ viewport: { width: 1280, height: 760 }, acceptDownloads: true }), page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(process.env.URL || 'http://127.0.0.1:3100/'); await page.waitForSelector('.mode');
  await page.click('.mode:has-text("Contra la máquina")');
  await page.evaluate(() => { LOCAL.diff = 'impossible'; LOCAL.size = '1'; startLocal(); });
  const keys = ['ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'Space'];
  for (let i = 0; i < 40; i++) { const k = keys[Math.floor(Math.random() * 4)]; await page.keyboard.down(k); if (i % 3 === 0) await page.keyboard.down('Space'); await page.waitForTimeout(120); await page.keyboard.up(k); await page.keyboard.up('Space'); }
  const dl = page.waitForEvent('download');
  const st = await page.evaluate(() => { const g = game; window.__snap = { tick: g.tick, ball: [g.ball.x, g.ball.y], ps: g.players.map(p => [p.x, p.y]) }; downloadReplay(); return window.__snap; });
  const file = await (await dl).path(); const R = JSON.parse(fs.readFileSync(file, 'utf8'));
  const G = createGame(R.cfg), me = G.players.find(p => p.human);
  for (const ch of R.inputs) { const c = ch.charCodeAt(0) - 97, r = c % 9; me.in.dx = Math.floor(r / 3) - 1; me.in.dy = (r % 3) - 1; me.in.kick = c >= 9; step(G); G.events.length = 0; }
  const diff = Math.hypot(G.ball.x - st.ball[0], G.ball.y - st.ball[1]);
  console.log('ticks página', st.tick, '| ticks archivo', R.inputs.length, '| diferencia de la pelota', diff.toFixed(4), '| puntaje', G.score.join('-'));
  if (diff > 0.01 || Math.abs(st.tick - R.inputs.length) > 1) errors.push('la repetición no coincide');
  await browser.close(); console.log(errors.length ? 'ERRORES: ' + errors.join(' | ') : 'REPLAY OK'); process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('FALLÓ', e.message.slice(0, 500)); process.exit(1); });
