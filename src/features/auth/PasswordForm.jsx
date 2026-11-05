import { useState } from 'react';
import { Button, TextField } from '../../ui/index.js';
import { endpoints } from '../../api/endpoints.js';
import styles from './Auth.module.css';

export const MIN_PASSWORD_LENGTH = 10;

/** Troca da própria senha (primeiro acesso e Configurações). */
export function PasswordForm({ username, submitLabel = 'Trocar senha', onSuccess }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setDone(false);
    if (next.length < MIN_PASSWORD_LENGTH) {
      setError(`A nova senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (next !== confirm) {
      setError('A confirmação é diferente da nova senha.');
      return;
    }
    setLoading(true);
    try {
      await endpoints.changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      setDone(true);
      onSuccess?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={submit}>
      <input type="text" autoComplete="username" value={username || ''} readOnly hidden />
      <TextField label="Senha atual" type="password" value={current} onChange={setCurrent} autoComplete="current-password" required />
      <TextField
        label="Nova senha"
        type="password"
        value={next}
        onChange={setNext}
        autoComplete="new-password"
        hint={`Pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`}
        required
      />
      <TextField label="Repita a nova senha" type="password" value={confirm} onChange={setConfirm} autoComplete="new-password" required />
      {error && (
        <p className={styles.alert} role="alert">
          {error}
        </p>
      )}
      {done && (
        <p className={styles.info} role="status">
          Senha atualizada. Os outros aparelhos foram desconectados.
        </p>
      )}
      <Button type="submit" variant="primary" fullWidth loading={loading}>
        {submitLabel}
      </Button>
    </form>
  );
}
