import { useEffect, useRef, useState } from 'react';
import { TextField } from '../../ui/index.js';

/** Campo que salva sozinho ao sair dele. Em erro, mantém o que foi digitado e mostra o motivo. */
export function AutosaveField({ label, value, onSave, validate, multiline = false, type = 'text', inputRef, ...rest }) {
  const [draft, setDraft] = useState(value ?? '');
  const [state, setState] = useState('idle'); // idle | saving | saved
  const [error, setError] = useState('');
  const timer = useRef(null);

  useEffect(() => {
    setDraft(value ?? '');
  }, [value]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const commit = async () => {
    if ((draft ?? '') === (value ?? '')) return;
    const problem = validate?.(draft);
    if (problem) {
      setError(problem);
      return;
    }
    setState('saving');
    try {
      await onSave(draft);
      setError('');
      setState('saved');
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setState((s) => (s === 'saved' ? 'idle' : s)), 2000);
    } catch (err) {
      setState('idle');
      setError(err.message);
    }
  };

  const hint = state === 'saving' ? 'Salvando…' : state === 'saved' ? 'Salvo' : rest.hint;
  return (
    <TextField
      {...rest}
      ref={inputRef}
      label={label}
      type={type}
      multiline={multiline}
      value={draft}
      onChange={(v) => {
        setDraft(v);
        if (error) setError('');
      }}
      onBlur={commit}
      error={error}
      hint={hint}
    />
  );
}
