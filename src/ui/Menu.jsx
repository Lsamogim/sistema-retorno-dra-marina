import { useEffect, useId, useRef, useState } from 'react';
import styles from './Menu.module.css';

export function Menu({ label, items, icon = '⋯' }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const triggerRef = useRef(null);
  const wrapRef = useRef(null);
  const itemRefs = useRef([]);

  useEffect(() => {
    if (!open) return undefined;
    itemRefs.current[0]?.focus();
    const onDocDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open]);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  const onKeyDown = (e) => {
    const idx = itemRefs.current.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      itemRefs.current[(idx + delta + items.length) % items.length]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      close(false);
    }
  };

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true">{icon}</span>
      </button>
      {open && (
        <div id={menuId} role="menu" className={styles.menu} onKeyDown={onKeyDown}>
          {items.map((item, i) => (
            <button
              key={item.label}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className={`${styles.item} ${item.destructive ? styles.destructive : ''}`}
              onClick={() => {
                close(false);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
