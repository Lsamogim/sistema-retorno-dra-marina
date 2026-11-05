import { useId } from 'react';
import styles from './Field.module.css';

export function TextField({ label, value, onChange, onBlur, error, hint, multiline = false, type = 'text', id, ref, className = '', ...rest }) {
  const autoId = useId();
  const inputId = id || autoId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;
  const Control = multiline ? 'textarea' : 'input';
  return (
    <div className={`${styles.field} ${className}`}>
      <label className={styles.label} htmlFor={inputId}>
        {label}
      </label>
      <Control
        ref={ref}
        id={inputId}
        className={`${styles.control} ${multiline ? styles.textarea : ''} ${error ? styles.invalid : ''}`}
        type={multiline ? undefined : type}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        onBlur={onBlur}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
        {...rest}
      />
      {hint && !error && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}

export function Select({ label, value, options, onChange, id, hideLabel = false, className = '', ...rest }) {
  const autoId = useId();
  const selectId = id || autoId;
  return (
    <div className={`${styles.field} ${className}`}>
      <label className={hideLabel ? 'visually-hidden' : styles.label} htmlFor={selectId}>
        {label}
      </label>
      <select id={selectId} className={`${styles.control} ${styles.select}`} value={value} onChange={(e) => onChange(e.target.value)} {...rest}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
