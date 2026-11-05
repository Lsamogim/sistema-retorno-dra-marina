import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, Dialog, Select, TextField, useToast } from '../../ui/index.js';
import { endpoints } from '../../api/endpoints.js';
import { useSession } from '../../state/session.jsx';
import { formatDateTime } from './format.js';
import styles from './Settings.module.css';

const ROLE_OPTIONS = [
  { value: 'recepcao', label: 'Recepção' },
  { value: 'admin', label: 'Administradora' },
];

const EMPTY = { displayName: '', username: '', role: 'recepcao', temporaryPassword: '' };

export function UsersSection() {
  const { user: me } = useSession();
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetFor, setResetFor] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [confirmOff, setConfirmOff] = useState(null);

  const load = useCallback(async () => {
    try {
      setUsers((await endpoints.listUsers()).users);
    } catch (err) {
      toast.show({ message: err.message, tone: 'error' });
    }
  }, [toast]);
  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn, okMessage) => {
    setBusy(true);
    try {
      await fn();
      toast.show({ message: okMessage });
      await load();
      return true;
    } catch (err) {
      toast.show({ message: err.message, tone: 'error' });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const create = async (e) => {
    e.preventDefault();
    setFormError('');
    setBusy(true);
    try {
      await endpoints.createUser(form);
      toast.show({ message: `Usuária ${form.username} criada. Entregue a senha temporária pessoalmente.` });
      setForm(EMPTY);
      await load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.stack}>
      <Card>
        <h2 className={styles.cardTitle}>Nova usuária</h2>
        <form className={styles.stack} onSubmit={create}>
          <div className={styles.grid2}>
            <TextField label="Nome" value={form.displayName} onChange={(v) => setForm({ ...form, displayName: v })} placeholder="Ana (recepção)" />
            <TextField
              label="Usuário de login"
              value={form.username}
              autoCapitalize="none"
              onChange={(v) => setForm({ ...form, username: v.toLowerCase().trim() })}
              placeholder="ana.recepcao"
            />
            <Select label="Perfil" value={form.role} options={ROLE_OPTIONS} onChange={(v) => setForm({ ...form, role: v })} />
            <TextField
              label="Senha temporária"
              type="password"
              autoComplete="new-password"
              hint="Pelo menos 10 caracteres. Ela troca no primeiro acesso."
              value={form.temporaryPassword}
              onChange={(v) => setForm({ ...form, temporaryPassword: v })}
            />
          </div>
          {formError && (
            <p className={styles.errorText} role="alert">
              {formError}
            </p>
          )}
          <div>
            <Button type="submit" variant="primary" loading={busy}>
              Criar usuária
            </Button>
          </div>
        </form>
        <p className={styles.help}>
          Recepção usa a lista do dia, edita fichas e importa a agenda. Só administradoras mudam prazos e mensagens, baixam o
          backup e gerenciam usuárias.
        </p>
      </Card>

      <ul className={styles.userList} aria-label="Usuárias">
        {users.map((u) => {
          const isSelf = u.id === me.id;
          return (
            <li key={u.id} className={`${styles.userRow} ${u.active ? '' : styles.inactive}`}>
              <div className={styles.userMain}>
                <p className={styles.userName}>
                  {u.displayName} {isSelf && <Badge tone="neutral">você</Badge>}
                </p>
                <p className={styles.help}>
                  {u.username} · último acesso {formatDateTime(u.lastLoginAt)} ·{' '}
                  {u.active ? (u.mustChangePassword ? 'aguardando 1º acesso' : 'ativa') : 'desativada'}
                </p>
              </div>
              <Select
                label={`Perfil de ${u.username}`}
                hideLabel
                value={u.role}
                options={ROLE_OPTIONS}
                disabled={isSelf || busy}
                onChange={(v) => run(() => endpoints.updateUser(u.id, { role: v }), `Perfil de ${u.username} atualizado.`)}
              />
              <div className={styles.userActions}>
                <Button size="sm" variant="ghost" onClick={() => { setResetFor(u); setResetPassword(''); }}>
                  Redefinir senha
                </Button>
                {!isSelf && (
                  <Button
                    size="sm"
                    variant={u.active ? 'danger' : 'secondary'}
                    onClick={() =>
                      u.active ? setConfirmOff(u) : run(() => endpoints.updateUser(u.id, { active: true }), `${u.username} reativada.`)
                    }
                  >
                    {u.active ? 'Desativar' : 'Reativar'}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <Dialog
        open={Boolean(resetFor)}
        title={`Nova senha temporária para ${resetFor?.displayName || ''}`}
        description="Ela vai criar uma senha própria no próximo acesso. Todas as sessões dela são encerradas."
        confirmLabel="Salvar senha temporária"
        onCancel={() => setResetFor(null)}
        onConfirm={async () => {
          const ok = await run(
            () => endpoints.updateUser(resetFor.id, { temporaryPassword: resetPassword }),
            `Senha de ${resetFor.username} redefinida.`
          );
          if (ok) setResetFor(null);
        }}
      >
        <div className={styles.dialogField}>
          <TextField label="Senha temporária" type="password" autoComplete="new-password" value={resetPassword} onChange={setResetPassword} />
        </div>
      </Dialog>

      <Dialog
        open={Boolean(confirmOff)}
        destructive
        title={`Desativar ${confirmOff?.displayName || ''}?`}
        description="Ela é desconectada na hora e não consegue mais entrar. Dá para reativar depois."
        confirmLabel="Desativar"
        onCancel={() => setConfirmOff(null)}
        onConfirm={async () => {
          const u = confirmOff;
          setConfirmOff(null);
          await run(() => endpoints.updateUser(u.id, { active: false }), `${u.username} desativada.`);
        }}
      />
    </div>
  );
}
