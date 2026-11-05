import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import styles from './Toast.module.css';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);

  const dismiss = useCallback(() => {
    clearTimeout(timerRef.current);
    setToast(null);
  }, []);

  const show = useCallback(({ message, actions = [], duration = 8000, tone = 'neutral' }) => {
    clearTimeout(timerRef.current);
    const id = Date.now() + Math.random();
    setToast({ id, message, actions, tone });
    timerRef.current = setTimeout(() => setToast((t) => (t?.id === id ? null : t)), duration);
  }, []);

  const value = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className={styles.region} role="status" aria-live="polite">
        {toast && (
          <div key={toast.id} className={`${styles.toast} ${toast.tone === 'error' ? styles.error : ''}`}>
            <span className={styles.message}>{toast.message}</span>
            {toast.actions.map((a) => (
              <button
                key={a.label}
                type="button"
                className={styles.action}
                onClick={() => {
                  dismiss();
                  a.onClick?.();
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast precisa estar dentro de ToastProvider');
  return ctx;
}
