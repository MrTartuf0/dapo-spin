// Costruisce dapo-lab.html: un unico file che si apre anche offline.
// three.js (solo i pezzi usati, src/three-entry.js) + src/app.js dentro src/template.html
//   npm install && npm run build
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';

const here = new URL('.', import.meta.url);
const read = p => readFileSync(new URL(p, here), 'utf8');

const { outputFiles } = await build({
  entryPoints: [new URL('src/three-entry.js', here).pathname],
  bundle: true, minify: true, format: 'iife', globalName: 'THREE', legalComments: 'none', write: false,
});
const three = outputFiles[0].text;
const app = read('src/app.js');
let html = read('src/template.html');
for (const [mark, code] of [['/*__THREE__*/', three], ['/*__APP__*/', app]]) {
  if (!html.includes(mark)) throw new Error(`segnaposto ${mark} mancante nel template`);
  if (code.includes('</script')) throw new Error('il codice contiene </script>');
  html = html.split(mark).join(code);
}
writeFileSync(new URL('dapo-lab.html', here), html);
console.log(`dapo-lab.html: ${(html.length / 1024).toFixed(0)} KB`);
