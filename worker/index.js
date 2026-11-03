/* Fútbol de Discos en Cloudflare: Worker + un Durable Object ("Hub") que corre todas las salas.
   El Hub nace en Sudamérica (locationHint "sam"), así que el ping desde Argentina es bajo.
   La lógica de las salas es la misma que usa server.js (src/hub.js). */
import { DurableObject } from 'cloudflare:workers';
import hubLib from '../src/hub.js';

export class Hub extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.hub = hubLib.createHub();
    this.timer = null;
    this.allowed = env.ALLOWED_ORIGIN || '';
  }

  fetch(request) {
    const origin = request.headers.get('Origin');
    if (this.allowed && origin && !origin.includes(this.allowed)) return new Response('origen no permitido', { status: 403 });
    const pair = new WebSocketPair();
    const [browser, server] = Object.values(pair);
    server.accept();
    const client = this.hub.addClient(server);
    if (!client) { server.close(1013, 'servidor lleno'); return new Response(null, { status: 101, webSocket: browser }); }
    server.addEventListener('message', e => this.hub.onMessage(client, e.data));
    const bye = () => { this.hub.onClose(client); this.stopIfIdle(); };
    server.addEventListener('close', bye);
    server.addEventListener('error', bye);
    this.start();
    return new Response(null, { status: 101, webSocket: browser });
  }

  /* El reloj de las partidas corre solo mientras haya gente conectada */
  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.hub.tick(performance.now()), 8);
  }
  stopIfIdle() {
    if (this.hub.clients.size === 0 && this.timer) { clearInterval(this.timer); this.timer = null; }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/healthz') return new Response('ok');
    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('Se esperaba una conexión WebSocket', { status: 426 });
      const stub = env.HUB.get(env.HUB.idFromName('principal'), { locationHint: 'sam' });
      return stub.fetch(request);
    }
    return env.ASSETS.fetch(request);
  }
};
