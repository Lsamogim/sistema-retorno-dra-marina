import React, { useCallback, useEffect, useState } from 'react';
import { X, UserPlus, ShieldCheck, History, KeyRound, DatabaseBackup } from 'lucide-react';

const ROLE_LABELS = { admin: 'Administradora', recepcao: 'Recepção' };

const ACTION_LABELS = {
  login: 'Entrou no sistema',
  login_failed: 'Tentativa de login falhou',
  logout: 'Saiu do sistema',
  password_changed: 'Trocou a própria senha',
  password_change_failed: 'Errou a senha atual ao trocar senha',
  user_created: 'Criou usuária',
  user_updated: 'Alterou usuária',
  patients_list_viewed: 'Abriu a lista de pacientes',
  patient_updated: 'Editou ficha de paciente',
  patient_return_updated: 'Atualizou retorno de paciente',
  patients_merged: 'Unificou cadastros',
  report_imported: 'Importou planilha',
  categories_updated: 'Alterou prazos e mensagens',
  backup_downloaded: 'Baixou backup completo',
};

const CHANGE_LABELS = {
  displayName: 'nome',
  role: 'perfil',
  activated: 'reativada',
  deactivated: 'desativada',
  passwordReset: 'senha redefinida',
};

function formatDateTime(iso) {
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

function describeDetails(entry) {
  const d = entry.details || {};
  switch (entry.action) {
    case 'login_failed':
      return d.username ? `usuário digitado: ${d.username}` : '';
    case 'user_created':
      return `${d.username} (${ROLE_LABELS[d.role] || d.role})`;
    case 'user_updated':
      return `${d.username}: ${(d.changes || []).map((c) => CHANGE_LABELS[c] || c).join(', ')}`;
    case 'patient_updated':
      return `paciente #${entry.targetId}${d.fields?.length ? ` — ${d.fields.join(', ')}` : ''}`;
    case 'patient_return_updated':
      return `paciente #${entry.targetId} — ${d.category || ''}`;
    case 'patients_merged':
      return `#${d.mergedFrom} → #${entry.targetId}`;
    case 'report_imported':
      return `${d.filename || ''} · ${d.validEvents ?? 0} atendimentos${d.removedAppointments ? ` · ${d.removedAppointments} removidos` : ''}`;
    default:
      return '';
  }
}

async function apiJson(url, options = {}) {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error?.message || `Erro ${res.status}`);
  return json;
}

