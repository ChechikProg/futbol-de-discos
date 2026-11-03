// En el navegador: gol de oro de 1 minuto y penales (partido suelto y eliminación del Mundial); la fase de grupos no los usa.
const { chromium } = require('playwright');
const OUT = process.env.SHOTS || '/tmp/claude-0/-home-claude/076ee193-bcaa-50b1-85a6-0bef0beeee81/scratchpad/shots';
require('fs').mkdirSync(OUT, { recursive: true });
const URL = process.env.URL || 'http://127.0.0.1:3100/';
const errors = [];

const tie = (s0, s1) => `(() => { game.score = [${s0}, ${s1}]; game.phase = 'play'; game.ball.x = 0; game.ball.y = 0; game.ball.vx = game.ball.vy = 0; game.playTicks = game.cfg.timeLimit * 3600 - 1; })()`;

// corre y patea con las teclas (cuando toca atajar, solo mueve al arquero) hasta que aparece "Continuar"
async function playShootout(page, tag) {
  await page.waitForFunction(() => typeof PK !== 'undefined' && PK.cur && mode === 'pens', null, { timeout: 8000 });
  await page.keyboard.down('ArrowRight'); await page.keyboard.down('Space');
  let shotShot = false, whoSeen = new Set(), kicks = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 150000) {
    const st = await page.evaluate(() => PK.cur ? { done: PK.cur.done, phase: PK.cur.phase, who: PK.cur.who, ticks: PK.cur.kick.ticks, n: PK.cur.S.u.length + PK.cur.S.c.length } : { done: true });
    if (st.done) break;
    whoSeen.add(st.who); kicks = st.n;
    if (!shotShot && st.phase === 'live' && st.ticks > 20) { await page.screenshot({ path: OUT + '/20-pens-' + tag + '.png' }); shotShot = true; }
    await page.waitForTimeout(120);
  }
  await page.keyboard.up('ArrowRight'); await page.keyboard.up('Space');
  await page.waitForSelector('#pens:not([hidden]) .btn', { timeout: 5000 });
  const res = await page.evaluate(() => ({ title: document.querySelector('#pens #endTitle').textContent, nums: [...document.querySelectorAll('#pens #endScore b')].map(b => +b.textContent) }));
  await page.screenshot({ path: OUT + '/21-pens-fin-' + tag + '.png' });
  console.log(tag + ': tiros', kicks, '| roles vistos', [...whoSeen].join(','), '|', res.title, res.nums.join('–'));
  if (res.nums[0] === res.nums[1]) errors.push(tag + ': la tanda terminó igualada');
  if (whoSeen.size < 2) errors.push(tag + ': no hubo tiros y atajadas');
  if ((res.nums[0] > res.nums[1]) !== /Ganaste/.test(res.title)) errors.push(tag + ': el mensaje no coincide con el marcador');
  return res;
}

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 760 } })).newPage();
  await page.addInitScript(() => { window.PK_SPEED = 6; });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(URL);
  await page.waitForSelector('.mode');
  const modes = await page.$$eval('.mode .mode-t', els => els.map(e => e.textContent));
  console.log('modos:', modes.join(' | '));
  if (modes.length !== 3 || modes.some(m => /online/i.test(m)) || !modes.includes('Probar penales')) errors.push('el inicio debería tener 3 modos sin online: ' + modes);

  // --- partido suelto empatado: gol de oro y después penales ---
  await page.click('.mode >> nth=0');
  await page.click('label[for="lc-time-3"]');
  await page.click('#local .btn.go');
  await page.waitForTimeout(300);
  await page.evaluate(tie(2, 2));
  await page.waitForFunction(() => game.overtime, null, { timeout: 5000 });
  const ot = await page.evaluate(() => ({ over: game.over, tied: game.tied, left: C.goldenTicks - game.otTicks }));
  console.log('gol de oro:', JSON.stringify(ot));
  if (ot.over || ot.left < 3000 || ot.left > 3600) errors.push('el gol de oro debería durar 1 minuto: ' + JSON.stringify(ot));
  await page.screenshot({ path: OUT + '/19-golden.png' });
  await page.evaluate(() => { game.otTicks = C.goldenTicks - 4; game.ball.x = 0; game.ball.y = 0; game.ball.vx = game.ball.vy = 0; });
  await page.waitForFunction(() => game && game.over && game.tied, null, { timeout: 5000 });
  const r1 = await playShootout(page, 'local');
  await page.click('#pens .btn');
  await page.waitForSelector('#end:not([hidden])', { timeout: 5000 });
  const end1 = await page.evaluate(() => ({ title: document.getElementById('endTitle').textContent, meta: document.getElementById('endMeta').textContent, score: document.getElementById('endScore').textContent }));
  console.log('fin:', JSON.stringify(end1));
  if (!/penales/.test(end1.meta)) errors.push('el resultado no menciona penales');
  if ((r1.nums[0] > r1.nums[1]) !== /Ganaste/.test(end1.title)) errors.push('el título final no coincide con la tanda');
  await page.click('#end .btn >> text=Inicio');

  // --- gol de oro convertido: termina el partido, sin penales ---
  await page.click('.mode >> nth=0');
  await page.click('#local .btn.go');
  await page.waitForTimeout(300);
  await page.evaluate(tie(1, 1));
  await page.waitForFunction(() => game.overtime, null, { timeout: 5000 });
  await page.evaluate(() => { game.ball.x = game.geo.W + 5; game.ball.y = 0; game.ball.vx = game.ball.vy = 0; });
  await page.waitForSelector('#end:not([hidden])', { timeout: 8000 });
  const end2 = await page.evaluate(() => ({ title: document.getElementById('endTitle').textContent, meta: document.getElementById('endMeta').textContent, score: document.getElementById('endScore').textContent, pens: !!PK.cur }));
  console.log('gol de oro anotado:', JSON.stringify(end2));
  if (end2.score !== '2–1' || !/Ganaste/.test(end2.title) || !/gol de oro/.test(end2.meta) || end2.pens) errors.push('el gol de oro no definió el partido: ' + JSON.stringify(end2));
  await page.click('#end .btn >> text=Inicio');

  // un partido ganado en tiempo normal no pasa por gol de oro ni penales
  await page.click('.mode >> nth=0');
  await page.click('#local .btn.go');
  await page.waitForTimeout(300);
  await page.evaluate(tie(3, 1));
  await page.waitForSelector('#end:not([hidden])', { timeout: 5000 });
  if (await page.evaluate(() => game.overtime)) errors.push('con ganador no debería haber gol de oro');
  await page.click('#end .btn >> text=Inicio');

  // --- práctica de penales desde el inicio ---
  await page.click('.mode >> nth=2');
  await page.click('label[for="pt-penFirst-c"]');
  await page.click('#pentest .btn.go');
  await page.waitForFunction(() => PK.cur && PK.cur.S.first === 'c' && PK.cur.who === 'c', null, { timeout: 5000 });
  const r3 = await playShootout(page, 'practica');
  await page.click('#pens .btn');
  await page.waitForSelector('#end:not([hidden])', { timeout: 5000 });
  const end4 = await page.evaluate(() => ({ title: document.getElementById('endTitle').textContent, meta: document.getElementById('endMeta').textContent }));
  console.log('fin práctica:', JSON.stringify(end4));
  if (!/Práctica/.test(end4.meta) || (r3.nums[0] > r3.nums[1]) !== /Ganaste/.test(end4.title)) errors.push('resultado de la práctica incorrecto');
  await page.click('#end .btn >> text=Inicio');

  // --- Mundial ---
  await page.click('.mode >> nth=1');
  await page.click('text=Elegir mi selección');
  await page.click('.team:has-text("Argentina")');
  await page.click('text=Sortear grupos');
  await page.waitForSelector('.next');
  // fase de grupos: el empate queda empate (ni gol de oro ni penales)
  await page.click('text=Jugar partido');
  await page.waitForTimeout(300);
  await page.evaluate(tie(1, 1));
  await page.waitForSelector('#end:not([hidden])', { timeout: 5000 });
  const g1 = await page.evaluate(() => ({ title: document.getElementById('endTitle').textContent, overtime: game.overtime, tied: game.tied }));
  console.log('grupos empatado:', JSON.stringify(g1));
  if (g1.title !== 'Empate' || g1.overtime || g1.tied) errors.push('en grupos el empate no debe ir a gol de oro ni penales: ' + JSON.stringify(g1));
  await page.click('#end .btn.go');
  await page.waitForSelector('.tabs');
  // eliminación directa empatada
  await page.evaluate(() => { while (WC.pending(wc) && WC.pending(wc).kind === 'group') WC.submitUser(wc, 3, 0); saveWc(); hubTab = 'match'; renderHub(); });
  const before = await page.evaluate(() => ({ label: WC.pending(wc).label, kind: WC.pending(wc).kind }));
  console.log('Mundial antes:', JSON.stringify(before));
  if (before.kind !== 'ko') errors.push('debería tocar eliminación directa');
  await page.click('text=Jugar partido');
  await page.waitForTimeout(300);
  await page.evaluate(tie(1, 1));
  await page.waitForFunction(() => game.overtime, null, { timeout: 5000 });
  await page.evaluate(() => { game.otTicks = C.goldenTicks - 4; game.ball.x = 0; game.ball.y = 0; game.ball.vx = game.ball.vy = 0; });
  const r2 = await playShootout(page, 'wc');
  await page.click('#pens .btn');
  await page.waitForSelector('#end:not([hidden])', { timeout: 5000 });
  const end3 = await page.evaluate(() => ({ title: document.getElementById('endTitle').textContent, meta: document.getElementById('endMeta').textContent }));
  console.log('fin Mundial:', JSON.stringify(end3));
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

  // celular: la escena de penales se dibuja y no desborda
  const phone = await browser.newContext({ viewport: { width: 780, height: 380 }, hasTouch: true, isMobile: true });
  const p2 = await phone.newPage();
  p2.on('pageerror', e => errors.push('phone pageerror: ' + e.message));
  await p2.goto(URL); await p2.waitForSelector('.mode');
  await p2.click('.mode >> nth=0'); await p2.click('#local .btn.go'); await p2.waitForTimeout(300);
  await p2.evaluate(tie(0, 0));
  await p2.waitForFunction(() => game.overtime, null, { timeout: 5000 });
  await p2.evaluate(() => { game.otTicks = C.goldenTicks - 4; });
  await p2.waitForFunction(() => typeof PK !== 'undefined' && PK.cur && PK.cur.phase === 'live' || false, null, { timeout: 15000 });
  await p2.waitForTimeout(600);
  await p2.screenshot({ path: OUT + '/24-pens-phone.png' });

  await browser.close();
  console.log(errors.length ? 'ERRORES:\n' + errors.join('\n') : 'BROWSER_PENS OK');
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('FALLÓ', e.message.slice(0, 700)); process.exit(1); });
