// Prueba la versión de Cloudflare: levantala con `npx wrangler dev --port 8790 --local` y corré `node test/worker.js`.
const assert = require('assert');
const WebSocket = require('ws');
const BASE = process.env.BASE || 'localhost:8790';
const sleep = ms => new Promise(r => setTimeout(r, ms));
function client() {
  const ws = new WebSocket('ws://' + BASE + '/ws'), c = { ws, msgs: [] };
  ws.on('message', d => c.msgs.push(JSON.parse(d)));
  c.open = new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
  c.send = o => ws.send(JSON.stringify(o));
  c.wait = async (fn, ms = 4000, label = '') => { const t0 = Date.now(); for (;;) { const h = c.msgs.find(fn); if (h) return h; if (Date.now() - t0 > ms) throw new Error('timeout ' + label); await sleep(20); } };
  c.last = t => { for (let i = c.msgs.length - 1; i >= 0; i--) if (c.msgs[i].t === t) return c.msgs[i]; return null; };
  return c;
}
(async () => {
  const health = await fetch('http://' + BASE + '/healthz'); assert.strictEqual(await health.text(), 'ok');
  const page = await fetch('http://' + BASE + '/'); assert(page.ok && (await page.text()).includes('<canvas'), 'sirve la página');
  const A = client(), B = client(); await A.open; await B.open;
  A.send({ t: 'hello', name: 'Ana' }); B.send({ t: 'hello', name: 'Beto' });
  await A.wait(m => m.t === 'welcome', 3000, 'welcome');
  A.send({ t: 'create', cfg: { size: 1, bots: false, time: 3, goals: 3, diff: 'hard' } });
  const room = await A.wait(m => m.t === 'room', 3000, 'room');
  B.send({ t: 'join', code: room.code }); await B.wait(m => m.t === 'room', 3000, 'B room');
  A.send({ t: 'start' });
  await A.wait(m => m.t === 'start', 3000, 'start'); await B.wait(m => m.t === 'start', 3000, 'start B');
  let seq = 0;
  const feed = setInterval(() => { seq++; A.send({ t: 'in', dx: 1, dy: 0, kick: true, s: seq }); B.send({ t: 'in', dx: -1, dy: 0, kick: false, s: seq }); }, 16);
  await A.wait(m => m.t === 's' && m.f === 'p', 8000, 'pelota en juego');
  const t0 = A.msgs.filter(m => m.t === 's').length, k0 = A.last('s').k; await sleep(2000);
  const rate = (A.msgs.filter(m => m.t === 's').length - t0) / 2, ticks = (A.last('s').k - k0) / 2;
  console.log('snapshots/seg:', rate.toFixed(1), '| ticks de física/seg:', ticks.toFixed(1), '| ack:', A.last('s').p[5]);
  assert(rate > 45 && rate < 70, 'tasa de snapshots ' + rate);
  assert(ticks > 54 && ticks < 66, 'la física no va a 60 Hz: ' + ticks);
  assert(A.last('s').p[5] > 20, 'ack de entradas');
  clearInterval(feed);
  A.send({ t: 'stop' }); await A.wait(m => m.t === 'end' && m.w === -2, 3000, 'stop');
  A.send({ t: 'leave' }); B.send({ t: 'leave' }); await sleep(100);
  A.ws.send('basura'); A.send({ t: 'hello', name: 'X' }); await A.wait(m => m.t === 'welcome' && m.name === 'X', 2000, 'sigue vivo');
  console.log('WORKER OK'); process.exit(0);
})().catch(e => { console.error('FALLÓ:', e.message); process.exit(1); });
