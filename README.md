# Fútbol de Discos

Fútbol de discos al estilo HaxBall en el navegador.

- **Contra la máquina**: 1v1, 2v2 o 3v3, cuatro dificultades, cancha a elegir (chica, clásica, grande, enorme o personalizada).
- **Online**: salas con código y enlace. El servidor simula la física, así que nadie puede hacer trampa. Los bots completan los lugares vacíos.
- **Mundial** (local): elegís una selección, se sortean los grupos y jugás hasta la final. Formato de 48 selecciones (12 grupos, pasan los mejores terceros) o de 32. Perder en eliminación directa te saca del torneo. La dificultad de los rivales es configurable e incluye un modo progresivo.

Las selecciones, las valoraciones y el sorteo son de fantasía. No usan ranking oficial ni nombres de jugadores.

## Probarlo en tu computadora

Necesitás Node 18 o más nuevo.

```bash
npm install
npm start
```

Abrí http://localhost:3000. Para jugar con alguien de tu misma red, que abra `http://IP-DE-TU-PC:3000`.

## Publicarlo en internet (Render)

Se necesita un hosting que acepte WebSockets. Render sirve y tiene plan gratis.

1. Subí esta carpeta a un repositorio de GitHub.
2. En render.com: **New → Blueprint** y elegí el repositorio. Render lee `render.yaml` y lo configura solo.
   Si preferís hacerlo a mano: **New → Web Service**, runtime Node, build `npm install`, start `npm start`, plan Free.
3. Cuando termine el deploy, Render te da una dirección tipo `https://futbol-de-discos.onrender.com`.
4. Abrila, entrá a **Online → Crear sala → Copiar enlace** y mandáselo a tus amigos.

Cosas a tener en cuenta del plan gratis:

- Se duerme después de 15 minutos sin tráfico. Los mensajes de un partido en curso cuentan como tráfico.
- Al despertar tarda cerca de un minuto en responder.
- Tiene 750 horas de instancia por mes.

Otras opciones que funcionan igual: Railway y Fly.io (`fly launch`). El servidor lee el puerto de la variable `PORT`.

Variable opcional: `ALLOWED_ORIGIN` (por ejemplo `miSitio.com`). Si la definís, el servidor solo acepta conexiones de páginas de ese dominio.

## Publicarlo en Cloudflare (gratis, servidor en Sudamérica)

Es una segunda forma de publicar el mismo juego. Render sigue funcionando igual con `render.yaml`.

1. Creá una cuenta gratis en cloudflare.com (no pide tarjeta).
2. En esta carpeta: `npm run cf:deploy`. La primera vez abre el navegador para que inicies sesión con tu cuenta.
3. Al terminar te muestra la dirección, tipo `https://futbol-de-discos.TU-USUARIO.workers.dev`.

Cómo funciona: `worker/index.js` crea un único servidor de salas (Durable Object) con la pista de ubicación `sam` (Sudamérica), y `public/` lo sirve Cloudflare. La lógica de las salas es la misma que usa `server.js` (`src/hub.js`).

Para probarlo en tu computadora: `npm run cf:dev` y, en otra terminal, `node test/worker.js`.

Límites del plan gratis de Cloudflare:

- 100.000 pedidos por día. Cada 20 mensajes que manda un jugador cuentan como 1 pedido, y un jugador manda 60 por segundo: alcanza para unas 9 horas de jugador por día (4 horas y media con dos jugadores). Al pasarse, el online se corta hasta las 00:00 UTC (21:00 de Argentina).
- 13.000 GB-s de uso por día: unas 28 horas de conexión por día, aunque sea con la pestaña abierta sin jugar.
- Si querés más, el plan pago de Workers cuesta US$5 por mes.

## Cómo está armado

```
server.js          servidor HTTP + WebSocket para Node/Render
src/hub.js         salas y partidas online (lo usan server.js y el worker)
worker/index.js    versión para Cloudflare Workers (wrangler.toml)
src/core.js        física y bots, compartido por el navegador y el servidor
src/wc.js          lógica del Mundial (sorteo, grupos, llaves, simulación)
src/ui_*.js        interfaz
src/template.html  estilos y base de la página
build.js           junta todo en public/index.html
test/              pruebas (bots, Mundial, servidor, navegador)
```

Si cambiás algo en `src/`, corré `npm run build` para regenerar `public/index.html`. `npm test` corre las pruebas del Mundial y del servidor.

## Latencia online

- Tu jugador se mueve al instante: el navegador predice su movimiento con la misma física que el servidor y corrige las diferencias de a poco. Con 280 ms de ping medido, el movimiento propio se ve en unos 40 ms.
- La pelota y los demás jugadores se ven con el retraso real de la conexión. Cuanto más cerca esté el servidor, mejor se siente el juego.
- Render no tiene región en Sudamérica. `render.yaml` usa **Virginia**, que suele ser la más cercana a Argentina. Render no permite cambiar la región de un servicio ya creado: hay que borrarlo y crear otro (New → Blueprint).
- Para probar con ping simulado: `node test/lag.js` (agrega 140 ms por sentido; se cambia con `DELAY=100`).

## Límites conocidos

- Los toques a la pelota se ven con el retraso de la conexión, porque la pelota la decide el servidor.
- Las medidas de la física son una aproximación de la cancha clásica de HaxBall, no una copia exacta.
