import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'retornos-today-'));
process.env.DATA_DIR = tmpDir;
process.env.APP_PASSWORD = 'senha-teste-1234';
const { buildTodayData } = await import('../returnEngine.js');
const { default: db } = await import('../db.js');
after(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const it = (patientId, stage, extra = {}) => ({
  patientId,
  categoryId: 'botox',
  patientName: `Paciente ${patientId}`,
  stage,
  daysUntilDue: 0,
  ...extra,
});

const dashboard = {
  referenceDate: '2026-11-05',
  categories: [{ id: 'botox', name: 'Botox', shortName: 'Botox' }],
  itemsByCategory: {
    botox: [
      it(1, 'chamar', { daysUntilDue: 2 }),
      it(2, 'chamar', { daysUntilDue: -4 }),
      it(3, 'aguardando', { contactedAt: '2026-11-04T10:00:00Z' }),
      it(4, 'agendado', { scheduledFor: '2026-11-08' }),
      it(5, 'concluido', { doneAt: '2026-11-03T10:00:00Z' }),
      it(6, 'ainda_nao', { daysUntilDue: 30 }),
      it(7, 'fora'),
      it(8, 'chamar', { daysUntilDue: -200 }),
      it(9, 'chamar', { daysUntilDue: -75 }),
      it(10, 'chamar', { daysUntilDue: -90, stageReason: 'segunda_tentativa' }),
    ],
  },
};

test('buildTodayData conta só as 4 etapas do dia', () => {
  const t = buildTodayData(dashboard);
  assert.deepEqual(t.counts, { chamar: 3, chamarAntigos: 2, aguardando: 1, agendado: 1, concluido: 1 });
  assert.equal(t.items.length, 8);
  assert.ok(t.items.every((i) => !['ainda_nao', 'fora'].includes(i.stage)));
});

test('chamar: recentes do mais atrasado ao menos urgente, depois antigos do mais recente ao mais antigo', () => {
  const chamar = buildTodayData(dashboard).items.filter((i) => i.stage === 'chamar');
  assert.deepEqual(chamar.map((i) => i.patientId), [10, 2, 1, 9, 8]);
});

test('atrasados há mais de 60 dias marcados como staleOverdue', () => {
  const byId = Object.fromEntries(buildTodayData(dashboard).items.map((i) => [i.patientId, i]));
  assert.equal(byId[9].staleOverdue, true);
  assert.equal(byId[8].staleOverdue, true);
  assert.equal(byId[2].staleOverdue, false);
  assert.equal(byId[10].staleOverdue, false, '2ª tentativa nunca vai para o grupo de antigos');
});

test('buildTodayData devolve data de referência e categorias', () => {
  const t = buildTodayData(dashboard);
  assert.equal(t.referenceDate, '2026-11-05');
  assert.deepEqual(t.categories, [{ id: 'botox', name: 'Botox', shortName: 'Botox' }]);
});
