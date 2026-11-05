import { Button } from '../../ui/index.js';
import { useSession } from '../../state/session.jsx';
import { AuthLayout } from './AuthLayout.jsx';
import { PasswordForm } from './PasswordForm.jsx';
import styles from './Auth.module.css';

export function ForcedPasswordPage() {
  const { user, logout, markPasswordChanged } = useSession();
  return (
    <AuthLayout
      title="Crie sua senha"
      subtitle={`Olá, ${user.displayName || user.username}. Troque a senha temporária para acessar os pacientes.`}
    >
      <PasswordForm username={user.username} submitLabel="Salvar senha e entrar" onSuccess={markPasswordChanged} />
      <div className={styles.secondaryAction}>
        <Button variant="ghost" onClick={logout}>
          Sair
        </Button>
      </div>
    </AuthLayout>
  );
}
