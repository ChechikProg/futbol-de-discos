'use strict';
/* Servidor de Fútbol de Discos (Node): sirve la página y corre las salas online.
   El servidor es la autoridad: simula la física a 60 Hz y manda el estado a 60 Hz.
   La lógica de las salas está en src/hub.js (la misma que usa la versión de Cloudflare). */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { createHub } = require('./src/hub.js');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || ''; // opcional: dominio permitido para conectarse
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png' };
const hub = createHub();
const { rooms, clients } = hub;

/* ---------- HTTP ---------- */
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok'); }
  const file = url === '/' ? '/index.html' : url;
  const full = path.normalize(path.join(PUBLIC, file));
  if (full !== PUBLIC && !full.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('No encontrado'); }
    res.writeHead(200, {
      'content-type': MIME[path.extname(full)] || 'application/octet-stream',
      'cache-control': file === '/index.html' ? 'no-cache' : 'public, max-age=3600'
    });
    res.end(data);
  });
});

/* ---------- WebSocket ---------- */
setInterval(() => hub.tick(performance.now()), 6);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096, perMessageDeflate: false });
const alive = new WeakMap();
wss.on('connection', (ws, req) => {
  if (ALLOWED_ORIGIN && req.headers.origin && !req.headers.origin.includes(ALLOWED_ORIGIN)) return ws.close(1008, 'origen no permitido');
  const client = hub.addClient(ws);
  if (!client) return ws.close(1013, 'servidor lleno');
  alive.set(ws, true);
  ws.on('pong', () => alive.set(ws, true));
  ws.on('message', data => hub.onMessage(client, data.toString()));
  ws.on('close', () => hub.onClose(client));
  ws.on('error', () => { /* se cierra solo */ });
});
setInterval(() => {
  for (const c of clients.values()) {
    if (!alive.get(c.ws)) { c.ws.terminate(); continue; }
    alive.set(c.ws, false);
    try { c.ws.ping(); } catch (e) { /* ok */ }
  }
}, 30000);

if (require.main === module) {
  server.listen(PORT, () => console.log('Fútbol de Discos escuchando en el puerto ' + PORT));
}
module.exports = { server, rooms, clients };
