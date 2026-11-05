import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'retornos-actions-'));
process.env.DATA_DIR = tmpDir;
after(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
process.env.APP_PASSWORD = 'senha-teste-1234';
const { initDatabase, default: db } = await import('../db.js');
initDatabase();
const { applyAction, restoreStates } = await import('../stateActions.js');

const NOW = '2026-11-05T15:00:00.000Z';
let seq = 0;
function newPatient() {
  seq += 1;
  const r = db
    .prepare('INSERT INTO patients (normalized_key, display_name, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run(`teste ${seq}`, `Teste ${seq}`, NOW, NOW);
  return Number(r.lastInsertRowid);
}
const row = (pid, cid) =>
  db.prepare('SELECT * FROM patient_category_states WHERE patient_id = ? AND category_id = ?').get(pid, cid);

test('contacted incrementa tentativas e grava contacted_at', () => {
  const pid = newPatient();
  applyAction(pid, 'botox', { action: 'contacted', cycleKey: '2026-10-20:review' }, NOW);
  applyAction(pid, 'botox', { action: 'contacted', cycleKey: '2026-10-20:review' }, NOW);
  const r = row(pid, 'botox');
  assert.equal(r.contacted_at, NOW);
  assert.equal(r.contacted_for_cycle_date, '2026-10-20:review');
  assert.equal(r.contact_attempts, 2);
});

test('scheduled com data inválida lança erro com status 400', () => {
  const pid = newPatient();
  assert.throws(() => applyAction(pid, 'botox', { action: 'scheduled', date: '2026-13-40' }, NOW), (e) => e.status === 400);
  assert.throws(() => applyAction(pid, 'botox', { action: 'scheduled', date: '2026-11-01' }, NOW), (e) => e.status === 400);
});

test('done grava done_at e limpa agendamento e contato', () => {
  const pid = newPatient();
  applyAction(pid, 'botox', { action: 'contacted', cycleKey: 'x' }, NOW);
  applyAction(pid, 'botox', { action: 'scheduled', date: '2026-11-10' }, NOW);
  applyAction(pid, 'botox', { action: 'done', milestone: 'review', anchorDate: '2026-10-20' }, NOW);
  const r = row(pid, 'botox');
  assert.equal(r.done_at, NOW);
  assert.equal(r.review_status_override, 'done');
  assert.equal(r.review_dismissed_for_date, '2026-10-20');
  assert.equal(r.scheduled_for, null);
  assert.equal(r.contacted_at, null);
  assert.equal(r.contact_attempts, 0);
});

test('done de renovação marca renewal_done_for_date', () => {
  const pid = newPatient();
  applyAction(pid, 'capilar', { action: 'done', milestone: 'renewal', anchorDate: '2026-10-25' }, NOW);
  assert.equal(row(pid, 'capilar').renewal_done_for_date, '2026-10-25');
});

test('no_show limpa o agendamento e grava no_show_at', () => {
  const pid = newPatient();
  applyAction(pid, 'botox', { action: 'scheduled', date: '2026-11-10' }, NOW);
  applyAction(pid, 'botox', { action: 'no_show' }, NOW);
  const r = row(pid, 'botox');
  assert.equal(r.scheduled_for, null);
  assert.equal(r.no_show_at, NOW);
});

test('restore devolve exatamente o estado anterior', () => {
  const pid = newPatient();
  applyAction(pid, 'botox', { action: 'contacted', cycleKey: 'c1' }, NOW);
  const original = row(pid, 'botox');
  const { before } = applyAction(pid, 'botox', { action: 'scheduled', date: '2026-11-12' }, NOW);
  restoreStates(pid, before);
  assert.deepEqual(row(pid, 'botox'), original);
});

test('restore de linha inexistente apaga a linha criada', () => {
  const pid = newPatient();
  const { before } = applyAction(pid, 'laser', { action: 'contacted', cycleKey: 'c1' }, NOW);
  assert.ok(row(pid, 'laser'));
  restoreStates(pid, before);
  assert.equal(row(pid, 'laser'), undefined);
});

test('archive em todos os procedimentos + restore mantém arquivada a categoria que já estava arquivada', () => {
  const pid = newPatient();
  applyAction(pid, 'laser', { action: 'archive', reason: 'Teve alta' }, NOW);
  applyAction(pid, 'botox', { action: 'contacted', cycleKey: 'c1' }, NOW);
  const { before } = applyAction(pid, 'botox', { action: 'archive', reason: 'Não volta mais', allCategories: true }, NOW);
  const total = db.prepare('SELECT COUNT(*) c FROM categories').get().c;
  assert.equal(before.length, total);
  assert.equal(row(pid, 'capilar').archived, 1);
  restoreStates(pid, before);
  assert.equal(row(pid, 'laser').archived, 1);
  assert.equal(row(pid, 'laser').archived_reason, 'Teve alta');
  assert.equal(row(pid, 'botox').archived, 0);
  assert.equal(row(pid, 'botox').contacted_for_cycle_date, 'c1');
  assert.equal(row(pid, 'capilar'), undefined);
});

test('archive com pausa grava archived_until e unarchive limpa', () => {
  const pid = newPatient();
  applyAction(pid, 'botox', { action: 'archive', reason: 'Pausa', until: '2027-01-10' }, NOW);
  assert.equal(row(pid, 'botox').archived_until, '2027-01-10');
  applyAction(pid, 'botox', { action: 'unarchive' }, NOW);
  assert.equal(row(pid, 'botox').archived, 0);
  assert.equal(row(pid, 'botox').archived_until, null);
});

test('restore rejeita linhas de outro paciente', () => {
  const pid = newPatient();
  const other = newPatient();
  const { before } = applyAction(other, 'botox', { action: 'contacted', cycleKey: 'c1' }, NOW);
  assert.throws(() => restoreStates(pid, before), (e) => e.status === 400);
});

test('ação desconhecida lança erro 400', () => {
  const pid = newPatient();
  assert.throws(() => applyAction(pid, 'botox', { action: 'explodir' }, NOW), (e) => e.status === 400);
});
