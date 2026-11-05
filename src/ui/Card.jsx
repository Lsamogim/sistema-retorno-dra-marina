import styles from './Card.module.css';

export function Card({ as: Tag = 'div', className = '', children, ...rest }) {
  return (
    <Tag className={`${styles.card} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

export function EmptyState({ title, body, action = null }) {
  return (
    <div className={styles.empty}>
      <p className={styles.emptyTitle}>{title}</p>
      {body && <p className={styles.emptyBody}>{body}</p>}
      {action && <div className={styles.emptyAction}>{action}</div>}
    </div>
  );
}
