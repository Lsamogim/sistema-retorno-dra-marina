import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { computeStage } from '../stages.js';

const now = new Date('2026-11-05T15:00:00Z'); // hoje = 2026-11-05 em São Paulo
const hoursAgo = (h) => new Date(now.getTime() - h * 3600 * 1000).toISOString();
const item = (over = {}) => ({ status: 'em_dia', daysUntilDue: 20, lastDate: '2026-10-20', nextScheduled: null, ...over });

test('arquivado sem pausa → fora', () => {
  const r = computeStage(item({ status: 'arquivado' }), { archived: 1 }, now);
  assert.equal(r.stage, 'fora');
});

test('pausa vencida com atraso → chamar/atrasado', () => {
  const r = computeStage(
    item({ status: 'arquivado', daysUntilDue: -3 }),
    { archived: 1, archived_until: '2026-11-01' },
    now
  );
  assert.deepEqual(r, { stage: 'chamar', reason: 'atrasado', attempt: 1 });
});

test('pausa futura → fora', () => {
  const r = computeStage(item({ status: 'arquivado', daysUntilDue: -3 }), { archived: 1, archived_until: '2026-12-01' }, now);
  assert.equal(r.stage, 'fora');
});

test('agendamento da planilha → agendado/planilha', () => {
  const r = computeStage(item({ status: 'agendado', nextScheduled: { date: '2026-11-10' } }), {}, now);
  assert.deepEqual(r, { stage: 'agendado', reason: 'planilha', attempt: null });
});

test('feito há 2 dias → concluido', () => {
  const r = computeStage(item(), { done_at: hoursAgo(48) }, now);
  assert.equal(r.stage, 'concluido');
});

test('feito há 8 dias → ainda_nao', () => {
  const r = computeStage(item(), { done_at: hoursAgo(8 * 24) }, now);
  assert.equal(r.stage, 'ainda_nao');
});

test('agendou para amanhã → agendado/manual', () => {
  const r = computeStage(item({ status: 'atrasado', daysUntilDue: -2 }), { scheduled_for: '2026-11-06' }, now);
  assert.deepEqual(r, { stage: 'agendado', reason: 'manual', attempt: null });
});

test('agendou para hoje → agendado/manual', () => {
  const r = computeStage(item({ status: 'atrasado', daysUntilDue: -2 }), { scheduled_for: '2026-11-05' }, now);
  assert.equal(r.stage, 'agendado');
});

test('agendou para ontem sem atendimento → chamar/faltou', () => {
  const r = computeStage(
    item({ status: 'atrasado', daysUntilDue: -2, lastDate: '2026-10-20' }),
    { scheduled_for: '2026-11-04' },
    now
  );
  assert.deepEqual(r, { stage: 'chamar', reason: 'faltou', attempt: 1 });
});

test('agendou para ontem e a planilha trouxe atendimento → ignora scheduled_for', () => {
  const r = computeStage(item({ status: 'em_dia', daysUntilDue: 20, lastDate: '2026-11-04' }), { scheduled_for: '2026-11-04' }, now);
  assert.equal(r.stage, 'ainda_nao');
});

test('faltou registrado → chamar/faltou', () => {
  const r = computeStage(item({ status: 'atrasado', daysUntilDue: -1 }), { no_show_at: '2026-11-05T10:00:00Z' }, now);
  assert.deepEqual(r, { stage: 'chamar', reason: 'faltou', attempt: 1 });
});

test('contato há 1 dia → aguardando', () => {
  const r = computeStage(item({ status: 'aguardando', daysUntilDue: -1 }), { contacted_at: hoursAgo(24), contact_attempts: 1 }, now);
  assert.deepEqual(r, { stage: 'aguardando', reason: null, attempt: null });
});

test('contato há 4 dias → chamar/segunda_tentativa, attempt 2', () => {
  const r = computeStage(item({ status: 'aguardando', daysUntilDue: -6 }), { contacted_at: hoursAgo(96), contact_attempts: 1 }, now);
  assert.deepEqual(r, { stage: 'chamar', reason: 'segunda_tentativa', attempt: 2 });
});

test('atrasado → chamar/atrasado, attempt 1', () => {
  assert.deepEqual(computeStage(item({ status: 'atrasado', daysUntilDue: -2 }), {}, now), {
    stage: 'chamar',
    reason: 'atrasado',
    attempt: 1,
  });
});

test('vencendo → chamar/vencendo', () => {
  const r = computeStage(item({ status: 'vencendo', daysUntilDue: 3 }), {}, now);
  assert.equal(r.stage, 'chamar');
  assert.equal(r.reason, 'vencendo');
});

test('em dia sem marcações → ainda_nao', () => {
  assert.deepEqual(computeStage(item(), {}, now), { stage: 'ainda_nao', reason: null, attempt: null });
});

test('migração cria colunas e user_version 2', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'retornos-mig-'));
  process.env.DATA_DIR = dir;
  process.env.APP_PASSWORD = 'senha-teste-1234';
  const { initDatabase, default: db } = await import('../db.js');
  initDatabase();
  const cols = db.prepare("PRAGMA table_info('patient_category_states')").all().map((c) => c.name);
  for (const c of ['scheduled_for', 'done_at', 'contact_attempts', 'archived_until', 'no_show_at']) {
    assert.ok(cols.includes(c), `coluna ${c}`);
  }
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 2);
  db.close();
});
