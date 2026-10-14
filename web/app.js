import { restoreEngine, STORAGE_KEY } from './persistence.js';

const $ = (id) => document.getElementById(id);
const pageSize = 10;
let Module;
let engine;
let snapshot;
let page = 1;
let editingId = null;
let pendingConfirmation = null;
let toastTimer;
let storageLocked = false;
let lastSaved = null;
let recoveryRaw = null;
const colors = ['#88ad8a', '#b1c392', '#e5cf96', '#e3baa0', '#d7a6a4'];
const bands = ['80–100', '70–<80', '60–<70', '50–<60', '0–<50'];

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.append(use);
  return svg;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function toast(message, error = false) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').classList.toggle('error', error);
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4500);
}

function warnStorage(message) {
  $('storage-message').textContent = message;
  $('storage-notice').hidden = false;
}

function setControls() {
  document.querySelectorAll('[data-engine]').forEach((control) => {
    control.disabled = !engine || storageLocked;
  });
  document.querySelectorAll('[data-add]').forEach((control) => {
    control.disabled = !engine || storageLocked || snapshot?.totalCount >= 1000;
  });
  if (engine) {
    $('demo-button').hidden = snapshot.totalCount !== 0;
    $('export-button').disabled = storageLocked;
  }
}

// Detect concurrent tabs before changing in-memory records; never silently overwrite.
function canMutate() {
  if (!engine || storageLocked) return false;
  try {
    if (localStorage.getItem(STORAGE_KEY) !== lastSaved) {
      lockForExternalChange();
      return false;
    }
  } catch { /* The session may continue if browser storage is unavailable. */ }
  return true;
}

function lockForExternalChange() {
  storageLocked = true;
  warnStorage('Saved records changed in another tab. Reload this page to load the latest records before making changes.');
  $('save-status').textContent = 'Reload required · Records changed in another tab';
  document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
  render();
}

function persist() {
  try {
    const raw = engine.exportJson();
    localStorage.setItem(STORAGE_KEY, raw);
    lastSaved = raw;
    $('save-status').textContent = 'All changes saved in this browser';
    $('storage-notice').hidden = true;
  } catch {
    $('save-status').textContent = 'Unsaved changes · Session only';
    warnStorage('Browser storage is unavailable or full. Your records are available in this session only. Export a backup before leaving.');
  }
}

function applySort() {
  const [field, direction] = $('sort-select').value.split(':');
  return engine.sort(field, direction === 'asc');
}

function afterMutation(message) {
  applySort();
  persist();
  render();
  toast(message);
}

function renderChart(distribution) {
  $('grade-chart').replaceChildren();
  distribution.forEach((bucket, index) => {
    const column = element('div', 'chart-column');
    column.title = `${bucket.grade}: ${bucket.count} students (${bucket.percentage.toFixed(1)}%) · ${bands[index]}`;
    const bar = element('div', 'chart-bar');
    bar.style.setProperty('--bar-height', `${bucket.percentage}%`);
    bar.style.setProperty('--bar-color', colors[index]);
    column.append(element('span', 'bar-count', String(bucket.count)), bar, element('span', 'bar-label', bucket.grade));
    $('grade-chart').append(column);
  });
  $('grade-chart').setAttribute('aria-label', distribution.map((bucket) => `${bucket.grade}: ${bucket.count} students, ${bucket.percentage.toFixed(1)} percent`).join('; '));
}

function renderRows(students) {
  $('student-rows').replaceChildren();
  students.forEach((student) => {
    const row = document.createElement('tr');
    const nameCell = document.createElement('td');
    const identity = element('div', 'student-cell');
    const initials = student.name.trim().split(/\s+/u).map((part) => Array.from(part)[0]).slice(0, 2).join('').toUpperCase();
    const avatar = element('span', 'student-avatar', initials);
    avatar.setAttribute('aria-hidden', 'true');
    const name = element('span', 'student-name', student.name);
    name.title = student.name;
    identity.append(avatar, name);
    nameCell.append(identity);
    const idCell = element('td', 'student-id', student.id);
    const scoreCell = element('td', 'score-cell');
    scoreCell.append(element('strong', '', String(student.score)), element('small', '', '/ 100'));
    const gradeCell = document.createElement('td');
    gradeCell.append(element('span', `grade grade-${student.grade.toLowerCase()}`, student.grade));
    const resultCell = document.createElement('td');
    resultCell.append(element('span', `result-pill${student.passed ? '' : ' fail'}`, student.passed ? 'Pass' : 'Fail'));
    const actionsCell = document.createElement('td');
    const actions = element('div', 'row-actions');
    const edit = element('button', 'icon-button');
    edit.setAttribute('aria-label', `Edit ${student.name} (${student.id})`);
    edit.title = 'Edit student';
    edit.disabled = storageLocked;
    edit.append(icon('edit'));
    edit.addEventListener('click', () => openStudent(student));
    const remove = element('button', 'icon-button delete');
    remove.setAttribute('aria-label', `Delete ${student.name} (${student.id})`);
    remove.title = 'Delete student';
    remove.disabled = storageLocked;
    remove.append(icon('trash'));
    remove.addEventListener('click', () => confirmAction('Delete student?', `Delete ${student.name} (${student.id}) and their score? This cannot be undone.`, 'Delete student', () => {
      if (!canMutate()) return;
      const result = engine.remove(student.id);
      if (result.ok) afterMutation(result.message);
      else toast(result.message, true);
    }));
    actions.append(edit, remove);
    actionsCell.append(actions);
    row.append(nameCell, idCell, scoreCell, gradeCell, resultCell, actionsCell);
    $('student-rows').append(row);
  });
}

