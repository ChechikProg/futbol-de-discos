// En el navegador: un partido empatado se define por penales (partido suelto y eliminación del Mundial).
const { chromium } = require('playwright');
const OUT = process.env.SHOTS || '/tmp/claude-0/-home-claude/076ee193-bcaa-50b1-85a6-0bef0beeee81/scratchpad/shots';
require('fs').mkdirSync(OUT, { recursive: true });
const URL = process.env.URL || 'http://127.0.0.1:3100/';
const errors = [];

// juega la tanda haciendo clic en el arco hasta que aparezca "Continuar"
async function playShootout(page, tag) {
  await page.waitForSelector('#pens:not([hidden])', { timeout: 8000 });
  let shots = 0, shot = false, keeps = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    if (await page.$('#pens .pk-foot .btn')) break;
    const cells = await page.$$('#pens .pk-cell');
    if (cells.length) {
      if (cells.length === 6) shots++; else keeps++;
      const i = Math.floor(Math.random() * cells.length);
      if (!shot && cells.length === 6) { await page.screenshot({ path: OUT + '/20-pens-' + tag + '.png' }); shot = true; }
      await cells[i].click().catch(() => {});
      await page.waitForTimeout(60);
    } else await page.waitForTimeout(40);
  }
  const res = await page.evaluate(() => ({
    info: document.querySelector('#pens .pk-info').textContent,
    nums: [...document.querySelectorAll('#pens .pk-team em')].map(e => +e.textContent)
  }));
  await page.screenshot({ path: OUT + '/21-pens-fin-' + tag + '.png' });
  console.log(tag + ': tiros míos', shots, '| atajadas mías', keeps, '|', res.info, res.nums.join('–'));
  if (res.nums[0] === res.nums[1]) errors.push(tag + ': la tanda terminó igualada');
  if (shots < 3 || keeps < 3) errors.push(tag + ': tiros ' + shots + ' atajadas ' + keeps);
  if ((res.nums[0] > res.nums[1]) !== /Ganaste/.test(res.info)) errors.push(tag + ': el mensaje no coincide con el marcador');
  return res;
}


