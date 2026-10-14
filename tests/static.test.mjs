import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = (file) => readFile(new URL(file, import.meta.url), 'utf8');
const html = await read('../web/index.html');
const app = await read('../web/app.js');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length, 'HTML IDs must be unique');
for (const [, id] of app.matchAll(/\$\('([^']+)'\)/g)) {
  assert.ok(ids.includes(id), `JavaScript references missing HTML element: ${id}`);
}
for (const [, id] of html.matchAll(/<use href="#([^"]+)"/g)) {
  assert.ok(ids.includes(id), `Missing SVG symbol: ${id}`);
}
for (const file of ['index.html', 'styles.css', 'app.js', 'persistence.js', 'favicon.svg']) {
  assert.equal(await read(`../dist/${file}`), await read(`../web/${file}`), `dist/${file} is stale`);
}
assert.ok(html.includes('type="module" src="./app.js"'));
assert.ok(html.includes('href="./styles.css"'));
console.log('PASS: unique HTML IDs, UI element references, SVG symbols, relative entry points, and dist/source parity.');
