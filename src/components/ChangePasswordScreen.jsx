import React from 'react';
import { KeyRound, LogOut } from 'lucide-react';
import PasswordChangeForm from './PasswordChangeForm.jsx';

/** Tela obrigatória no primeiro acesso (ou após a administradora redefinir a senha). */
export default function ChangePasswordScreen({ user, onDone, onLogout }) {
  return (
    <div className="login-page-shell">
      <div className="login-card" style={{ maxWidth: 520 }}>
        <div className="login-brand-header">
          <div className="login-shield-badge">
            <KeyRound size={24} />
          </div>
          <h1>Defina sua senha</h1>
          <p>
            Olá, {user.displayName || user.username}. Por segurança, troque a senha temporária antes de
            acessar os dados dos pacientes.
          </p>
        </div>
        <PasswordChangeForm
          username={user.username}
          standalone
          submitLabel="Salvar nova senha e entrar"
          onSuccess={onDone}
        />
        <button
          type="button"
          className="btn btn-outline"
          style={{ marginTop: 14 }}
          onClick={onLogout}
        >
          <LogOut size={13} /> Sair
        </button>
      </div>
    </div>
  );
}