(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 760 } })).newPage();
  await page.addInitScript(() => { window.PK_SCALE = 0.05; });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(URL);
  await page.waitForSelector('.mode');
  const modes = await page.$$eval('.mode .mode-t', els => els.map(e => e.textContent));
  console.log('modos:', modes.join(' | '));
  if (modes.length !== 2 || modes.some(m => /online/i.test(m))) errors.push('el inicio debería tener solo 2 modos: ' + modes);

  // --- partido suelto empatado ---
  await page.click('.mode >> nth=0');
  await page.click('label[for="lc-time-3"]');
  await page.click('#local .btn.go');
  await page.waitForTimeout(300);
  await page.evaluate(() => { game.score = [2, 2]; game.phase = 'play'; game.ball.x = 0; game.ball.y = 0; game.ball.vx = game.ball.vy = 0; game.playTicks = game.cfg.timeLimit * 3600 - 1; });
  await page.waitForSelector('#pens:not([hidden])', { timeout: 8000 });
  const tied = await page.evaluate(() => ({ tied: game.tied, over: game.over, score: game.score }));
  console.log('empate:', JSON.stringify(tied));
  if (!tied.tied || !tied.over) errors.push('el empate no marcó penales');
  const r1 = await playShootout(page, 'local');
  await page.click('#pens .pk-foot .btn');
  await page.waitForSelector('#end:not([hidden])', { timeout: 5000 });
  const end1 = await page.evaluate(() => ({ title: document.getElementById('endTitle').textContent, meta: document.getElementById('endMeta').textContent, score: document.getElementById('endScore').textContent }));
  console.log('fin:', JSON.stringify(end1));
  if (!/penales/.test(end1.meta)) errors.push('el resultado no menciona penales');
  if ((r1.nums[0] > r1.nums[1]) !== /Ganaste/.test(end1.title)) errors.push('el título final no coincide con la tanda');
  await page.screenshot({ path: OUT + '/22-end-pens.png' });
  await page.click('#end .btn >> text=Inicio');

  // un partido ganado normalmente no pasa por penales
  await page.click('.mode >> nth=0');
  await page.click('#local .btn.go');
  await page.waitForTimeout(300);
  await page.evaluate(() => { game.score = [3, 1]; game.phase = 'play'; game.playTicks = game.cfg.timeLimit * 3600 - 1; });
  await page.waitForSelector('#end:not([hidden])', { timeout: 5000 });
  if (await page.$('#pens:not([hidden])')) errors.push('con ganador no debería haber penales');
  await page.click('#end .btn >> text=Inicio');

  // --- Mundial: eliminación directa empatada ---
  await page.click('.mode >> nth=1');
  await page.click('text=Elegir mi selección');
  await page.click('.team:has-text("Argentina")');
  await page.click('text=Sortear grupos');
  await page.waitForSelector('.next');
  await page.evaluate(() => { while (WC.pending(wc) && WC.pending(wc).kind === 'group') WC.submitUser(wc, 3, 0); saveWc(); hubTab = 'match'; renderHub(); });
  const before = await page.evaluate(() => ({ stage: wc.stage, label: WC.pending(wc).label, kind: WC.pending(wc).kind }));
  console.log('Mundial antes:', JSON.stringify(before));
  if (before.kind !== 'ko') errors.push('debería tocar eliminación directa');
  await page.click('text=Jugar partido');
  await page.waitForTimeout(300);
  await page.evaluate(() => { game.score = [1, 1]; game.phase = 'play'; game.ball.x = 0; game.ball.y = 0; game.ball.vx = game.ball.vy = 0; game.playTicks = game.cfg.timeLimit * 3600 - 1; });
  const r2 = await playShootout(page, 'wc');
  await page.click('#pens .pk-foot .btn');
  await page.waitForSelector('#end:not([hidden])', { timeout: 5000 });
  const end2 = await page.evaluate(() => ({ title: document.getElementById('endTitle').textContent, meta: document.getElementById('endMeta').textContent }));
  console.log('fin Mundial:', JSON.stringify(end2));
  const wcs = await page.evaluate(() => { const r = wc.ko.rounds[0]; const m = r.matches.find(x => x.a === wc.user || x.b === wc.user); return { pen: m.pen, w: m.w, user: wc.user, out: wc.out, a: m.a }; });
  console.log('partido guardado:', JSON.stringify(wcs));
  const userWon = r2.nums[0] > r2.nums[1];
  if (!wcs.pen) errors.push('el Mundial no guardó los penales');
  else {
    const up = wcs.a === wcs.user ? wcs.pen[0] : wcs.pen[1], op = wcs.a === wcs.user ? wcs.pen[1] : wcs.pen[0];
    if (up !== r2.nums[0] || op !== r2.nums[1]) errors.push('penales guardados distintos: ' + JSON.stringify(wcs.pen));
  }
  if ((wcs.w === wcs.user) !== userWon) errors.push('ganador del cruce no coincide con los penales');
  if (wcs.out === userWon) errors.push('eliminación incorrecta: out=' + wcs.out + ' userWon=' + userWon);
  await page.click('#end .btn.go');
  await page.waitForSelector('.tabs');
  await page.screenshot({ path: OUT + '/23-wc-after-pens.png' });

  // celular: la tanda entra en pantalla
  const phone = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
  const p2 = await phone.newPage();
  await p2.addInitScript(() => { window.PK_SCALE = 0.05; });
  p2.on('pageerror', e => errors.push('phone pageerror: ' + e.message));
  await p2.goto(URL); await p2.waitForSelector('.mode');
  await p2.click('.mode >> nth=0'); await p2.click('#local .btn.go'); await p2.waitForTimeout(300);
  await p2.evaluate(() => { game.score = [0, 0]; game.phase = 'play'; game.ball.x = 0; game.playTicks = game.cfg.timeLimit * 3600 - 1; });
  await p2.waitForSelector('#pens:not([hidden])');
  await p2.waitForSelector('#pens .pk-cell');
  await p2.screenshot({ path: OUT + '/24-pens-phone.png' });
  const over = await p2.evaluate(() => [...document.querySelectorAll('#pens *')].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1).map(e => e.className).slice(0, 4));
  if (over.length) errors.push('la tanda desborda en celular: ' + over.join(','));

  await browser.close();
  console.log(errors.length ? 'ERRORES:\n' + errors.join('\n') : 'BROWSER_PENS OK');
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('FALLÓ', e.message.slice(0, 600)); process.exit(1); });
