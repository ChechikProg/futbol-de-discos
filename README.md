# Fútbol de Discos

Fútbol de discos al estilo HaxBall en el navegador. Se juega solo, sin servidor ni conexión: todo corre en tu navegador.

- **Contra la máquina**: 1v1, 2v2 o 3v3, cuatro dificultades, cancha a elegir (chica, clásica, grande, enorme o personalizada).
- **Mundial**: elegís una selección, se sortean los grupos y jugás hasta la final. Formato de 48 selecciones (12 grupos, pasan los mejores terceros) o de 32. Perder en eliminación directa te saca del torneo. La dificultad de los rivales es configurable e incluye un modo progresivo.
- **Penales**: si un partido termina empatado, se define por penales: cinco tiros cada uno y, si siguen igualados, muerte súbita. Pateás eligiendo un rincón del arco y atajás eligiendo hacia dónde tirarte. En el Mundial, la fase de grupos admite empates como siempre; los penales se juegan solo en las llaves.

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
src/pens.js        reglas y probabilidades de los penales
src/ui_*.js        interfaz (partido, Mundial, penales, inicio)
src/template.html  estilos y base de la página
build.js           junta todo en public/index.html
test/              pruebas (bots, Mundial, penales, navegador)
```

`npm test` corre las pruebas del Mundial y de los penales. Las de navegador (`test/browser1.js`, `test/browser_pens.js`) usan Playwright y esperan el servidor en el puerto 3100 (`PORT=3100 npm start`).

## Límites conocidos

- Las medidas de la física son una aproximación de la cancha clásica de HaxBall, no una copia exacta.
- El progreso del Mundial se guarda en el navegador (localStorage): no se comparte entre dispositivos.
