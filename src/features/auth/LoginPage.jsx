import { useState } from 'react';
import { Button, TextField } from '../../ui/index.js';
import { useSession } from '../../state/session.jsx';
import { AuthLayout } from './AuthLayout.jsx';
import styles from './Auth.module.css';

export function LoginPage() {
  const { login, expired } = useSession();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err.message || 'Não foi possível entrar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Entrar" subtitle="Use o usuário e a senha que a administradora criou para você.">
      <form className={styles.form} onSubmit={submit}>
        {expired && <p className={styles.info}>Sua sessão expirou. Entre de novo para continuar.</p>}
        <TextField label="Usuário" value={username} onChange={setUsername} autoComplete="username" autoCapitalize="none" required />
        <TextField
          label="Senha"
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          required
        />
        <label className={styles.check}>
          <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} /> Mostrar senha
        </label>
        {error && (
          <p className={styles.alert} role="alert">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" fullWidth loading={loading}>
          Entrar
        </Button>
      </form>
    </AuthLayout>
  );
}
