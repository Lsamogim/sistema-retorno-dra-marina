import { ListChecks, LogOut, Settings, Upload, Users } from 'lucide-react';
import { RouterProvider, useRoute } from './router.jsx';
import { SessionProvider, useSession } from '../state/session.jsx';
import { ToastProvider } from '../ui/index.js';
import { LoginPage } from '../features/auth/LoginPage.jsx';
import { ForcedPasswordPage } from '../features/auth/ForcedPasswordPage.jsx';
import { BrandMark } from '../features/auth/AuthLayout.jsx';
import { PAGES } from './pages.jsx';
import styles from './AppShell.module.css';

const NAV = [
  { route: 'hoje', to: '/hoje', label: 'Hoje', short: 'Hoje', Icon: ListChecks },
  { route: 'pacientes', to: '/pacientes', label: 'Pacientes', short: 'Pacientes', Icon: Users },
  { route: 'importar', to: '/importar', label: 'Importar agenda', short: 'Agenda', Icon: Upload },
];

function isActive(item, route) {
  if (item.route === 'pacientes') return route === 'pacientes' || route === 'paciente';
  return route === item.route;
}

function NavLink({ item, route, navigate, className, activeClass, children }) {
  const active = isActive(item, route);
  return (
    <a
      href={item.to}
      className={`${className} ${active ? activeClass : ''}`}
      aria-current={active ? 'page' : undefined}
      onClick={(e) => {
        e.preventDefault();
        navigate(item.to);
      }}
    >
      {children}
    </a>
  );
}

function TopNav() {
  const { route, navigate } = useRoute();
  const { user, logout } = useSession();
  return (
    <header className={styles.topnav}>
      <div className={styles.topnavInner}>
        <span className={styles.brand}>
          <BrandMark /> <span className={styles.brandName}>Dra. Marina</span>
        </span>
        <nav aria-label="Principal" className={styles.topLinks}>
          {NAV.map((item) => (
            <NavLink key={item.to} item={item} route={route} navigate={navigate} className={styles.topLink} activeClass={styles.topLinkActive}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className={styles.topRight}>
          <span className={styles.userName}>{user.displayName || user.username}</span>
          <a
            href="/configuracoes"
            className={`${styles.iconLink} ${route === 'configuracoes' ? styles.topLinkActive : ''}`}
            aria-label="Configurações"
            title="Configurações"
            aria-current={route === 'configuracoes' ? 'page' : undefined}
            onClick={(e) => {
              e.preventDefault();
              navigate('/configuracoes');
            }}
          >
            <Settings size={20} aria-hidden="true" />
          </a>
          <button type="button" className={styles.iconLink} aria-label="Sair" title="Sair" onClick={logout}>
            <LogOut size={20} aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
}

function BottomNav() {
  const { route, navigate } = useRoute();
  const items = [...NAV, { route: 'configuracoes', to: '/configuracoes', label: 'Configurações', short: 'Mais', Icon: Settings }];
  return (
    <nav className={styles.bottomnav} aria-label="Principal">
      {items.map((item) => (
        <NavLink key={item.to} item={item} route={route} navigate={navigate} className={styles.bottomLink} activeClass={styles.bottomLinkActive}>
          <item.Icon size={22} aria-hidden="true" />
          <span>{item.short}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function Routed() {
  const { status, user } = useSession();
  const { route } = useRoute();
  if (status === 'loading') return <p className={styles.loading}>Carregando…</p>;
  if (status === 'error') return <p className={styles.loading}>Sem conexão com o servidor. Recarregue a página em instantes.</p>;
  if (status === 'anonymous') return <LoginPage />;
  if (user.mustChangePassword) return <ForcedPasswordPage />;
  const Page = PAGES[route] || PAGES.hoje;
  return (
    <div className={styles.app}>
      <TopNav />
      <main className={styles.main}>
        <Page />
      </main>
      <BottomNav />
    </div>
  );
}

export function AppShell() {
  return (
    <RouterProvider>
      <SessionProvider>
        <ToastProvider>
          <Routed />
        </ToastProvider>
      </SessionProvider>
    </RouterProvider>
  );
}
