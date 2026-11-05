import { useEffect, useState } from 'react';
import styles from './StageTabs.module.css';

export function StageTabs({ stages, value, onChange, pulseId = null, label = 'Etapas' }) {
  const [pulsing, setPulsing] = useState(null);

  useEffect(() => {
    if (!pulseId) return undefined;
    setPulsing(pulseId);
    const t = setTimeout(() => setPulsing(null), 600);
    return () => clearTimeout(t);
  }, [pulseId]);

  const onKeyDown = (e) => {
    const idx = stages.findIndex((s) => s.id === value);
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const next = stages[(idx + (e.key === 'ArrowRight' ? 1 : stages.length - 1)) % stages.length];
      onChange(next.id);
      requestAnimationFrame(() => document.getElementById(`stage-tab-${next.id}`)?.focus());
    }
  };

  return (
    <div className={styles.tabs} role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {stages.map((s) => {
        const active = s.id === value;
        return (
          <button
            key={s.id}
            id={`stage-tab-${s.id}`}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            className={`${styles.tab} ${active ? styles.active : ''}`}
            onClick={() => onChange(s.id)}
          >
            <span className={styles.long}>{s.label}</span>
            <span className={styles.short} aria-hidden="true">
              {s.shortLabel || s.label}
            </span>
            <span className={`${styles.count} ${pulsing === s.id ? styles.pulse : ''}`}>{s.count}</span>
          </button>
        );
      })}
    </div>
  );
}
