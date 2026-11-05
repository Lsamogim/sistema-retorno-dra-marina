import { getLocalTodayIso } from './dates.js';

// Etapa do fluxo de trabalho de cada paciente/procedimento (spec, seção 2).
export const CALL_WINDOW_DAYS = 5;
export const AWAITING_DAYS = 3;
export const DONE_VISIBLE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;
const result = (stage, reason = null, attempt = null) => ({ stage, reason, attempt });

function byDueDate(item, state) {
  const attempt = (Number(state.contact_attempts) || 0) + 1;
  if (item.daysUntilDue < 0) return result('chamar', 'atrasado', attempt);
  if (item.daysUntilDue <= CALL_WINDOW_DAYS) return result('chamar', 'vencendo', attempt);
  return result('ainda_nao');
}

/**
 * @param item  item calculado pelo motor (status, daysUntilDue, lastDate, nextScheduled)
 * @param state linha de patient_category_states (ou {})
 * @param now   Date de referência
 * @returns {{stage: string, reason: string|null, attempt: number|null}}
 */
export function computeStage(item, state = {}, now = new Date()) {
  const today = getLocalTodayIso(now);
  const nowMs = now.getTime();
  const attempt = (Number(state.contact_attempts) || 0) + 1;

  if (state.archived) {
    const pauseEnded = state.archived_until && state.archived_until <= today;
    if (!pauseEnded) return result('fora');
    return byDueDate(item, state);
  }

  if (item.status === 'agendado') return result('agendado', 'planilha');

  if (item.status === 'em_dia' && state.done_at && nowMs - Date.parse(state.done_at) <= DONE_VISIBLE_DAYS * DAY_MS) {
    return result('concluido');
  }

  // Agendamento manual: vale até a planilha trazer atendimento nessa data ou depois.
  if (state.scheduled_for && !(item.lastDate && item.lastDate >= state.scheduled_for)) {
    if (state.scheduled_for >= today) return result('agendado', 'manual');
    return result('chamar', 'faltou', attempt);
  }

  if (state.no_show_at && (!state.contacted_at || state.no_show_at > state.contacted_at)) {
    return result('chamar', 'faltou', attempt);
  }

  if (item.status === 'aguardando') {
    if (state.contacted_at && nowMs - Date.parse(state.contacted_at) <= AWAITING_DAYS * DAY_MS) {
      return result('aguardando');
    }
    return result('chamar', 'segunda_tentativa', attempt);
  }

  if (item.status === 'atrasado') return result('chamar', 'atrasado', attempt);
  if (item.status === 'vencendo') return result('chamar', 'vencendo', attempt);
  return result('ainda_nao');
}
