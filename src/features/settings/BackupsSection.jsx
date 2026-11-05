import { useEffect, useState } from 'react';
import { Badge, Card } from '../../ui/index.js';
import { endpoints } from '../../api/endpoints.js';
import { todayIso, formatShortDate } from '../../domain/dates.js';
import { formatDateTime } from './format.js';
import styles from './Settings.module.css';

function Line({ tone, title, children }) {
  return (
    <li className={styles.statusLine}>
      <Badge tone={tone}>{title}</Badge>
      <span>{children}</span>
    </li>
  );
}

export function BackupsSection() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    endpoints
      .backupStatus()
      .then(setStatus)
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <p className={styles.errorText}>{error}</p>;
  if (!status) return <p className={styles.lead}>Carregando…</p>;

  const today = todayIso();
  const { local = {}, offsite = {}, encryptionKeyConfigured } = status;
  return (
    <div className={styles.stack}>
      <Card>
        <ul className={styles.statusList}>
          <Line tone={local.latestDate === today ? 'done' : local.latestDate ? 'soon' : 'late'} title="Servidor">
            {local.latest
              ? `Último backup em ${formatShortDate(local.latestDate)} · ${local.count} guardados (até ${local.retentionDays} dias)`
              : 'Nenhum backup ainda. O primeiro é criado 1 minuto após o servidor iniciar.'}
          </Line>
          <Line tone={encryptionKeyConfigured ? 'done' : 'late'} title="Criptografia">
            {encryptionKeyConfigured ? 'Ativada (AES-256).' : 'Desativada — defina BACKUP_ENCRYPTION_KEY no Railway.'}
          </Line>
          <Line tone={offsite.configured ? (offsite.lastUploadDate === today ? 'done' : 'soon') : 'late'} title="Cópia externa">
            {!offsite.configured
              ? 'Não configurada.'
              : offsite.lastUploadAt
              ? `Último envio em ${formatDateTime(offsite.lastUploadAt)} para ${offsite.endpointHost} / ${offsite.bucket} (guardados ${offsite.retentionDays} dias)`
              : `Configurada (${offsite.endpointHost} / ${offsite.bucket}), aguardando o primeiro envio.`}
          </Line>
        </ul>
        {offsite.lastError && (
          <p className={styles.errorText} role="alert">
            Último erro no envio externo ({formatDateTime(offsite.lastErrorAt)}): {offsite.lastError}
          </p>
        )}
      </Card>
      <Card>
        <h2 className={styles.cardTitle}>Backup completo agora</h2>
        <p className={styles.help}>
          Baixa uma cópia do banco sem senhas nem sessões. Guarde em local seguro: ela contém dados de saúde dos pacientes.
        </p>
        <a className={styles.downloadLink} href="/api/backup">
          Baixar backup completo
        </a>
      </Card>
    </div>
  );
}
