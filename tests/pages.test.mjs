// Exercise the generated loader's browser branch over HTTP at a repository subpath.
// This is not DOM/browser UI automation; no application code or engine is mocked.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createContext, SourceTextModule } from 'node:vm';

const root = new URL('../dist/', import.meta.url);
const files = ['.nojekyll', 'index.html', 'styles.css', 'app.js', 'persistence.js',
  'favicon.svg', 'wasm/grade_engine.mjs', 'wasm/grade_engine.wasm'];
const contents = new Map();
for (const file of files) {
  const data = await readFile(new URL(file, root));
  assert.ok(file === '.nojekyll' || data.length > 0, `${file} must not be empty`);
  contents.set(file, data);
}
assert.deepEqual((await readdir(root)).sort(),
  ['.nojekyll', 'index.html', 'styles.css', 'app.js', 'persistence.js', 'favicon.svg', 'wasm'].sort(),
  'Publish only runtime assets');
assert.deepEqual((await readdir(new URL('wasm/', root))).sort(),
  ['grade_engine.mjs', 'grade_engine.wasm']);
assert.equal(WebAssembly.validate(contents.get('wasm/grade_engine.wasm')), true);

const prefix = '/student-grade-system/';
const mime = { css: 'text/css', js: 'text/javascript', mjs: 'text/javascript',
  wasm: 'application/wasm', html: 'text/html', svg: 'image/svg+xml' };
const requests = [];
const server = createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  requests.push(pathname);
  const file = pathname.startsWith(prefix) ? pathname.slice(prefix.length) || 'index.html' : null;
  if (!contents.has(file)) { response.writeHead(404).end(); return; }
  response.writeHead(200, { 'Content-Type': mime[file.split('.').at(-1)] || 'text/plain' });
  response.end(contents.get(file));
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}${prefix}`;

async function fetchAsset(reference, parent = base) {
  const url = new URL(reference, parent);
  assert.ok(url.href.startsWith(base), `Asset escapes repository subpath: ${url}`);
  const response = await fetch(url);
  assert.equal(response.status, 200, `Missing asset: ${url}`);
  return response;
}

try {
  const html = await (await fetchAsset('./')).text();
  for (const [, ref] of html.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)) {
    if (!ref.startsWith('#')) await fetchAsset(ref);
  }
  const app = contents.get('app.js').toString();
  const persistence = contents.get('persistence.js').toString();
  const css = contents.get('styles.css').toString();
  for (const source of [html, app, persistence, css, contents.get('wasm/grade_engine.mjs').toString()]) {
    assert.doesNotMatch(source, /localhost|127\.0\.0\.1|file:\/\/\/|[A-Za-z]:\\/,
      'Runtime files must not depend on a development host or absolute filesystem path');
  }
  for (const [, ref] of css.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)) {
    if (!ref.startsWith('data:') && !ref.startsWith('#')) await fetchAsset(ref);
  }
  // Follow the actual import specifiers from the frontend, not an assumed loader path.
  const imports = [...app.matchAll(/\b(?:from\s*|import\s*\(\s*)['"]([^'"]+)['"]/g)]
    .map((match) => match[1]);
  assert.ok(imports.includes('./persistence.js'));
  const loaderRef = imports.find((ref) => ref.endsWith('.mjs'));
  assert.ok(loaderRef, 'Frontend must import the compiled engine');
  for (const ref of imports) await fetchAsset(ref);
  const loaderUrl = new URL(loaderRef, base).href;
  const source = await (await fetchAsset(loaderUrl)).text();
  const context = createContext({ window: {}, URL, console, WebAssembly, TextDecoder, TextEncoder,
    setTimeout, clearTimeout, performance, fetch: (url) => fetchAsset(url) });
  const loader = new SourceTextModule(source, {
    context, identifier: loaderUrl, initializeImportMeta(meta) { meta.url = loaderUrl; },
  });
  await loader.link((specifier) => { throw new Error(`Unexpected loader dependency: ${specifier}`); });
  await loader.evaluate();
  const Module = await loader.namespace.default();
  const engine = new Module.GradeEngine();
  try {
    assert.equal(engine.add('PAGES-1', 'Subpath Test', 79.5).ok, true);
    assert.equal(engine.add('PAGES-2', 'Second Test', 49.5).ok, true);
    const snapshot = JSON.parse(engine.snapshotJson('', 'all'));
    assert.deepEqual(snapshot.students.map((student) => student.grade), ['B', 'F']);
    assert.equal(snapshot.stats.average, 64.5);
    assert.equal(snapshot.stats.passRate, 50);
  } finally { engine.delete(); }
  assert.ok(requests.includes(`${prefix}wasm/grade_engine.wasm`),
    'Generated browser loader must fetch the actual binary beside itself');
  assert.ok(requests.every((request) => request.startsWith(prefix)));
  console.log('PASS: complete dist, relative assets, and real browser-branch Wasm loading over HTTP under a repository subpath.');
} finally {
  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
