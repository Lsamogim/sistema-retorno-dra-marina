import React, { useState } from 'react';
import { Lock } from 'lucide-react';

const MIN_LENGTH = 10;

/**
 * Troca da própria senha. Não usa <form> próprio para poder ficar dentro de outro
 * formulário (Configurações); quando `standalone`, envolve em um <form>.
 */
export default function PasswordChangeForm({ username, standalone = false, submitLabel, onSuccess }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const submit = async () => {
    setMsg(null);
    if (!currentPassword) {
      setMsg({ type: 'error', text: 'Digite a senha atual.' });
      return;
    }
    if (newPassword.length < MIN_LENGTH) {
      setMsg({ type: 'error', text: `A nova senha deve ter pelo menos ${MIN_LENGTH} caracteres.` });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMsg({ type: 'error', text: 'A confirmação não confere com a nova senha.' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/auth/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setMsg({ type: 'error', text: json?.error?.message || `Não foi possível trocar a senha (erro ${res.status}).` });
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMsg({ type: 'ok', text: 'Senha atualizada. Os outros aparelhos conectados foram desconectados.' });
      onSuccess?.();
    } catch {
      setMsg({ type: 'error', text: 'Sem conexão com o servidor. A senha NÃO foi alterada.' });
    } finally {
      setSaving(false);
    }
  };

  const fields = (
    <>
      {/* Campo oculto ajuda o gerenciador de senhas a associar a conta */}
      <input type="text" autoComplete="username" value={username || ''} readOnly hidden />
      <div className="settings-cat-grid" style={{ marginBottom: 8 }}>
        <div className="form-field" style={{ marginBottom: 0 }}>
          <label htmlFor="pw-current">Senha atual</label>
          <input
            id="pw-current"
            type="password"
            autoComplete="current-password"
            className="form-input"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </div>
        <div className="form-field" style={{ marginBottom: 0 }}>
          <label htmlFor="pw-new">Nova senha (mín. {MIN_LENGTH} caracteres)</label>
          <input
            id="pw-new"
            type="password"
            autoComplete="new-password"
            className="form-input"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </div>
        <div className="form-field" style={{ marginBottom: 0 }}>
          <label htmlFor="pw-confirm">Repita a nova senha</label>
          <input
            id="pw-confirm"
            type="password"
            autoComplete="new-password"
            className="form-input"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button
          type={standalone ? 'submit' : 'button'}
          className={standalone ? 'btn btn-clinical' : 'btn btn-outline'}
          disabled={saving}
          onClick={standalone ? undefined : submit}
        >
          <Lock size={14} />
          {saving ? 'Salvando...' : submitLabel || 'Trocar senha'}
        </button>
        {msg && (
          <span
            role={msg.type === 'error' ? 'alert' : 'status'}
            style={{
              fontSize: '12.5px',
              fontWeight: 600,
              color: msg.type === 'ok' ? 'var(--status-ok-ink)' : 'var(--status-overdue-ink)',
            }}
          >
            {msg.text}
          </span>
        )}
      </div>
    </>
  );

  if (!standalone) return fields;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {fields}
    </form>
  );
}
