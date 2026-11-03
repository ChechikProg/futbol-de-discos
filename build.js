'use strict';
/* Arma el cliente: junta el motor, el Mundial y la interfaz en un solo HTML.
   public/index.html  -> página completa para el servidor
   dist/artifact.html -> versión sin <html>/<head> para publicar como artifact */
const fs = require('fs');
const path = require('path');
const src = f => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');

const files = ['core.js', 'wc.js', 'pens.js', 'ui_base.js', 'ui_wc.js', 'ui_pens.js', 'ui_main.js'];
let js = files.map(f => src(f).replace(/^'use strict';\n/, '')).join('\n');
js = "'use strict';\n" + js;
/* "</script" dentro del JS cortaría la etiqueta */
if (/<\/script/i.test(js)) throw new Error('El JS contiene </script');

const tpl = src('template.html');
const [head, body] = tpl.split('<!--BODY-->');
const bodyHtml = body.replace('/*__JS__*/', js.replace(/\$/g, '$$$$'));
const full = '<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' +
  head + '</head>\n<body>' + bodyHtml + '</body>\n</html>\n';
fs.mkdirSync(path.join(__dirname, 'public'), { recursive: true });
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'public', 'index.html'), full);
fs.writeFileSync(path.join(__dirname, 'dist', 'artifact.html'), head + bodyHtml);
fs.writeFileSync(path.join(__dirname, 'dist', 'bundle.js'), js);
console.log('listo: public/index.html', Math.round(full.length / 1024) + ' KB');
