# Fútbol de Discos

Fútbol de discos al estilo HaxBall en el navegador. Se juega solo, sin servidor ni conexión: todo corre en tu navegador.

- **Contra la máquina**: 1v1, 2v2 o 3v3, cinco dificultades (de Fácil a Imposible), cancha a elegir (chica, clásica, grande, enorme o personalizada).
- **Mundial**: elegís una selección, se sortean los grupos y jugás hasta la final. Formato de 48 selecciones (12 grupos, pasan los mejores terceros) o de 32. Perder en eliminación directa te saca del torneo. La dificultad de los rivales es configurable e incluye un modo progresivo.
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
src/pens.js        penales: reglas de la tanda, física de cada penal y bots
src/ui_*.js        interfaz (partido, Mundial, penales, inicio)
src/template.html  estilos y base de la página
build.js           junta todo en public/index.html
test/              pruebas (bots, Mundial, penales, navegador)
```

`npm test` corre las pruebas del Mundial y de los penales. Las de navegador (`test/browser1.js`, `test/browser_pens.js`) usan Playwright y esperan el servidor en el puerto 3100 (`PORT=3100 npm start`).

## El nivel Imposible

Usa un bot distinto al resto (`smDecide` / `smTick` en `src/core.js`): predice el recorrido de la pelota con rebotes, calcula cuántos ticks tarda cada jugador en llegar, y si llega primero prueba tiros al arco y de rebote en la pared, simula cada uno y elige el que nadie alcanza a cortar. Si el rival llega antes, se para entre la pelota y su arco y tapa los tiros yendo al punto del recorrido que alcanza primero. Patea solo cuando la simulación dice que conviene. En penales, el arquero lee la carrera del que patea.

## Límites conocidos

- Las medidas de la física son una aproximación de la cancha clásica de HaxBall, no una copia exacta.
- El progreso del Mundial se guarda en el navegador (localStorage): no se comparte entre dispositivos.
