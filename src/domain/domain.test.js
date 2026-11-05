import { describe, expect, test } from 'vitest';
import { STAGES, stageLabel } from './stages.js';
import { dueText, dueTone, ruleText, reasonText, doneActionLabel } from './vocab.js';
import { formatLongDate, formatShortDate } from './dates.js';

describe('etapas', () => {
  test('STAGES tem as 4 etapas do dia com rótulos', () => {
    expect(STAGES.map((s) => s.id)).toEqual(['chamar', 'aguardando', 'agendado', 'concluido']);
    expect(stageLabel('aguardando')).toBe('Aguardando resposta');
    expect(STAGES.find((s) => s.id === 'aguardando').shortLabel).toBe('Aguardando');
    expect(stageLabel('agendado')).toBe('Agendados');
    expect(stageLabel('fora')).toBe('Fora da lista');
    expect(stageLabel('ainda_nao')).toBe('Ainda não é hora');
  });
});

describe('dueText', () => {
  test.each([
    [-1, 'Atrasado 1 dia'],
    [-3, 'Atrasado 3 dias'],
    [0, 'Vence hoje'],
    [1, 'Vence amanhã'],
    [4, 'Vence em 4 dias'],
  ])('%i → %s', (days, text) => {
    expect(dueText(days)).toBe(text);
  });
});

describe('dueTone', () => {
  test('tons por etapa e prazo', () => {
    expect(dueTone({ stage: 'chamar', daysUntilDue: -2 })).toBe('late');
    expect(dueTone({ stage: 'chamar', daysUntilDue: 3 })).toBe('soon');
    expect(dueTone({ stage: 'aguardando', daysUntilDue: -2 })).toBe('waiting');
    expect(dueTone({ stage: 'agendado', daysUntilDue: -2 })).toBe('done');
    expect(dueTone({ stage: 'concluido', daysUntilDue: 30 })).toBe('done');
    expect(dueTone({ stage: 'fora', daysUntilDue: 30 })).toBe('out');
  });
});

describe('ruleText', () => {
  test('capilar, retoque, nova aplicação e ciclo', () => {
    expect(ruleText({ categoryId: 'capilar', effectiveIntervalDays: 21 })).toBe('Sessão a cada 21 dias');
    expect(ruleText({ categoryId: 'botox', hasDualReturn: true, cyclePhase: 'review' })).toBe('Retoque (15 dias)');
    expect(ruleText({ categoryId: 'botox', hasDualReturn: true, cyclePhase: 'renewal' })).toBe('Nova aplicação (6 meses)');
    expect(ruleText({ categoryId: 'laser', effectiveIntervalDays: 30 })).toBe('Ciclo de 30 dias');
  });
});

describe('reasonText', () => {
  test('tentativas e falta', () => {
    expect(reasonText({ stageReason: 'segunda_tentativa', attempt: 2 })).toBe('2ª tentativa');
    expect(reasonText({ stageReason: 'segunda_tentativa', attempt: 3 })).toBe('3ª tentativa');
    expect(reasonText({ stageReason: 'faltou' })).toBe('Faltou — remarcar');
    expect(reasonText({ stageReason: 'atrasado' })).toBe('');
    expect(reasonText({ stageReason: 'faltou_talvez', scheduledFor: '2026-11-04' })).toBe('Faltou? Estava agendado para 04/11');
  });
});

describe('doneActionLabel', () => {
  test('rótulo da ação de conclusão', () => {
    expect(doneActionLabel({ hasDualReturn: true, cyclePhase: 'review' })).toBe('Fez o retoque');
    expect(doneActionLabel({ hasDualReturn: true, cyclePhase: 'renewal' })).toBe('Fez nova aplicação');
    expect(doneActionLabel({ categoryId: 'capilar', cyclePhase: 'renewal' })).toBe('Veio');
  });
});

describe('grupo de atrasados antigos', () => {
  test('só atraso puro há mais de 60 dias', async () => {
    const { isStaleOverdue } = await import('./stages.js');
    expect(isStaleOverdue({ stage: 'chamar', stageReason: 'atrasado', daysUntilDue: -61 })).toBe(true);
    expect(isStaleOverdue({ stage: 'chamar', stageReason: 'segunda_tentativa', daysUntilDue: -90 })).toBe(false);
    expect(isStaleOverdue({ stage: 'chamar', stageReason: 'faltou', daysUntilDue: -90 })).toBe(false);
    expect(isStaleOverdue({ stage: 'chamar', stageReason: 'atrasado', daysUntilDue: -60 })).toBe(false);
  });
});

describe('datas', () => {
  test('formatLongDate e formatShortDate', () => {
    expect(formatLongDate('2026-11-05')).toBe('quinta, 5 de novembro');
    expect(formatShortDate('2026-11-05')).toBe('05/11/2026');
    expect(formatShortDate(null)).toBe('—');
  });
});