function UsersTab({ currentUserId }) {
  const [users, setUsers] = useState([]);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ displayName: '', username: '', role: 'recepcao', temporaryPassword: '' });
  const [resetFor, setResetFor] = useState(null);
  const [resetPassword, setResetPassword] = useState('');

  const load = useCallback(async () => {
    try {
      const json = await apiJson('/api/admin/users');
      setUsers(json.users);
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn, okText) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ type: 'ok', text: okText });
      await load();
      return true;
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const createUser = async () => {
    const ok = await run(
      () => apiJson('/api/admin/users', { method: 'POST', body: JSON.stringify(form) }),
      `Usuária "${form.username}" criada. Passe a senha temporária pessoalmente; ela vai trocar no primeiro acesso.`
    );
    if (ok) setForm({ displayName: '', username: '', role: 'recepcao', temporaryPassword: '' });
  };

  const patchUser = (u, body, okText) =>
    run(() => apiJson(`/api/admin/users/${u.id}`, { method: 'PATCH', body: JSON.stringify(body) }), okText);

  return (
    <div>
      <div className="settings-cat-card" style={{ borderColor: '#b8dcd3', backgroundColor: '#f6faf9' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <UserPlus size={16} style={{ color: 'var(--accent-clinical)' }} />
          <strong style={{ fontSize: '14px' }}>Nova usuária</strong>
        </div>
        <div className="settings-cat-grid" style={{ marginBottom: 8 }}>
          <div className="form-field" style={{ marginBottom: 0 }}>
            <label htmlFor="nu-name">Nome</label>
            <input
              id="nu-name"
              className="form-input"
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              placeholder="Ex.: Ana (recepção)"
            />
          </div>
          <div className="form-field" style={{ marginBottom: 0 }}>
            <label htmlFor="nu-user">Usuário de login</label>
            <input
              id="nu-user"
              className="form-input"
              autoComplete="off"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().trim() })}
              placeholder="ex.: ana.recepcao"
            />
          </div>
          <div className="form-field" style={{ marginBottom: 0 }}>
            <label htmlFor="nu-role">Perfil</label>
            <select
              id="nu-role"
              className="form-input"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              <option value="recepcao">Recepção</option>
              <option value="admin">Administradora</option>
            </select>
          </div>
          <div className="form-field" style={{ marginBottom: 0 }}>
            <label htmlFor="nu-pass">Senha temporária (mín. 10)</label>
            <input
              id="nu-pass"
              type="password"
              autoComplete="new-password"
              className="form-input"
              value={form.temporaryPassword}
              onChange={(e) => setForm({ ...form, temporaryPassword: e.target.value })}
            />
          </div>
        </div>
        <button type="button" className="btn btn-clinical" disabled={busy} onClick={createUser}>
          <UserPlus size={14} /> Criar usuária
        </button>
        <p style={{ fontSize: '12px', color: 'var(--ink-secondary)', margin: '8px 0 0' }}>
          Recepção usa a lista de retornos, edita fichas e importa planilhas. Só administradoras alteram
          prazos e mensagens, baixam o backup completo e gerenciam usuárias.
        </p>
      </div>

      {msg && (
        <div
          role={msg.type === 'error' ? 'alert' : 'status'}
          style={{
            margin: '10px 0',
            fontSize: '13px',
            fontWeight: 600,
            color: msg.type === 'ok' ? 'var(--status-ok-ink)' : 'var(--status-overdue-ink)',
          }}
        >
          {msg.text}
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Nome</th>
              <th scope="col">Usuário</th>
              <th scope="col">Perfil</th>
              <th scope="col">Último acesso</th>
              <th scope="col">Situação</th>
              <th scope="col">
                <span className="visually-hidden">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isSelf = u.id === currentUserId;
              return (
                <React.Fragment key={u.id}>
                  <tr className={u.active ? '' : 'admin-row-inactive'}>
                    <td>
                      {u.displayName}
                      {isSelf && <span className="admin-badge">você</span>}
                    </td>
                    <td className="tabular">{u.username}</td>
                    <td>
                      <select
                        aria-label={`Perfil de ${u.username}`}
                        className="form-input admin-inline-select"
                        value={u.role}
                        disabled={isSelf || busy}
                        onChange={(e) =>
                          patchUser(u, { role: e.target.value }, `Perfil de ${u.username} atualizado.`)
                        }
                      >
                        <option value="recepcao">Recepção</option>
                        <option value="admin">Administradora</option>
                      </select>
                    </td>
                    <td className="tabular">{formatDateTime(u.lastLoginAt)}</td>
                    <td>
                      {u.active ? (u.mustChangePassword ? 'Aguardando 1º acesso' : 'Ativa') : 'Desativada'}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        className="btn-ghost-sm"
                        disabled={busy}
                        onClick={() => {
                          setResetFor(resetFor === u.id ? null : u.id);
                          setResetPassword('');
                        }}
                      >
                        <KeyRound size={13} /> Redefinir senha
                      </button>
                      {!isSelf && (
                        <button
                          type="button"
                          className="btn-ghost-sm"
                          disabled={busy}
                          onClick={() => {
                            if (
                              u.active &&
                              !window.confirm(`Desativar ${u.displayName}? Ela será desconectada na hora.`)
                            ) {
                              return;
                            }
                            patchUser(
                              u,
                              { active: !u.active },
                              u.active ? `${u.username} desativada.` : `${u.username} reativada.`
                            );
                          }}
                        >
                          {u.active ? 'Desativar' : 'Reativar'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {resetFor === u.id && (
                    <tr>
                      <td colSpan={6}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                          <div className="form-field" style={{ marginBottom: 0 }}>
                            <label htmlFor={`reset-${u.id}`}>Nova senha temporária para {u.username}</label>
                            <input
                              id={`reset-${u.id}`}
                              type="password"
                              autoComplete="new-password"
                              className="form-input"
                              value={resetPassword}
                              onChange={(e) => setResetPassword(e.target.value)}
                            />
                          </div>
                          <button
                            type="button"
                            className="btn btn-outline"
                            disabled={busy}
                            onClick={async () => {
                              const ok = await patchUser(
                                u,
                                { temporaryPassword: resetPassword },
                                `Senha de ${u.username} redefinida. Ela vai criar uma nova no próximo acesso.`
                              );
                              if (ok) setResetFor(null);
                            }}
                          >
                            Salvar senha temporária
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AuditTab() {
  const [entries, setEntries] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const PAGE = 100;

  const load = useCallback(async (beforeId = null) => {
    setLoading(true);
    try {
      const json = await apiJson(`/api/admin/audit?limit=${PAGE}${beforeId ? `&before=${beforeId}` : ''}`);
      setEntries((prev) => (beforeId ? [...prev, ...json.entries] : json.entries));
      setHasMore(json.entries.length === PAGE);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <p style={{ fontSize: '12.5px', color: 'var(--ink-secondary)', marginTop: 0 }}>
        Registro de quem acessou e alterou os dados (LGPD). Não guarda conteúdo de fichas, telefones ou
        senhas.
      </p>
      {error && (
        <div role="alert" style={{ color: 'var(--status-overdue-ink)', fontWeight: 600, marginBottom: 8 }}>
          {error}
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Quando</th>
              <th scope="col">Quem</th>
              <th scope="col">Ação</th>
              <th scope="col">Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className={e.action === 'login_failed' ? 'admin-row-warning' : ''}>
                <td className="tabular" style={{ whiteSpace: 'nowrap' }}>
                  {formatDateTime(e.at)}
                </td>
                <td>{e.username || '—'}</td>
                <td>{ACTION_LABELS[e.action] || e.action}</td>
                <td>{describeDetails(e)}</td>
              </tr>
            ))}
            {!entries.length && !loading && (
              <tr>
                <td colSpan={4}>Nenhum registro ainda.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {hasMore && (
        <button
          type="button"
          className="btn btn-outline"
          style={{ marginTop: 10 }}
          disabled={loading}
          onClick={() => load(entries[entries.length - 1]?.id)}
        >
          {loading ? 'Carregando...' : 'Carregar registros mais antigos'}
        </button>
      )}
    </div>
  );
}

function StatusLine({ ok, warn, children }) {
  const color = ok ? 'var(--status-ok-ink)' : warn ? 'var(--status-soon-ink)' : 'var(--status-overdue-ink)';
  return (
    <li style={{ marginBottom: 6 }}>
      <strong style={{ color }}>{ok ? '✓' : warn ? '!' : '✗'}</strong> {children}
    </li>
  );
}

function BackupsTab() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiJson('/api/admin/backup-status')
      .then(setStatus)
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <div role="alert" style={{ color: 'var(--status-overdue-ink)', fontWeight: 600 }}>
        {error}
      </div>
    );
  }
  if (!status) return <p>Carregando...</p>;

  const { local, offsite, encryptionKeyConfigured } = status;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const offsiteFresh = offsite.lastUploadDate === today;

  return (
    <div>
      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 14px', fontSize: '13.5px' }}>
        <StatusLine ok={local.latestDate === today} warn={Boolean(local.latestDate)}>
          Backup diário no servidor:{' '}
          {local.latest
            ? `último em ${local.latestDate.split('-').reverse().join('/')} (${local.count} guardados, até ${local.retentionDays} dias)`
            : 'nenhum ainda (o primeiro é criado 1 minuto após o servidor iniciar)'}
        </StatusLine>
        <StatusLine ok={encryptionKeyConfigured}>
          Criptografia dos backups:{' '}
          {encryptionKeyConfigured
            ? 'ativada (AES-256)'
            : 'desativada — defina BACKUP_ENCRYPTION_KEY no Railway'}
        </StatusLine>
        <StatusLine ok={offsite.configured && offsiteFresh} warn={offsite.configured && !offsite.lastError}>
          Cópia fora do Railway:{' '}
          {!offsite.configured
            ? 'não configurada'
            : offsite.lastUploadDate
            ? `último envio em ${formatDateTime(offsite.lastUploadAt)} para ${offsite.endpointHost} / ${offsite.bucket} (guardados ${offsite.retentionDays} dias)`
            : `configurada (${offsite.endpointHost} / ${offsite.bucket}), aguardando o primeiro envio`}
        </StatusLine>
      </ul>
      {offsite.lastError && (
        <div className="settings-cat-card" style={{ borderColor: 'var(--status-overdue-border)', background: 'var(--status-overdue-bg)', fontSize: '13px' }}>
          <strong>Último erro no envio externo</strong> ({formatDateTime(offsite.lastErrorAt)}):
          <div style={{ marginTop: 4 }}>{offsite.lastError}</div>
        </div>
      )}
      <p style={{ fontSize: '12.5px', color: 'var(--ink-secondary)' }}>
        Os backups não contêm senhas nem sessões. A cópia externa só é enviada cifrada; guarde a chave
        de criptografia em local seguro fora do sistema, porque sem ela não é possível restaurar.
      </p>
    </div>
  );
}

export default function AdminModal({ currentUser, onClose }) {
  const [tab, setTab] = useState('users');

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay-backdrop" onClick={onClose}>
      <div
        className="modal-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-modal-title"
      >
        <div className="panel-header">
          <div>
            <h2 id="admin-modal-title">Administração</h2>
            <div className="admin-tabs" role="tablist" aria-label="Seções da administração">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'users'}
                className={`admin-tab ${tab === 'users' ? 'is-active' : ''}`}
                onClick={() => setTab('users')}
              >
                <ShieldCheck size={14} /> Usuárias
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'audit'}
                className={`admin-tab ${tab === 'audit' ? 'is-active' : ''}`}
                onClick={() => setTab('audit')}
              >
                <History size={14} /> Auditoria
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'backups'}
                className={`admin-tab ${tab === 'backups' ? 'is-active' : ''}`}
                onClick={() => setTab('backups')}
              >
                <DatabaseBackup size={14} /> Backups
              </button>
            </div>
          </div>
          <button type="button" className="btn-ghost-sm" onClick={onClose} aria-label="Fechar administração">
            <X size={16} />
          </button>
        </div>
        <div className="panel-body" role="tabpanel">
          {tab === 'users' && <UsersTab currentUserId={currentUser.id} />}
          {tab === 'audit' && <AuditTab />}
          {tab === 'backups' && <BackupsTab />}
        </div>
      </div>
    </div>
  );
}
