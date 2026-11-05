import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'retornos-engine-'));
process.env.DATA_DIR = tmpDir;
process.env.APP_PASSWORD = 'senha-teste-1234';
const { initDatabase, default: db } = await import('../db.js');
initDatabase();
const { computeDashboardData } = await import('../returnEngine.js');
const { applyAction } = await import('../stateActions.js');

after(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const REF = '2026-11-05';
let seq = 0;
function patientWith(appointments) {
  seq += 1;
  const pid = Number(
    db
      .prepare('INSERT INTO patients (normalized_key, display_name, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(`motor ${seq}`, `Motor ${seq}`, REF, REF).lastInsertRowid
  );
  for (const [i, a] of appointments.entries()) {
    db.prepare(`
      INSERT INTO appointments (dedupe_hash, patient_id, category_id, kind, appointment_date, raw_service, situation)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(`h-${seq}-${i}`, pid, a.category, a.kind, a.date, a.service || 'Serviço', a.situation || 'Atendido');
  }
  return pid;
}
const setState = (pid, cat, fields) => {
  db.prepare('INSERT OR IGNORE INTO patient_category_states (patient_id, category_id) VALUES (?, ?)').run(pid, cat);
  for (const [k, v] of Object.entries(fields)) {
    db.prepare(`UPDATE patient_category_states SET ${k} = ? WHERE patient_id = ? AND category_id = ?`).run(v, pid, cat);
  }
};
const itemOf = (pid, cat) => computeDashboardData(REF).itemsByCategory[cat].find((i) => i.patientId === pid);

test('pausa vencida volta ao fluxo normal e ações mudam a etapa', () => {
  const pid = patientWith([{ category: 'laser', kind: 'procedure', date: '2026-09-01' }]);
  setState(pid, 'laser', { archived: 1, archived_reason: 'Pausa', archived_until: '2026-11-01' });
  const before = itemOf(pid, 'laser');
  assert.equal(before.stage, 'chamar');
  assert.notEqual(before.status, 'arquivado');
  applyAction(pid, 'laser', { action: 'contacted', cycleKey: before.cycleKey }, '2026-11-05T14:00:00.000Z');
  assert.equal(itemOf(pid, 'laser').stage, 'aguardando');
});

test('pausa ainda vigente continua fora da lista', () => {
  const pid = patientWith([{ category: 'laser', kind: 'procedure', date: '2026-09-01' }]);
  setState(pid, 'laser', { archived: 1, archived_reason: 'Pausa', archived_until: '2026-12-01' });
  assert.equal(itemOf(pid, 'laser').stage, 'fora');
});

test('agendou o retoque e a planilha trouxe o retoque: não vira falta', () => {
  const pid = patientWith([
    { category: 'botox', kind: 'procedure', date: '2026-10-01', service: 'Botox' },
    { category: 'botox', kind: 'review', date: '2026-10-16', service: 'Retorno Botox' },
  ]);
  setState(pid, 'botox', { scheduled_for: '2026-10-16' });
  const item = itemOf(pid, 'botox');
  assert.equal(item.lastAttendedDate, '2026-10-16');
  assert.notEqual(item.stageReason, 'faltou');
  assert.notEqual(item.stageReason, 'faltou_talvez');
});

test('falta registrada à mão é superada por atendimento posterior na planilha', () => {
  const pid = patientWith([
    { category: 'capilar', kind: 'procedure', date: '2026-10-01' },
    { category: 'capilar', kind: 'procedure', date: '2026-11-03' },
  ]);
  setState(pid, 'capilar', { no_show_at: '2026-10-20T12:00:00.000Z' });
  assert.notEqual(itemOf(pid, 'capilar').stageReason, 'faltou');
});
