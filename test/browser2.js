// Prueba online con dos navegadores reales contra el servidor local.
const { chromium } = require('playwright');
const OUT = process.env.SHOTS || '/tmp/claude-0/-home-claude/076ee193-bcaa-50b1-85a6-0bef0beeee81/scratchpad/shots';
require('fs').mkdirSync(OUT, { recursive: true });
const URL = process.env.URL || 'http://127.0.0.1:3100/';
const errors = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const mk = async (name, vp, extra) => {
    const ctx = await browser.newContext(Object.assign({ viewport: vp || { width: 1100, height: 700 } }, extra || {}));
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(name + ' pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errors.push(name + ' console: ' + m.text()); });
    return page;
  };
  const A = await mk('A'), B = await mk('B', { width: 390, height: 800 }, { hasTouch: true, isMobile: true });

  await A.goto(URL);
  await A.waitForSelector('.mode');
  await A.click('.mode >> nth=1');
  await A.fill('#nick', 'Ana');
  await A.waitForSelector('.status.ok', { timeout: 8000 });
  await A.screenshot({ path: OUT + '/20-online-A.png' });
  await A.click('text=Crear sala');
  await A.waitForSelector('#room:not([hidden])');
  const code = (await A.textContent('.bigcode')).trim();
  console.log('código:', code);
  if (!/^[A-Z]{4}$/.test(code)) errors.push('código inválido ' + code);

  // B entra por el enlace con el código
  await B.goto(URL + '#sala-' + code);
  await B.waitForSelector('#room:not([hidden])', { timeout: 8000 });
  await B.fill('#chatin', 'hola desde el celu');
  await B.press('#chatin', 'Enter');
  await A.waitForSelector('.cl:has-text("hola desde el celu")', { timeout: 4000 });
  await A.waitForFunction(() => document.querySelectorAll('.tcol li:not(.empty)').length >= 2);
  await A.screenshot({ path: OUT + '/21-room-A.png' });
  await B.screenshot({ path: OUT + '/22-room-B-phone.png' });
  const ovB = await B.evaluate(() => [...document.querySelectorAll('.screen:not([hidden]) *')].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1).map(e => e.className || e.tagName).slice(0, 5));
  if (ovB.length) errors.push('sala desborda en celular: ' + ovB.join(','));

  // el anfitrión cambia la config: 1v1, sin bots, cancha grande; B la ve actualizada
  await A.click('label[for="on-size-1"]');
  await A.click('label[for="on-bots-0"]');
  await A.click('label[for="on-pitch-big"]');
  await B.waitForFunction(() => NET.room && NET.room.cfg.size === 1 && NET.room.cfg.bots === false && NET.room.cfg.pitch.preset === 'big', null, { timeout: 4000 });
  await B.waitForSelector('.summary:has-text("Grande")');
  console.log('B ve la config del anfitrión');
  await A.waitForTimeout(300);

  // empezar
  await A.click('text=Empezar partido');
  await A.waitForFunction(() => mode === 'online' && state === 'playing' && NET.snaps.length > 5, null, { timeout: 8000 });
  await B.waitForFunction(() => mode === 'online' && state === 'playing' && NET.snaps.length > 5, null, { timeout: 8000 });
  const youA = await A.evaluate(() => NET.you), youB = await B.evaluate(() => NET.you);
  console.log('slots:', youA, youB);
  if (youA !== 0 || youB !== 1) errors.push('slots incorrectos');

  const x0 = await A.evaluate(() => ogame.players[NET.you].x);
  await A.keyboard.down('ArrowRight');
  await A.keyboard.down('KeyX');
  await sleep(1800);
  await A.keyboard.up('ArrowRight'); await A.keyboard.up('KeyX');
  const x1 = await A.evaluate(() => ogame.players[NET.you].x);
  // B (en otro cliente) también ve moverse a A
  const xB = await B.evaluate(() => ogame.players[0].x);
  console.log('A: x', x0.toFixed(0), '->', x1.toFixed(0), '| B ve a A en', xB.toFixed(0));
  if (!(x1 > x0 + 30)) errors.push('A no se mueve');
  if (!(xB > x0 + 20)) errors.push('B no ve moverse a A');
  const pingA = await A.evaluate(() => NET.rtt);
  console.log('ping A:', pingA, 'ms');
  await A.screenshot({ path: OUT + '/23-game-A.png' });
  await B.screenshot({ path: OUT + '/24-game-B-phone.png' });

  // B toca la pantalla: joystick + patear; el servidor recibe las entradas
  await B.touchscreen.tap(100, 400);
  const seenB = await B.evaluate(() => ({ you: NET.you, tick: ogame.tick, score: ogame.score }));
  console.log('B:', JSON.stringify(seenB));

  // menú en pleno juego y terminar el partido (host)
  await A.keyboard.press('Escape');
  await A.waitForSelector('#pause:not([hidden])');
  await A.screenshot({ path: OUT + '/25-online-menu.png' });
  await A.click('text=Terminar el partido');
  await A.waitForSelector('#end:not([hidden])', { timeout: 4000 });
  await B.waitForSelector('#end:not([hidden])', { timeout: 4000 });
  await A.click('#end .btn.go');
  await A.waitForSelector('#room:not([hidden])');
  await B.click('#end .btn.go');
  await B.waitForSelector('#room:not([hidden])');

  // partido que termina por goles: forzamos 1 gol en el servidor no es posible desde acá; dejamos 3 goles y bots
  await A.click('label[for="on-bots-1"]');
  await A.click('label[for="on-size-1"]');
  await A.click('label[for="on-goals-3"]');
  // B pasa a espectador
  await B.click('.tcol.spec >> text=Mirar');
  await A.waitForFunction(() => NET.room.members.some(m => m.team === 2));
  console.log('espectador OK');

  // B sale de la sala y A queda solo
  await B.click('text=‹ Salir');
  await B.waitForSelector('#online:not([hidden])');
  await A.waitForFunction(() => NET.room.members.length === 1);
  await A.click('text=‹ Salir');
  await A.waitForSelector('#online:not([hidden])');
  await A.waitForSelector('.rooms .empty', { timeout: 5000 });

  // sin servidor (página abierta como archivo): mensaje claro y el resto funciona
  const C = await mk('C');
  await C.goto('file:///home/claude/futbol-de-discos/public/index.html');
  await C.waitForSelector('.mode');
  await C.click('.mode >> nth=1');
  await C.waitForSelector('.status.bad', { timeout: 4000 });
  await C.screenshot({ path: OUT + '/26-online-offline.png' });
  const dis = await C.evaluate(() => document.querySelector('#nick').closest('.card').querySelector('.btn.go').disabled);
  if (!dis) errors.push('crear sala debería estar deshabilitado sin servidor');

  await browser.close();
  console.log(errors.length ? 'ERRORES:\n' + errors.join('\n') : 'BROWSER2 OK');
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('FALLÓ', e.message.slice(0, 600)); process.exit(1); });
