import { X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { Button, IconButton } from './Button.jsx';
import styles from './Overlay.module.css';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Sobreposições abertas, em ordem de abertura. Responde a Esc/Tab só a mais recente entre
// as que não têm outra sobreposição aberta dentro delas (diálogo dentro da ficha vence a ficha).
const overlayStack = [];

function isTopOverlay(entry) {
  const candidates = overlayStack.filter(
    (e) => !overlayStack.some((other) => other !== e && e.panel.current?.contains(other.panel.current))
  );
  return candidates[candidates.length - 1] === entry;
}

/** Prende o foco dentro do painel, fecha com Esc e devolve o foco a quem abriu. */
function useModalFocus(open, panelRef, initialFocusRef, onClose) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const entry = { panel: panelRef };
    overlayStack.push(entry);
    const previouslyFocused = document.activeElement;
    (initialFocusRef.current || panelRef.current)?.focus();

    const onKeyDown = (e) => {
      if (!isTopOverlay(entry)) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const nodes = [...panelRef.current.querySelectorAll(FOCUSABLE)];
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      const idx = overlayStack.indexOf(entry);
      if (idx !== -1) overlayStack.splice(idx, 1);
      document.removeEventListener('keydown', onKeyDown);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') previouslyFocused.focus();
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function Sheet({ open, title, subtitle, onClose, children, footer }) {
  const titleId = useId();
  const panelRef = useRef(null);
  const titleRef = useRef(null);
  useModalFocus(open, panelRef, titleRef, onClose);
  if (!open) return null;
  return (
    <div className={styles.sheetBackdrop} onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <section ref={panelRef} className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className={styles.sheetHeader}>
          <div className={styles.sheetTitles}>
            <h2 id={titleId} ref={titleRef} tabIndex={-1} className={styles.sheetTitle}>
              {title}
            </h2>
            {subtitle && <p className={styles.sheetSubtitle}>{subtitle}</p>}
          </div>
          <IconButton label="Fechar" icon={<X size={20} />} onClick={onClose} />
        </header>
        <div className={styles.sheetBody}>{children}</div>
        {footer && <footer className={styles.sheetFooter}>{footer}</footer>}
      </section>
    </div>
  );
}

export function Dialog({ open, title, description, confirmLabel, cancelLabel = 'Cancelar', destructive = false, onConfirm, onCancel, children, confirmDisabled = false }) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef(null);
  const cancelRef = useRef(null);
  useModalFocus(open, panelRef, cancelRef, onCancel);
  if (!open) return null;
  return (
    <div className={styles.dialogBackdrop}>
      <section
        ref={panelRef}
        className={styles.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
      >
        <h2 id={titleId} className={styles.dialogTitle}>
          {title}
        </h2>
        {description && (
          <p id={descId} className={styles.dialogText}>
            {description}
          </p>
        )}
        {children}
        <div className={styles.dialogActions}>
          <Button ref={cancelRef} variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm} disabled={confirmDisabled}>
            {confirmLabel}
          </Button>
        </div>
      </section>
    </div>
  );
}
