import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { restoreEngine } from '../web/persistence.js';
const moduleUrl = new URL('../dist/wasm/grade_engine.mjs', import.meta.url);
if (!existsSync(moduleUrl)) {
  console.error('BLOCKED: compiled WebAssembly module is missing. Run scripts/build.ps1 with Emscripten first.');
  process.exit(1);
}
const { default: createModule } = await import(moduleUrl);
const Module = await createModule();
const engine = new Module.GradeEngine();
try {
  assert.equal(engine.add('a', 'Ama', 90).ok, true);
  assert.equal(engine.add('A', 'Duplicate', 80).ok, false);
  assert.equal(engine.add('B', 'Kofi', 49.5).ok, true);
  assert.equal(engine.add('C', 'Invalid', NaN).ok, false);
  let view = JSON.parse(engine.snapshotJson('', 'all'));
  assert.equal(view.stats.average, 69.75);
  assert.equal(view.stats.passRate, 50);
  assert.deepEqual(view.students.map((s) => s.grade), ['A', 'F']);
  assert.equal(engine.update('B', 'B', 'Kofi', 75).ok, true);
  assert.equal(engine.sort('score', true).ok, true);
  view = JSON.parse(engine.snapshotJson('ko', 'pass'));
  assert.equal(view.filteredCount, 1);
  assert.equal(view.students[0].grade, 'B');
  const raw = engine.exportJson();
  const restored = restoreEngine(Module, raw);
  try { assert.equal(restored.exportJson(), raw); } finally { restored.delete(); }
  assert.throws(() => restoreEngine(Module, '{bad json'));
  assert.throws(() => restoreEngine(Module, '{"version":2,"students":[]}'));
  assert.throws(() => restoreEngine(Module, '{"version":1,"students":[{"id":"X","name":"N","score":"90"}]}'));
  assert.throws(() => restoreEngine(Module, '{"version":1,"students":[{"id":"X","name":"N","score":90},{"id":"x","name":"N","score":80}]}'));
  assert.throws(() => restoreEngine(Module, '{"version":1,"students":[{"id":"X","name":"N","score":101}]}'));
  assert.equal(engine.exportJson(), raw);
  assert.equal(engine.remove('A').ok, true);
  assert.equal(JSON.parse(engine.snapshotJson('', 'all')).totalCount, 1);
  console.log('PASS: real WebAssembly bindings, C++ operations, persistence round-trip, and invalid snapshot rejection.');
} finally { engine.delete(); }
