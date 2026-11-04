import React, { useState } from 'react';
import { Lock, User, Eye, EyeOff, ShieldCheck } from 'lucide-react';

export default function LoginScreen({ onLoginSuccess }) {
  const [username, setUsername] = useState('dramarina');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error?.message || 'Usuário ou senha incorretos.');
        return;
      }
      localStorage.removeItem('dra_marina_auth_token');
      onLoginSuccess({ username: json.username });
    } catch {
      setErrorMsg('Não foi possível conectar ao servidor. Verifique se o notebook está ligado.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page-shell">
      <div className="login-card">
        <div className="login-brand-header">
          <div className="login-shield-badge">
            <ShieldCheck size={24} />
          </div>
          <h1>Dra. Marina Carbonera</h1>
          <p>Sistema de Controle de Retorno · Acesso Restrito</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-field">
            <label htmlFor="login-username">Usuário</label>
            <div className="login-input-wrap">
              <User size={16} className="login-input-icon" />
              <input
                id="login-username"
                type="text"
                autoComplete="username"
                className="form-input login-input"
                placeholder="dramarina"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="login-password">Senha de acesso</label>
            <div className="login-input-wrap">
              <Lock size={16} className="login-input-icon" />
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                className="form-input login-input login-input-pass"
                placeholder="Digite sua senha..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                required
              />
              <button
                type="button"
                className="login-eye-btn"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="login-error-alert" role="alert">
              {errorMsg}
            </div>
          )}

          <button type="submit" className="btn btn-clinical login-submit-btn" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar no sistema'}
          </button>

          <div className="login-footer-note">
            Seus dados ficam sincronizados em tempo real no banco central deste servidor para todos
            os computadores e celulares conectados.
          </div>
        </form>
      </div>
    </div>
  );
}
