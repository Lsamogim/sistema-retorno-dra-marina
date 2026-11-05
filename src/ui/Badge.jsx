import styles from './Badge.module.css';

export function Badge({ tone = 'neutral', children, className = '' }) {
  return <span className={[styles.badge, styles[tone], className].filter(Boolean).join(' ')}>{children}</span>;
}

export function Avatar({ name = '' }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .filter((ch) => /\p{L}/u.test(ch))
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <span className={styles.avatar} aria-hidden="true">
      {initials || '?'}
    </span>
  );
}
