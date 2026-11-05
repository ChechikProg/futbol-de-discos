# Fútbol de Discos

Fútbol de discos al estilo HaxBall en el navegador. Se juega solo, sin servidor ni conexión: todo corre en tu navegador.

- **Contra la máquina**: 1v1, 2v2 o 3v3, cinco dificultades (de Fácil a Imposible), cancha a elegir (chica, clásica, grande, enorme o personalizada).
- **Mundial**: elegís una selección, se sortean los grupos y jugás hasta la final. Formato de 48 selecciones (12 grupos, pasan los mejores terceros) o de 32. Perder en eliminación directa te saca del torneo. La dificultad de los rivales es configurable e incluye un modo progresivo.
- **Copa Libertadores**: elegís un club entre 32 (basados en la edición 2026, con River y Racing). 8 grupos de 4 a ida y vuelta (6 partidos, 3 de local), pasan los 2 primeros. Octavos, cuartos y semifinales a ida y vuelta por global (sin gol de visitante); si en la vuelta el global queda igualado, gol de oro de 1 minuto y penales. Final a partido único en el Estadio Centenario. Se puede elegir el tamaño de la cancha (automático según la cantidad de jugadores, del estadio, grande o enorme). Cada club juega de local en su estadio (La Bombonera, el Más Monumental, El Cilindro, el Maracanã para los brasileños, el Hernando Siles con pista, etc.; los demás usan tribunas estándar con el nombre de su estadio) y los bots llevan nombres de jugadores reales del plantel.
- **Pedir la pelota**: en 2v2 y 3v3, con la tecla `E` (o el botón *Pedir* en el celular) tus compañeros de la máquina buscan pasártela al pie.
- **Gol de oro y penales**: si un partido termina empatado, se juega un gol de oro de 1 minuto (el primero que convierte gana). Si nadie convierte, se define por penales al estilo del mapa de penales de HaxBall: la pelota está en el punto penal, el que patea arranca atrás, corre y le pega con la física del juego, y el arquero (un disco pegado a la línea, que no puede adelantarse ni patear) trata de taparla. El que patea tiene un solo toque: después del primer contacto con la pelota queda quieto y ya no puede tocarla. Son cinco tiros cada uno y, si siguen igualados, muerte súbita.
  En el Mundial, la fase de grupos admite empates como siempre: ni gol de oro ni penales. Solo se juegan en las llaves.

Las selecciones, las valoraciones y el sorteo son de fantasía. No usan ranking oficial ni nombres de jugadores.

## Probarlo en tu computadora

Necesitás Node 18 o más nuevo.

```bash
npm start
```

Abrí http://localhost:3000. También podés abrir `public/index.html` directamente en el navegador.

## Publicarlo

Es una página estática: sirve cualquier hosting, y no hace falta que soporte WebSockets.

- **Cloudflare** (la que ya tenés conectada a GitHub): se republica sola con cada cambio. `wrangler.toml` publica la carpeta `public/`.
- **Render**: `render.yaml` sigue funcionando (corre `npm start`, que sirve la carpeta `public/`).

Si cambiás algo en `src/`, corré `npm run build` para regenerar `public/index.html` y subí también ese archivo.

## Cómo está armado

```
server.js          servidor estático mínimo (para Render o para probar en local)
src/core.js        física y bots
src/wc.js          lógica del Mundial (sorteo, grupos, llaves, simulación)
src/lib.js         Copa Libertadores: equipos, estadios, jugadores, grupos e llaves ida y vuelta
src/pens.js        penales: reglas de la tanda, física de cada penal y bots
src/ui_*.js        interfaz (partido, Mundial, penales, inicio)
src/template.html  estilos y base de la página
build.js           junta todo en public/index.html
test/              pruebas (bots, Mundial, penales, navegador)
```

`npm test` corre las pruebas del Mundial, la Libertadores y los penales. Las de navegador (`test/browser1.js`, `test/browser_pens.js`, `test/browser_lib.js`) usan Playwright y esperan el servidor en el puerto 3100 (`PORT=3100 npm start`).

## El nivel Imposible

Tiene la misma velocidad y la misma patada que el jugador: la diferencia es solo de inteligencia (`smDecide` / `smTick` en `src/core.js`).

- Predice el recorrido de la pelota con rebotes y calcula cuántos ticks tarda cada jugador en llegar.
- Con la pelota, simula cada opción (tiros directos y de rebote, pases directos y por la pared, pases al espacio, conducir) y elige la mejor.
- Tiene en cuenta que una persona tarda unos 11 ticks (≈0,2 s) en reaccionar a una patada nueva, así que remata y pasa donde no llegás a reaccionar.
- Defiende en la bisectriz del ángulo entre la pelota y los palos, a la distancia en la que su cuerpo tapa todo el arco; si lo pasan, vuelve a la boca del arco; cerca de su arco no se la juega y nunca la manda hacia su propio arco.
- Gambetea amagando: si el rival se tira para un lado, sale para el otro.

Ideas tomadas de guías de arqueros de HaxBall (ocupar la posición que cubre los ángulos, achicar sin regalar la espalda, hacer que el rival se comprometa y salir para el otro lado).

## Datos de la Libertadores

Los planteles salen de las páginas de plantel de BeSoccer (noviembre de 2026) y pueden quedar desactualizados con los pases. Las valoraciones de los equipos son propias.

## Límites conocidos

- Las medidas de la física son una aproximación de la cancha clásica de HaxBall, no una copia exacta.
- El progreso del Mundial se guarda en el navegador (localStorage): no se comparte entre dispositivos.
