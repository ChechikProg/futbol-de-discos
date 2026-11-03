// Prueba en navegador real: inicio, partido local, Mundial. Guarda capturas.
const { chromium } = require('playwright');
const OUT = process.env.SHOTS || '/tmp/claude-0/-home-claude/076ee193-bcaa-50b1-85a6-0bef0beeee81/scratchpad/shots';
require('fs').mkdirSync(OUT, { recursive: true });
const URL = process.env.URL || 'http://127.0.0.1:3100/';
const errors = [];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 } });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(URL);
  await page.waitForSelector('.mode');
  await page.screenshot({ path: OUT + '/01-home.png' });

  // --- contra la máquina ---
  await page.click('.mode >> nth=0');
  await page.waitForSelector('#lc-pitch-custom', { state: 'attached' });
  await page.click('label[for="lc-size-2"]');
  await page.click('label[for="lc-diff-hard"]');
  await page.click('label[for="lc-pitch-big"]');
  await page.screenshot({ path: OUT + '/02-local.png' });
  await page.click('label[for="lc-pitch-custom"]');
  await page.screenshot({ path: OUT + '/03-local-custom.png' });
  await page.click('label[for="lc-pitch-classic"]');
  await page.click('#local .btn.go');
  await page.waitForTimeout(500);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(1200);
  await page.keyboard.up('ArrowRight');
  await page.screenshot({ path: OUT + '/04-local-game.png' });
  const st = await page.evaluate(() => ({ tick: game.tick, state, mode, n: game.players.length, x: game.players.find(p => p.human).x }));
  console.log('local:', JSON.stringify(st));
  if (st.tick < 50 || st.n !== 4 || st.x < -200) errors.push('el juego local no avanza: ' + JSON.stringify(st));
  // pausa
  await page.keyboard.press('KeyP');
  await page.waitForSelector('#pause:not([hidden])');
  await page.screenshot({ path: OUT + '/05-pause.png' });
  await page.click('#pause .btn.go');
  // terminar rápido el partido
  await page.evaluate(() => { game.cfg.timeLimit = 0; game.cfg.scoreLimit = 1; game.phase = 'play'; game.ball.x = 9999; let n = 0; while (!game.over && n++ < 2000) step(game); });
  await page.waitForSelector('#end:not([hidden])', { timeout: 5000 });
  await page.screenshot({ path: OUT + '/06-local-end.png' });
  await page.click('#end .btn >> text=Inicio');

  // --- Mundial ---
  await page.click('.mode >> nth=2');
  await page.waitForSelector('text=Elegir mi selección');
  await page.click('label[for="wc-diff-prog"]');
  await page.screenshot({ path: OUT + '/07-wc-setup.png' });
  await page.click('text=Elegir mi selección');
  await page.waitForSelector('.team');
  await page.screenshot({ path: OUT + '/08-wc-team.png' });
  await page.click('.team:has-text("Argentina")');
  await page.click('text=Sortear grupos');
  await page.waitForSelector('.next');
  await page.screenshot({ path: OUT + '/09-wc-hub.png' });
  const wcInfo = await page.evaluate(() => ({ groups: wc.groups.length, user: wc.user, pend: WC.pending(wc).label, diff: WC.diffFor(wc) }));
  console.log('wc:', JSON.stringify(wcInfo));
  if (wcInfo.groups !== 12) errors.push('grupos != 12');
  await page.click('text=Grupos >> nth=0').catch(() => {});
  await page.click('.tab:has-text("Grupos")');
  await page.screenshot({ path: OUT + '/10-wc-groups.png', fullPage: false });

  // jugar el partido 1 y ganarlo rápido
  await page.click('.tab:has-text("Partido")');
  await page.click('text=Jugar partido');
  await page.waitForTimeout(400);
  await page.screenshot({ path: OUT + '/11-wc-game.png' });
  await page.evaluate(() => { game.score[1] = 1; game.cfg.timeLimit = 1; game.phase = 'play'; game.playTicks = 3600 * 5; game.ball.x = 9999; let n = 0; while (!game.over && n++ < 2000) step(game); });
  await page.waitForSelector('#end:not([hidden])', { timeout: 5000 });
  await page.screenshot({ path: OUT + '/12-wc-end.png' });
  await page.click('#end .btn.go');
  await page.waitForSelector('.next');
  const after = await page.evaluate(() => ({ md: wc.md, step: wc.step, last: wc.last && wc.last.title, diff: WC.diffFor(wc) }));
  console.log('tras partido 1:', JSON.stringify(after));
  if (after.md !== 1) errors.push('no avanzó la fecha');
  await page.screenshot({ path: OUT + '/13-wc-hub2.png' });

  // simular hasta eliminatorias y mirar llaves
  await page.evaluate(() => { while (WC.pending(wc) && wc.stage === 'groups') WC.simUser(wc); saveWc(); renderHub(); });
  await page.click('.tab:has-text("Llaves")');
  await page.waitForSelector('.bracket');
  await page.screenshot({ path: OUT + '/14-wc-bracket.png' });
  const ko = await page.evaluate(() => ({ stage: wc.stage, out: wc.out, rounds: wc.ko.rounds.length }));
  console.log('ko:', JSON.stringify(ko));

  // recargar: el torneo se conserva
  await page.reload();
  await page.waitForSelector('.mode');
  await page.click('.mode >> nth=2');
  await page.waitForSelector('.resume');
  await page.screenshot({ path: OUT + '/15-wc-resume.png' });
  await page.click('.resume >> text=Continuar');
  await page.waitForSelector('.tabs');

  // terminar el torneo
  await page.evaluate(() => { while (WC.pending(wc)) { WC.submitUser(wc, 3, 0); } WC.simulateRest(wc); saveWc(); hubTab = 'match'; renderHub(); });
  await page.screenshot({ path: OUT + '/16-wc-final.png' });
  const fin = await page.evaluate(() => ({ stage: wc.stage, exit: wc.exit, champion: wc.champion }));
  console.log('final:', JSON.stringify(fin));

  // celular
  const phone = await browser.newContext({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });
  const p2 = await phone.newPage();
  p2.on('pageerror', e => errors.push('phone pageerror: ' + e.message));
  await p2.goto(URL);
  await p2.waitForSelector('.mode');
  await p2.screenshot({ path: OUT + '/17-phone-home.png' });
  await p2.click('.mode >> nth=0');
  await p2.screenshot({ path: OUT + '/18-phone-local.png', fullPage: false });
  const over = await p2.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1 || document.body.scrollWidth > window.innerWidth + 1);
  if (over) errors.push('scroll horizontal en celular');
  await p2.click('label[for="lc-pitch-custom"]');
  const over2 = await p2.evaluate(() => [...document.querySelectorAll('.screen:not([hidden]) *')].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1).map(e => e.className || e.tagName).slice(0, 5));
  if (over2.length) errors.push('desborda en celular: ' + over2.join(','));

  await browser.close();
  console.log(errors.length ? 'ERRORES:\n' + errors.join('\n') : 'BROWSER1 OK');
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('FALLÓ', e); process.exit(1); });
