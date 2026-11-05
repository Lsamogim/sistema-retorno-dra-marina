import { useRoute } from '../../app/router.jsx';
import { useSession } from '../../state/session.jsx';
import { PasswordForm } from '../auth/PasswordForm.jsx';
import { PrazosSection } from './PrazosSection.jsx';
import { UsersSection } from './UsersSection.jsx';
import { AuditSection } from './AuditSection.jsx';
import { BackupsSection } from './BackupsSection.jsx';
import styles from './Settings.module.css';

const SECTIONS = [
  { id: 'prazos', label: 'Prazos e mensagens', admin: true },
  { id: 'senha', label: 'Minha senha', admin: false },
  { id: 'usuarias', label: 'Usuárias', admin: true },
  { id: 'auditoria', label: 'Auditoria', admin: true },
  { id: 'backups', label: 'Backups', admin: true },
];

function MyPasswordSection() {
  const { user } = useSession();
  return (
    <div className={styles.narrow}>
      <p className={styles.lead}>
        Troque a senha de <strong>{user.username}</strong>. Os outros aparelhos conectados com a sua conta são desconectados.
      </p>
      <PasswordForm username={user.username} />
    </div>
  );
}

const CONTENT = {
  prazos: PrazosSection,
  senha: MyPasswordSection,
  usuarias: UsersSection,
  auditoria: AuditSection,
  backups: BackupsSection,
};

export function SettingsPage() {
  const { params, navigate } = useRoute();
  const { isAdmin, user, logout } = useSession();
  if (!user) return null;
  const allowed = SECTIONS.filter((s) => isAdmin || !s.admin);
  const current = allowed.find((s) => s.id === params.secao) || allowed[0];
  const Content = CONTENT[current.id];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Configurações</h1>
        <button type="button" className={styles.logout} onClick={logout}>
          Sair da conta ({user.displayName || user.username})
        </button>
      </header>
      <nav aria-label="Seções das configurações" className={styles.nav}>
        {allowed.map((s) => (
          <a
            key={s.id}
            href={`/configuracoes/${s.id}`}
            className={`${styles.navLink} ${s.id === current.id ? styles.navActive : ''}`}
            aria-current={s.id === current.id ? 'page' : undefined}
            onClick={(e) => {
              e.preventDefault();
              navigate(`/configuracoes/${s.id}`, { replace: true });
            }}
          >
            {s.label}
          </a>
        ))}
      </nav>
      <section aria-label={current.label} className={styles.content}>
        <Content />
      </section>
    </div>
  );
}
