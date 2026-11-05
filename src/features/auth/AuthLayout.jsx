import styles from './Auth.module.css';

export function BrandMark({ size = 'md' }) {
  return (
    <span className={`${styles.mark} ${size === 'lg' ? styles.markLg : ''}`} aria-hidden="true">
      M
    </span>
  );
}

export function AuthLayout({ title, subtitle, children }) {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <BrandMark size="lg" />
          <div>
            <p className={styles.brandName}>Dra. Marina Carbonera</p>
            <p className={styles.brandSub}>Controle de retornos</p>
          </div>
        </div>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        {children}
      </div>
    </main>
  );
}
