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
