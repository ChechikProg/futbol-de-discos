// En el navegador: pedir la pelota (tecla E y botón en celular) y tamaño de cancha en la Libertadores.
const { chromium } = require('playwright');
const OUT = process.env.SHOTS || '/tmp/claude-0/-home-claude/076ee193-bcaa-50b1-85a6-0bef0beeee81/scratchpad/shots';
require('fs').mkdirSync(OUT, { recursive: true });
const URL = process.env.URL || 'http://127.0.0.1:3100/';
const errors = [];
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 760 } })).newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(URL); await page.waitForSelector('.mode');
  // 2v2 contra la máquina: pedir con E
  await page.click('.mode >> nth=0');
  await page.click('label[for="lc-size-2"]');
  await page.click('#local .btn.go');
  await page.waitForTimeout(400);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(150);
  const c = await page.evaluate(() => ({ call: !!game.call && game.call.p.human, until: game.call && game.call.until - game.tick }));
  console.log('pedido con E:', JSON.stringify(c));
  if (!c.call) errors.push('la tecla E no pidió la pelota');
  await page.screenshot({ path: OUT + '/50-pedir.png' });
  await page.keyboard.press('KeyP'); await page.click('#pause .btn >> text=Cambiar opciones');
  // 1v1: no hace nada
  await page.click('label[for="lc-size-1"]'); await page.click('#local .btn.go'); await page.waitForTimeout(300);
  await page.keyboard.press('KeyE');
  if (await page.evaluate(() => !!game.call)) errors.push('en 1v1 no debería haber pedido');
  await page.keyboard.press('KeyP'); await page.click('#pause .btn >> text=Cambiar opciones'); await page.click('.topbar .back');

  // Libertadores 3v3 con cancha enorme
  await page.click('.mode:has-text("Copa Libertadores")');
  await page.click('label[for="lb-size-3"]');
  await page.click('label[for="lb-field-huge"]');
  await page.click('#libsetup .btn.go');
  await page.waitForSelector('#libteam:not([hidden]) .team');
  await page.click('#libteam .team:has-text("Boca Juniors")');
  await page.click('text=Sortear grupos');
  await page.waitForSelector('#libhub:not([hidden]) .next');
  await page.click('#libhub .btn.go:has-text("Jugar partido")');
  await page.waitForTimeout(600);
  const g = await page.evaluate(() => ({ W: game.geo.W, H: game.geo.H, gh: game.geo.gh, base: game.cfg.stadium.pitch, st: game.cfg.stadium.n }));
  console.log('cancha enorme:', JSON.stringify(g));
  if (!(g.W > g.base.W * 1.5 && g.H > g.base.H * 1.5)) errors.push('la cancha no se agrandó');
  await page.screenshot({ path: OUT + '/51-lib-enorme-' + g.st.replace(/\W+/g, '_') + '.png' });

  // celular: botón Pedir en 2v2
  const phone = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const p2 = await phone.newPage();
  p2.on('pageerror', e => errors.push('phone: ' + e.message));
  await p2.goto(URL); await p2.waitForSelector('.mode');
  await p2.click('.mode >> nth=0'); await p2.click('label[for="lc-size-2"]'); await p2.click('#local .btn.go'); await p2.waitForTimeout(400);
  const vis = await p2.evaluate(() => getComputedStyle(document.getElementById('callBtn')).display !== 'none' && !document.getElementById('touch').hidden);
  if (!vis) errors.push('no se ve el botón Pedir en celular');
  await p2.tap('#callBtn');
  await p2.waitForTimeout(100);
  if (!(await p2.evaluate(() => !!game.call))) errors.push('el botón Pedir no pidió la pelota');
  await p2.screenshot({ path: OUT + '/52-pedir-celular.png' });
  await browser.close();
  console.log(errors.length ? 'ERRORES:\n' + errors.join('\n') : 'BROWSER_CALL OK');
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('FALLÓ', e.message.slice(0, 600)); process.exit(1); });
