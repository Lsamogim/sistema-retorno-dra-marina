// Etapas do fluxo (spec, seção 2.1). Nomes exatos usados em toda a interface.
export const STAGES = [
  { id: 'chamar', label: 'Chamar', shortLabel: 'Chamar' },
  { id: 'aguardando', label: 'Aguardando resposta', shortLabel: 'Aguardando' },
  { id: 'agendado', label: 'Agendados', shortLabel: 'Agendados' },
  { id: 'concluido', label: 'Concluídos', shortLabel: 'Concluídos' },
];

const OTHER_LABELS = { ainda_nao: 'Ainda não é hora', fora: 'Fora da lista' };

export function stageLabel(id) {
  return STAGES.find((s) => s.id === id)?.label || OTHER_LABELS[id] || id;
}

export const TODAY_STAGE_IDS = STAGES.map((s) => s.id);
export const STALE_OVERDUE_DAYS = 60;

export const isStaleOverdue = (item) => item.stage === 'chamar' && item.daysUntilDue < -STALE_OVERDUE_DAYS;

const SORTERS = {
  chamar: (a, b) => {
    const sa = isStaleOverdue(a);
    const sb = isStaleOverdue(b);
    if (sa !== sb) return sa ? 1 : -1;
    return sa ? b.daysUntilDue - a.daysUntilDue : a.daysUntilDue - b.daysUntilDue;
  },
  aguardando: (a, b) => String(a.contactedAt || '').localeCompare(String(b.contactedAt || '')),
  agendado: (a, b) =>
    String(a.scheduledFor || a.nextScheduled?.date || '').localeCompare(String(b.scheduledFor || b.nextScheduled?.date || '')),
  concluido: (a, b) => String(b.doneAt || '').localeCompare(String(a.doneAt || '')),
};

/** Mesma ordem que o servidor usa em /api/today. */
export function sortForStage(stage, items) {
  return [...items].sort(SORTERS[stage] || (() => 0));
}

/** Etapa prevista para uma ação antes da resposta do servidor. */
export const PREDICTED_STAGE = {
  contacted: 'aguardando',
  scheduled: 'agendado',
  done: 'concluido',
  no_show: 'chamar',
  archive: 'fora',
};
