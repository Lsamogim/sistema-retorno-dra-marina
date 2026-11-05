import styles from './Button.module.css';

export function Button({
  variant = 'secondary',
  size = 'md',
  icon = null,
  loading = false,
  fullWidth = false,
  className = '',
  children,
  type = 'button',
  disabled,
  ref,
  ...rest
}) {
  const classes = [
    styles.button,
    styles[variant],
    styles[size],
    fullWidth ? styles.fullWidth : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button ref={ref} type={type} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {icon && <span className={styles.icon} aria-hidden="true">{icon}</span>}
      <span>{loading ? `${children}…` : children}</span>
    </button>
  );
}

export function IconButton({ label, icon, size = 'md', variant = 'ghost', className = '', type = 'button', ref, ...rest }) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={[styles.button, styles[variant], styles.iconOnly, styles[size], className].filter(Boolean).join(' ')}
      {...rest}
    >
      <span className={styles.icon} aria-hidden="true">{icon}</span>
    </button>
  );
}
