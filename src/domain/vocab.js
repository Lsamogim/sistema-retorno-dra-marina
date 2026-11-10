import { formatShortDate } from './dates.js';

// Vocabulário único da interface (spec, seção 2.2, regra 4).
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function dueText(daysUntilDue) {
  if (daysUntilDue < 0) return `Atrasado ${plural(-daysUntilDue, 'dia', 'dias')}`;
  if (daysUntilDue === 0) return 'Vence hoje';
  if (daysUntilDue === 1) return 'Vence amanhã';
  return `Vence em ${daysUntilDue} dias`;
}

export function dueTone(item) {
  switch (item.stage) {
    case 'chamar':
      return item.daysUntilDue < 0 ? 'late' : 'soon';
    case 'aguardando':
      return 'waiting';
    case 'agendado':
    case 'concluido':
      return 'done';
    default:
      return 'out';
  }
}

export function ruleText(item) {
  if (item.categoryId === 'capilar') return `Sessão a cada ${item.effectiveIntervalDays} dias`;
  if (item.hasDualReturn) return item.cyclePhase === 'review' ? 'Retoque (15 dias)' : 'Nova aplicação (6 meses)';
  return `Ciclo de ${item.effectiveIntervalDays} dias`;
}

export function reasonText(item) {
  if (item.stageReason === 'segunda_tentativa') return `${item.attempt}ª tentativa`;
  if (item.stageReason === 'faltou') return 'Faltou, remarcar';
  if (item.stageReason === 'faltou_talvez') return `Faltou? Estava agendado para ${formatShortDate(item.scheduledFor).slice(0, 5)}`;
  return '';
}

export function doneActionLabel(item) {
  if (item.hasDualReturn) return item.cyclePhase === 'review' ? 'Fez o retoque' : 'Fez nova aplicação';
  return 'Veio';
}

/** Marco que a ação "feito" conclui: retoque na fase de revisão, senão a renovação. */
export function doneMilestone(item) {
  return item.hasDualReturn && item.cyclePhase === 'review' ? 'review' : 'renewal';
}
