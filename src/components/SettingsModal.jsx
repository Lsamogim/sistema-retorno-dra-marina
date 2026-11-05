import React, { useEffect, useState } from 'react';
import { X, Save, Lock, Globe, Copy, Check } from 'lucide-react';

export default function SettingsModal({
  categories,
  currentUsername,
  onClose,
  onSave,
  onCredentialsUpdated,
  authHeaders,
}) {
  const [draft, setDraft] = useState(() =>
    categories.map((c) => ({
      id: c.id,
      name: c.name,
      recurrenceDays: c.recurrenceDays,
      reviewDays: c.reviewDays ?? '',
      whatsappTemplate: c.whatsappTemplate || '',
      reviewWhatsappTemplate: c.reviewWhatsappTemplate || '',
    }))
  );
  const [saving, setSaving] = useState(false);

  const [serverInfo, setServerInfo] = useState({ localUrls: [], remoteUrl: null });
  const [copiedUrl, setCopiedUrl] = useState('');

  const [newUsername, setNewUsername] = useState(currentUsername || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [authSaving, setAuthSaving] = useState(false);
  const [authMsg, setAuthMsg] = useState(null);

  useEffect(() => {
    fetch('/api/server-info', {
      headers: authHeaders ? authHeaders() : {},
      credentials: 'include',
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setServerInfo(data);
      })
      .catch(() => {});
  }, [authHeaders]);

  const handleCopyUrl = (url) => {
    navigator.clipboard?.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(''), 2500);
  };

  const handleSaveCredentials = async () => {
    if (!currentPassword) {
      setAuthMsg({ type: 'error', text: 'Digite a senha atual para confirmar a alteração.' });
      return;
    }
    setAuthSaving(true);
    setAuthMsg(null);
    try {
      const res = await fetch('/api/auth/credentials', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeaders ? authHeaders() : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          currentPassword,
          newUsername,
          newPassword,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setAuthMsg({ type: 'error', text: json.error?.message || 'Erro ao atualizar senha.' });
        return;
      }
      localStorage.removeItem('dra_marina_auth_token');
      setCurrentPassword('');
      setNewPassword('');
      setAuthMsg({ type: 'ok', text: 'Usuário e senha atualizados com sucesso!' });
      if (onCredentialsUpdated) {
        onCredentialsUpdated(json.username);
      }
    } catch {
      setAuthMsg({ type: 'error', text: 'Erro de conexão ao salvar credenciais.' });
    } finally {
      setAuthSaving(false);
    }
  };

  const handleField = (id, field, value) => {
    setDraft((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="panel-header">
          <div>
            <h2>Prazos de retorno e mensagens do WhatsApp</h2>
            <div style={{ fontSize: '12.5px', color: 'var(--ink-secondary)', marginTop: 2 }}>
              Variáveis disponíveis nas mensagens: <code>{'{nome}'}</code>, <code>{'{procedimento}'}</code>,{' '}
              <code>{'{servico}'}</code>, <code>{'{dias_retorno}'}</code> e <code>{'{data_retorno}'}</code>
            </div>
          </div>
          <button type="button" className="btn-ghost-sm" onClick={onClose} aria-label="Fechar configurações">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <div className="panel-body">
            {/* Bloco 1: Links de Acesso Remoto e Wi-Fi + Segurança */}
            <div className="settings-cat-card" style={{ borderColor: '#b8dcd3', backgroundColor: '#f6faf9' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Globe size={16} style={{ color: 'var(--accent-clinical)' }} />
                <strong style={{ fontSize: '14.5px' }}>
                  Acesso em qualquer PC ou Celular (Dados Centralizados)
                </strong>
              </div>
              <p style={{ fontSize: '12.5px', color: 'var(--ink-secondary)', margin: '0 0 10px' }}>
                Todos os aparelhos que entrarem pelos links abaixo com seu usuário e senha acessam e
                salvam no mesmo banco de dados deste notebook em tempo real:
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 14 }}>
                {serverInfo.remoteUrl ? (
                  <div className="access-url-row">
                    <div>
                      <span className="access-url-tag is-remote">Qualquer lugar (4G/5G/Casa)</span>
                      <code className="access-url-code">{serverInfo.remoteUrl}</code>
                    </div>
                    <button
                      type="button"
                      className="btn-ghost-sm"
                      onClick={() => handleCopyUrl(serverInfo.remoteUrl)}
                    >
                      {copiedUrl === serverInfo.remoteUrl ? <Check size={13} /> : <Copy size={13} />}
                      {copiedUrl === serverInfo.remoteUrl ? 'Copiado' : 'Copiar link'}
                    </button>
                  </div>
                ) : (
                  <div className="access-url-row">
                    <div>
                      <span className="access-url-tag">Fora do Wi-Fi (4G/5G/Casa)</span>
                      <span style={{ fontSize: '12px', color: 'var(--ink-secondary)' }}>
                        Abra pelo atalho <strong>&quot;Abrir com Acesso Remoto.bat&quot;</strong> na
                        pasta do sistema para gerar o link externo.
                      </span>
                    </div>
                  </div>
                )}

                {serverInfo.localUrls?.map((url) => (
                  <div key={url} className="access-url-row">
                    <div>
                      <span className="access-url-tag is-wifi">Mesmo Wi-Fi do Notebook</span>
                      <code className="access-url-code">{url}</code>
                    </div>
                    <button
                      type="button"
                      className="btn-ghost-sm"
                      onClick={() => handleCopyUrl(url)}
                    >
                      {copiedUrl === url ? <Check size={13} /> : <Copy size={13} />}
                      {copiedUrl === url ? 'Copiado' : 'Copiar link'}
                    </button>
                  </div>
                ))}
              </div>

              <div
                style={{
                  borderTop: '1px solid #d5e3df',
                  paddingTop: 12,
                  marginTop: 6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                  <Lock size={15} style={{ color: 'var(--accent-clinical)' }} />
                  <strong style={{ fontSize: '13.5px' }}>Alterar Usuário e Senha de Login</strong>
                </div>

                <div className="settings-cat-grid" style={{ marginBottom: 8 }}>
                  <div className="form-field" style={{ marginBottom: 0 }}>
                    <label htmlFor="auth-user">Usuário</label>
                    <input
                      id="auth-user"
                      type="text"
                      className="form-input"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                    />
                  </div>
                  <div className="form-field" style={{ marginBottom: 0 }}>
                    <label htmlFor="auth-cur-pass">Senha atual (obrigatória p/ mudar)</label>
                    <input
                      id="auth-cur-pass"
                      type="password"
                      className="form-input"
                      placeholder="Senha atual"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                    />
                  </div>
                  <div className="form-field" style={{ marginBottom: 0 }}>
                    <label htmlFor="auth-new-pass">Nova senha</label>
                    <input
                      id="auth-new-pass"
                      type="password"
                      className="form-input"
                      placeholder="Nova senha (mín. 8 caracteres)"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    disabled={authSaving}
                    onClick={handleSaveCredentials}
                  >
                    <Lock size={14} />
                    {authSaving ? 'Atualizando...' : 'Atualizar login/senha'}
                  </button>
                  {authMsg && (
                    <span
                      style={{
                        fontSize: '12.5px',
                        fontWeight: 600,
                        color:
                          authMsg.type === 'ok'
                            ? 'var(--status-ok-ink)'
                            : 'var(--status-overdue-ink)',
                      }}
                    >
                      {authMsg.text}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {draft.map((cat) => (
              <div key={cat.id} className="settings-cat-card">
                <div className="settings-cat-grid">
                  <div>
                    <strong style={{ fontSize: '14.5px' }}>{cat.name}</strong>
                    <div style={{ fontSize: '12px', color: 'var(--ink-secondary)', marginTop: 2 }}>
                      {cat.id === 'capilar'
                        ? `Protocolo individual por paciente: 15, 21 ou 30 dias (padrão inicial: ${cat.recurrenceDays}d)`
                        : cat.reviewDays
                        ? `Retoque em ${cat.reviewDays} dias · Procedimento em ${cat.recurrenceDays} dias (${Math.round(
                            Number(cat.recurrenceDays) / 30
                          )} meses)`
                        : `Ciclo de ${cat.recurrenceDays} dias`}
                    </div>
                  </div>
                  <div className="form-field" style={{ marginBottom: 0 }}>
                    <label htmlFor={`rev-${cat.id}`}>1º Retorno: Retoque (dias)</label>
                    <input
                      id={`rev-${cat.id}`}
                      type="number"
                      min="1"
                      max="180"
                      placeholder="Sem retoque"
                      className="form-input tabular"
                      value={cat.reviewDays}
                      onChange={(e) => handleField(cat.id, 'reviewDays', e.target.value)}
                    />
                  </div>
                  <div className="form-field" style={{ marginBottom: 0 }}>
                    <label htmlFor={`rec-${cat.id}`}>
                      {cat.reviewDays ? '2º Retorno: Procedimento (dias)' : 'Retorno do procedimento (dias)'}
                    </label>
                    <input
                      id={`rec-${cat.id}`}
                      type="number"
                      min="1"
                      max="730"
                      className="form-input tabular"
                      value={cat.recurrenceDays}
                      onChange={(e) => handleField(cat.id, 'recurrenceDays', e.target.value)}
                      required
                    />
                  </div>
                </div>

                {cat.reviewDays !== '' && cat.reviewDays != null && (
                  <div className="form-field" style={{ marginBottom: 10 }}>
                    <label htmlFor={`revmsg-${cat.id}`}>
                      Mensagem do 1º Retorno — Retoque / Avaliação ({cat.reviewDays} dias)
                    </label>
                    <textarea
                      id={`revmsg-${cat.id}`}
                      className="form-textarea"
                      rows={2}
                      value={cat.reviewWhatsappTemplate}
                      onChange={(e) => handleField(cat.id, 'reviewWhatsappTemplate', e.target.value)}
                    />
                  </div>
                )}

                <div className="form-field" style={{ marginBottom: 0 }}>
                  <label htmlFor={`msg-${cat.id}`}>
                    {cat.reviewDays
                      ? `Mensagem do 2º Retorno — Procedimento (${cat.recurrenceDays} dias / ${Math.round(
                          Number(cat.recurrenceDays) / 30
                        )} meses)`
                      : 'Mensagem padrão de retorno do procedimento'}
                  </label>
                  <textarea
                    id={`msg-${cat.id}`}
                    className="form-textarea"
                    rows={2}
                    value={cat.whatsappTemplate}
                    onChange={(e) => handleField(cat.id, 'whatsappTemplate', e.target.value)}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="panel-footer">
            <button type="button" className="btn btn-outline" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-clinical" disabled={saving}>
              <Save size={15} />
              {saving ? 'Salvando...' : 'Salvar configurações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