function render() {
  if (!engine) return;
  snapshot = JSON.parse(engine.snapshotJson($('search-input').value, $('status-filter').value));
  const { totalCount, filteredCount, stats, distribution, students } = snapshot;
  $('total-value').textContent = totalCount.toLocaleString();
  $('nav-count').textContent = totalCount;
  $('record-count').textContent = totalCount;
  $('capacity-caption').textContent = snapshot.availableSlots.toLocaleString();
  $('average-value').textContent = totalCount ? stats.average.toFixed(1) : '—';
  $('highest-value').textContent = totalCount ? String(stats.highest) : '—';
  $('lowest-value').textContent = totalCount ? `${stats.lowest} / 100` : '—';
  $('pass-value').textContent = totalCount ? stats.passRate.toFixed(1) : '—';
  $('pass-caption').textContent = totalCount ? `${stats.passed} of ${totalCount} students passing` : 'Pass mark: 50 / 100';
  $('distribution-total').textContent = totalCount ? `${totalCount} students · Whole class` : 'No scores recorded';
  $('insight-text').textContent = totalCount
    ? `${stats.passed} students are passing. ${stats.failed} are below the pass mark. Use the result filter to find the students who need support.`
    : 'Add your first student to see how your class is doing.';
  renderChart(distribution);
  const pages = Math.max(1, Math.ceil(filteredCount / pageSize));
  page = Math.min(page, pages);
  const start = (page - 1) * pageSize;
  renderRows(students.slice(start, start + pageSize));
  $('empty-state').hidden = filteredCount !== 0;
  $('empty-title').textContent = totalCount ? 'No students found' : 'Your class starts here';
  $('empty-description').textContent = totalCount ? 'Try another name or student ID, or clear your filters.' : 'Add a student and let Gradebook take care of the numbers.';
  $('empty-action').textContent = totalCount ? 'Clear filters' : 'Add your first student';
  $('pagination-label').textContent = filteredCount
    ? `Showing ${start + 1}–${Math.min(start + pageSize, filteredCount)} of ${filteredCount} students${filteredCount !== totalCount ? ` (${totalCount} total)` : ''}`
    : '0 students to show';
  $('page-label').textContent = `Page ${page} of ${pages}`;
  $('previous-page').disabled = page === 1;
  $('next-page').disabled = page >= pages;
  setControls();
}

function openStudent(student = null) {
  if (!canMutate()) return;
  editingId = student?.id ?? null;
  $('student-form').reset();
  $('student-id').value = student?.id ?? '';
  $('student-name').value = student?.name ?? '';
  $('student-score').value = student?.score ?? '';
  $('student-dialog-title').textContent = student ? 'Edit student' : 'Add student';
  $('save-student').textContent = student ? 'Save changes' : 'Add student';
  $('form-error').hidden = true;
  $('student-dialog').showModal();
  $('student-id').focus();
}

function confirmAction(title, description, label, action) {
  pendingConfirmation = action;
  $('confirm-title').textContent = title;
  $('confirm-description').textContent = description;
  $('confirm-action').textContent = label;
  $('confirm-dialog').showModal();
}

