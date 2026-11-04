// En el navegador: modo Copa Libertadores (equipo, sorteo, estadios, nombres reales, ida y vuelta, gol de oro y penales).
const { chromium } = require('playwright');
const OUT = process.env.SHOTS || '/tmp/claude-0/-home-claude/076ee193-bcaa-50b1-85a6-0bef0beeee81/scratchpad/shots';
require('fs').mkdirSync(OUT, { recursive: true });
const URL = process.env.URL || 'http://127.0.0.1:3100/';
const errors = [];

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 760 } })).newPage();
  await page.addInitScript(() => { window.PK_SPEED = 6; });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(URL);
  await page.waitForSelector('.mode');
  await page.screenshot({ path: OUT + '/30-home.png' });
  await page.click('.mode:has-text("Copa Libertadores")');
  await page.waitForSelector('#libsetup:not([hidden])');
  await page.click('label[for="lb-size-3"]');
  await page.screenshot({ path: OUT + '/31-lib-setup.png' });
  await page.click('#libsetup .btn.go');
  await page.waitForSelector('#libteam:not([hidden]) .team');
  await page.click('.chip:has-text("Argentina")');
  const argTeams = await page.$$eval('#libteam .team .tn', els => els.map(e => e.textContent));
  console.log('equipos argentinos:', argTeams.join(', '));
  for (const t of ['Boca Juniors', 'River Plate', 'Racing Club']) if (!argTeams.includes(t)) errors.push('falta ' + t);
  await page.click('#libteam .team:has-text("Boca Juniors")');
  await page.screenshot({ path: OUT + '/32-lib-team.png' });
  await page.click('text=Sortear grupos');
  await page.waitForSelector('#libhub:not([hidden]) .next');
  await page.screenshot({ path: OUT + '/33-lib-hub.png' });
  const info = await page.evaluate(() => ({ groups: lib.groups.length, sizes: lib.groups.map(g => g.teams.length), p: LIB.pending(lib) }));
  console.log('grupos:', info.groups, '| primer partido:', info.p.label, '·', info.p.stadium.n, '| local:', info.p.home);
  if (info.groups !== 8 || info.sizes.some(n => n !== 4)) errors.push('grupos mal armados');

  // jugar el primer partido: estadio y nombres reales en la cancha
  await page.click('#libhub .btn.go:has-text("Jugar partido")');
  await page.waitForTimeout(700);
  const g1 = await page.evaluate(() => ({ stadium: game.cfg.stadium.n, names: game.players.map(p => p.team + ':' + p.name), pitch: [game.geo.W, game.geo.H] }));
  console.log('partido 1:', JSON.stringify(g1));
  if (!g1.names.includes('0:Paredes') || !g1.names.includes('0:Merentiel')) errors.push('los compañeros no tienen los nombres de Boca: ' + g1.names);
  await page.screenshot({ path: OUT + '/34-lib-match-' + g1.stadium.replace(/\W+/g, '_') + '.png' });
  await page.evaluate(() => { game.score = [1, 1]; game.phase = 'play'; game.ball.x = 0; game.ball.y = 0; game.ball.vx = game.ball.vy = 0; game.playTicks = game.cfg.timeLimit * 3600 - 1; });
  await page.waitForSelector('#end:not([hidden])', { timeout: 5000 });
  const e1 = await page.evaluate(() => ({ title: document.getElementById('endTitle').textContent, overtime: game.overtime }));
  if (e1.title !== 'Empate' || e1.overtime) errors.push('en grupos el empate queda: ' + JSON.stringify(e1));
  await page.click('#end .btn.go');
  await page.waitForSelector('#libhub:not([hidden])');

  // mostrar los estadios más representativos
  for (const c of ['BOC', 'RIV', 'RAC', 'FLA', 'BOL', 'EST', 'LGU']) {
    await page.evaluate(code => {
      const st = LIB.stadiumOf(code), opp = code === 'RIV' ? 'BOC' : 'RIV';
      launchGame({ size: 3, diff: 'normal', humanTeam: 0, timeLimit: 2, scoreLimit: 0, allowDraw: true, pitch: st.pitch, stadium: st,
        roster: [{ team: 0, human: true, name: 'Vos' }, { team: 0, name: LIB.BY[code].p[0] }, { team: 0, name: LIB.BY[code].p[1] }, { team: 1, name: LIB.BY[opp].p[0] }, { team: 1, name: LIB.BY[opp].p[1] }, { team: 1, name: LIB.BY[opp].p[2] }],
        teamNames: [LIB.BY[code].n, LIB.BY[opp].n], teamCodes: [code, opp], kits: LIB.kitsFor(code, opp), subtitle: st.n }, 'lib', () => {}, () => []);
    }, c);
    await page.waitForTimeout(500);
    await page.screenshot({ path: OUT + '/35-estadio-' + c + '.png' });
    await page.evaluate(() => { onLocalEnd = null; setState('idle'); });
  }
  await page.evaluate(() => { const st = LIB.finalStadium('BOC', 'FLA'); launchGame({ size: 2, diff: 'normal', humanTeam: 0, timeLimit: 2, scoreLimit: 0, pitch: st.pitch, stadium: st, teamNames: ['Boca Juniors', 'Flamengo'], teamCodes: ['BOC', 'FLA'], kits: LIB.kitsFor('BOC', 'FLA'), subtitle: 'Final · ' + st.n }, 'lib', () => {}, () => []); });
  await page.waitForTimeout(500);
  await page.screenshot({ path: OUT + '/35-estadio-final.png' });
  await page.evaluate(() => { onLocalEnd = null; setState('idle'); renderLibHub(); showScreen('libhub'); });

  // llegar a octavos ganando todo, jugar la ida y la vuelta con global igualado
  await page.evaluate(() => { while (LIB.pending(lib) && LIB.pending(lib).kind === 'group') LIB.submitUser(lib, 3, 0); saveLib(); libTab = 'match'; renderLibHub(); });
  const ko = await page.evaluate(() => { const p = LIB.pending(lib); return p && { label: p.label, leg: p.leg, home: p.home, stadium: p.stadium.n }; });
  console.log('octavos ida:', JSON.stringify(ko));
  if (!ko || ko.leg !== 0) errors.push('debería tocar la ida de octavos');
  await page.click('#libhub .btn.go:has-text("Jugar partido")');
  await page.waitForTimeout(400);
  await page.evaluate(() => { game.score = [0, 1]; game.phase = 'play'; game.ball.x = 0; game.ball.y = 0; game.ball.vx = game.ball.vy = 0; game.playTicks = game.cfg.timeLimit * 3600 - 1; });
  await page.waitForSelector('#end:not([hidden])', { timeout: 5000 });
  const ida = await page.evaluate(() => ({ title: document.getElementById('endTitle').textContent, overtime: game.overtime }));
  console.log('ida:', JSON.stringify(ida));
  if (ida.title !== 'Perdiste' || ida.overtime) errors.push('la ida no debe ir a gol de oro');
  await page.click('#end .btn.go');
  await page.waitForSelector('#libhub:not([hidden]) .next');
  await page.screenshot({ path: OUT + '/36-lib-vuelta.png' });
  const vuelta = await page.evaluate(() => { const p = LIB.pending(lib); return p && { label: p.label, leg: p.leg, agg: p.agg, home: p.home }; });
  console.log('vuelta:', JSON.stringify(vuelta));
  if (!vuelta || vuelta.leg !== 1) errors.push('debería tocar la vuelta');
  await page.click('#libhub .btn.go:has-text("Jugar partido")');
  await page.waitForTimeout(400);
  const aggIn = await page.evaluate(() => game.cfg.agg);
  if (!aggIn || aggIn[0] !== 0 || aggIn[1] !== 1) errors.push('el global de la ida no llegó al partido: ' + JSON.stringify(aggIn));
  // gano 1-0: global 1-1 -> gol de oro -> nadie convierte -> penales
  await page.evaluate(() => { game.score = [1, 0]; game.phase = 'play'; game.ball.x = 0; game.ball.y = 0; game.ball.vx = game.ball.vy = 0; game.playTicks = game.cfg.timeLimit * 3600 - 1; });
  await page.waitForFunction(() => game.overtime, null, { timeout: 5000 });
  await page.screenshot({ path: OUT + '/37-lib-golden.png' });
  await page.evaluate(() => { game.otTicks = C.goldenTicks - 4; game.ball.x = 0; game.ball.y = 0; game.ball.vx = game.ball.vy = 0; });
  await page.waitForFunction(() => typeof PK !== 'undefined' && PK.cur && mode === 'pens', null, { timeout: 8000 });
  await page.keyboard.down('ArrowRight');
  const t0 = Date.now();
  while (Date.now() - t0 < 150000) { if (await page.evaluate(() => !PK.cur || PK.cur.done)) break; await page.waitForTimeout(150); }
  await page.keyboard.up('ArrowRight');
  await page.waitForSelector('#pens:not([hidden]) .btn', { timeout: 5000 });
  const pens = await page.evaluate(() => [...document.querySelectorAll('#pens #endScore b')].map(b => +b.textContent));
  await page.click('#pens .btn');
  await page.waitForSelector('#end:not([hidden])', { timeout: 5000 });
  const fin = await page.evaluate(() => ({ title: document.getElementById('endTitle').textContent, meta: document.getElementById('endMeta').textContent }));
  const tie = await page.evaluate(() => { const r = lib.ko.rounds[0]; const t = r.ties.find(x => x.t1 === lib.user || x.t2 === lib.user); return { pen: t.pen, w: t.w, agg: LIB.aggregate(t), t1: t.t1, out: lib.out }; });
  console.log('penales', pens.join('–'), '|', JSON.stringify(fin), '|', JSON.stringify(tie));
  const userWon = pens[0] > pens[1];
  if ((tie.w === 'BOC') !== userWon || tie.out === userWon) errors.push('la llave no respeta los penales');
  if (!/global 1–1/.test(fin.meta) || !/penales/.test(fin.meta)) errors.push('el resumen no muestra global y penales: ' + fin.meta);
  await page.click('#end .btn.go');
  await page.waitForSelector('#libhub:not([hidden])');
  await page.click('.tab:has-text("Llaves")');
  await page.screenshot({ path: OUT + '/38-lib-llaves.png' });
  await page.click('.tab:has-text("Grupos")');
  await page.screenshot({ path: OUT + '/39-lib-grupos.png' });

  // recargar: la copa se conserva
  await page.reload();
  await page.waitForSelector('.mode');
  await page.click('.mode:has-text("Copa Libertadores")');
  await page.waitForSelector('#libsetup .resume');

  // celular
  const phone = await browser.newContext({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });
  const p2 = await phone.newPage();
  p2.on('pageerror', e => errors.push('phone pageerror: ' + e.message));
  await p2.goto(URL); await p2.waitForSelector('.mode');
  await p2.click('.mode:has-text("Copa Libertadores")');
  await p2.click('#libsetup .btn.go');
  await p2.waitForSelector('#libteam:not([hidden]) .team');
  await p2.click('text=Sortear grupos');
  await p2.waitForSelector('#libhub:not([hidden]) .next');
  await p2.screenshot({ path: OUT + '/40-lib-phone.png' });
  const over = await p2.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (over) errors.push('scroll horizontal en celular');

  await browser.close();
  console.log(errors.length ? 'ERRORES:\n' + errors.join('\n') : 'BROWSER_LIB OK');
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('FALLÓ', e.message.slice(0, 700)); process.exit(1); });
