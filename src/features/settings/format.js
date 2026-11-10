export function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const ACTION_LABELS = {
  login: 'Entrou no sistema',
  login_failed: 'Tentativa de login falhou',
  logout: 'Saiu do sistema',
  password_changed: 'Trocou a própria senha',
  password_change_failed: 'Errou a senha atual ao trocar a senha',
  user_created: 'Criou usuária',
  user_updated: 'Alterou usuária',
  patients_list_viewed: 'Abriu a lista de pacientes',
  patient_updated: 'Editou a ficha',
  patient_return_updated: 'Alterou o retorno',
  patients_merged: 'Unificou cadastros',
  report_imported: 'Importou a agenda',
  categories_updated: 'Alterou prazos e mensagens',
  backup_downloaded: 'Baixou o backup completo',
  contacted: 'Registrou contato por WhatsApp',
  scheduled: 'Registrou agendamento',
  done: 'Marcou retorno feito',
  no_show: 'Registrou falta',
  archive: 'Tirou da lista',
  unarchive: 'Voltou para a lista',
  restore: 'Desfez uma ação',
};

const CHANGE_LABELS = {
  displayName: 'nome',
  role: 'perfil',
  activated: 'reativada',
  deactivated: 'desativada',
  passwordReset: 'senha redefinida',
};

export function describeAudit(entry) {
  const d = entry.details || {};
  switch (entry.action) {
    case 'login_failed':
      return d.username ? `usuário digitado: ${d.username}` : '';
    case 'user_created':
      return `${d.username} (${d.role === 'admin' ? 'Administradora' : 'Recepção'})`;
    case 'user_updated':
      return `${d.username}: ${(d.changes || []).map((c) => CHANGE_LABELS[c] || c).join(', ')}`;
    case 'patient_updated':
      return `paciente #${entry.targetId}${d.fields?.length ? `: ${d.fields.join(', ')}` : ''}`;
    case 'patients_merged':
      return `#${d.mergedFrom} → #${entry.targetId}`;
    case 'report_imported':
      return `${d.filename || ''} · ${d.validEvents ?? 0} atendimentos`;
    default:
      return entry.targetType === 'patient' ? `paciente #${entry.targetId}${d.category ? ` · ${d.category}` : ''}` : '';
  }
}
