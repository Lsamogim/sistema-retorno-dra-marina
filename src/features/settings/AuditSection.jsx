import { useCallback, useEffect, useState } from 'react';
import { Button } from '../../ui/index.js';
import { endpoints } from '../../api/endpoints.js';
import { ACTION_LABELS, describeAudit, formatDateTime } from './format.js';
import styles from './Settings.module.css';

const PAGE = 100;

export function AuditSection() {
  const [entries, setEntries] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (beforeId = null) => {
    setLoading(true);
    try {
      const res = await endpoints.listAudit(beforeId);
      setEntries((prev) => (beforeId ? [...prev, ...res.entries] : res.entries));
      setHasMore(res.entries.length === PAGE);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className={styles.stack}>
      <p className={styles.lead}>
        Registro de quem acessou e alterou os dados (LGPD). Não guarda o conteúdo das fichas, telefones nem senhas.
      </p>
      {error && (
        <p className={styles.errorText} role="alert">
          {error}
        </p>
      )}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Quando</th>
              <th scope="col">Quem</th>
              <th scope="col">O que</th>
              <th scope="col">Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className={e.action === 'login_failed' ? styles.warnRow : ''}>
                <td className={styles.nowrap}>{formatDateTime(e.at)}</td>
                <td>{e.username || '—'}</td>
                <td>{ACTION_LABELS[e.action] || e.action}</td>
                <td>{describeAudit(e)}</td>
              </tr>
            ))}
            {!entries.length && !loading && (
              <tr>
                <td colSpan={4}>Nenhum registro ainda.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {hasMore && (
        <div>
          <Button variant="secondary" loading={loading} onClick={() => load(entries[entries.length - 1]?.id)}>
            Carregar registros mais antigos
          </Button>
        </div>
      )}
    </div>
  );
}