function download(raw, filename) {
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('student-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!canMutate() || !$('student-form').reportValidity()) return;
  const args = [$('student-id').value, $('student-name').value, $('student-score').valueAsNumber];
  const result = editingId === null ? engine.add(...args) : engine.update(editingId, ...args);
  if (!result.ok) {
    $('form-error').textContent = result.message;
    $('form-error').hidden = false;
    return;
  }
  $('student-dialog').close();
  afterMutation(result.message);
});
document.querySelectorAll('[data-add]').forEach((button) => button.addEventListener('click', () => openStudent()));
document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));
$('confirm-action').addEventListener('click', () => {
  const action = pendingConfirmation;
  pendingConfirmation = null;
  $('confirm-dialog').close();
  action?.();
});
$('confirm-dialog').addEventListener('close', () => { pendingConfirmation = null; });
['guide-button', 'snapshot-guide'].forEach((id) => $(id).addEventListener('click', () => $('guide-dialog').showModal()));
$('architecture-button').addEventListener('click', () => $('architecture-dialog').showModal());
document.querySelectorAll('nav a').forEach((link) => link.addEventListener('click', () => {
  document.querySelectorAll('nav a').forEach((item) => item.classList.toggle('active', item === link));
}));
$('search-input').addEventListener('input', () => { page = 1; render(); });
$('status-filter').addEventListener('change', () => { page = 1; render(); });
$('sort-select').addEventListener('change', () => {
  if (!canMutate()) return;
  applySort();
  page = 1;
  persist();
  render();
});
$('previous-page').addEventListener('click', () => { --page; render(); });
$('next-page').addEventListener('click', () => { ++page; render(); });
$('empty-action').addEventListener('click', () => {
  if (!snapshot.totalCount) openStudent();
  else {
    $('search-input').value = '';
    $('status-filter').value = 'all';
    page = 1;
    render();
  }
});
$('export-button').addEventListener('click', () => {
  download(engine.exportJson(), `gradebook-backup-${new Date().toISOString().slice(0, 10)}.json`);
  toast('Backup exported with all student records.');
});
$('demo-button').addEventListener('click', () => {
  confirmAction('Load sample class?', 'Add 12 fictional student records so you can explore the dashboard. Each record can be edited or deleted.', 'Load sample class', () => {
    if (!canMutate() || snapshot.totalCount !== 0) return;
    const samples = [
      ['STU-001', 'Ama Mensah', 92], ['STU-002', 'Kwame Asante', 78],
      ['STU-003', 'Akosua Owusu', 85], ['STU-004', 'Kofi Boateng', 64],
      ['STU-005', 'Abena Osei', 71], ['STU-006', 'Yaw Agyeman', 48],
      ['STU-007', 'Esi Adjei', 88], ['STU-008', 'Kojo Appiah', 56],
      ['STU-009', 'Afia Amponsah', 67], ['STU-010', 'Nana Bediako', 95],
      ['STU-011', 'Adwoa Darko', 43], ['STU-012', 'Kwesi Addo', 74],
    ];
    const candidate = new Module.GradeEngine();
    for (const sample of samples) {
      const result = candidate.add(...sample);
      if (!result.ok) { candidate.delete(); toast(result.message, true); return; }
    }
    engine.delete();
    engine = candidate;
    page = 1;
    afterMutation('12 sample students added.');
  });
});
$('download-recovery').addEventListener('click', () => download(recoveryRaw, 'gradebook-recovery.json'));
$('reset-storage').addEventListener('click', () => confirmAction('Discard invalid saved data?', 'This removes the invalid browser snapshot and starts an empty class. Download the saved data first if you want to keep it.', 'Discard and start fresh', () => {
  try {
    if (localStorage.getItem(STORAGE_KEY) !== recoveryRaw) {
      warnStorage('Saved records changed since recovery started. Reload before discarding anything.');
      return;
    }
    localStorage.removeItem(STORAGE_KEY);
    lastSaved = null;
    recoveryRaw = null;
    storageLocked = false;
    $('download-recovery').hidden = true;
    $('reset-storage').hidden = true;
    persist();
    render();
    toast('Ready for a fresh class.');
  } catch { warnStorage('The browser could not remove the saved data. Check your browser storage settings and reload.'); }
}));
window.addEventListener('storage', (event) => {
  if (engine && !storageLocked && (event.key === STORAGE_KEY || event.key === null)) {
    if (event.newValue !== lastSaved) lockForExternalChange();
  }
});

async function start() {
  try {
    const { default: createGradeModule } = await import('./wasm/grade_engine.mjs');
    Module = await createGradeModule();
    engine = new Module.GradeEngine();
  } catch (error) {
    console.error('WebAssembly engine failed to initialize:', error);
    $('engine-notice').className = 'notice error';
    $('engine-notice').replaceChildren(
      element('strong', '', 'The C++ grade engine is not available.'),
      element('span', '', 'Build the WebAssembly module with ./scripts/build.ps1 in an Emscripten-enabled PowerShell session, then serve dist over HTTP. Check that wasm/grade_engine.mjs and wasm/grade_engine.wasm are present.'),
    );
    $('empty-title').textContent = 'Ready for the C++ engine';
    $('empty-description').textContent = 'Student tools will become available when the WebAssembly module loads.';
    $('save-status').textContent = 'Engine unavailable · No student data has been changed';
    return;
  }
  try {
    lastSaved = localStorage.getItem(STORAGE_KEY);
  } catch {
    warnStorage('Browser storage is unavailable. You can work in this session, but export a backup before leaving.');
    $('save-status').textContent = 'Session only · Browser storage unavailable';
  }
  if (lastSaved !== null) {
    try {
      const restored = restoreEngine(Module, lastSaved);
      engine.delete();
      engine = restored;
      $('save-status').textContent = 'Saved records restored from this browser';
    } catch (error) {
      recoveryRaw = lastSaved;
      storageLocked = true;
      warnStorage(`Saved data could not be restored: ${error.message} Download it for recovery, or discard it to start a new class.`);
      $('download-recovery').hidden = false;
      $('reset-storage').hidden = false;
      $('save-status').textContent = 'Saved data needs attention · Original snapshot preserved';
    }
  }
  applySort();
  $('engine-notice').hidden = true;
  render();
}

start();
