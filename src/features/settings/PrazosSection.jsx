import { useEffect, useState } from 'react';
import { Button, Card, TextField, useToast } from '../../ui/index.js';
import { endpoints } from '../../api/endpoints.js';
import styles from './Settings.module.css';

const toDraft = (c) => ({
  id: c.id,
  name: c.name,
  recurrenceDays: String(c.recurrenceDays ?? ''),
  reviewDays: c.reviewDays == null ? '' : String(c.reviewDays),
  whatsappTemplate: c.whatsappTemplate || '',
  reviewWhatsappTemplate: c.reviewWhatsappTemplate || '',
});

export function PrazosSection() {
  const toast = useToast();
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    endpoints
      .getDashboard()
      .then((d) => setDraft(d.categories.map(toDraft)))
      .catch((err) => setError(err.message));
  }, []);

  if (error && !draft) return <p className={styles.errorText}>{error}</p>;
  if (!draft) return <p className={styles.lead}>Carregando…</p>;

  const set = (id, field, value) => setDraft((d) => d.map((c) => (c.id === id ? { ...c, [field]: value } : c)));

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await endpoints.saveCategories(
        draft.map((c) => ({
          id: c.id,
          recurrenceDays: Number(c.recurrenceDays),
          reviewDays: c.reviewDays === '' ? null : Number(c.reviewDays),
          whatsappTemplate: c.whatsappTemplate,
          reviewWhatsappTemplate: c.reviewWhatsappTemplate || null,
        }))
      );
      toast.show({ message: 'Prazos e mensagens salvos.' });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.stack}>
      <p className={styles.lead}>
        Nas mensagens, use <code>{'{nome}'}</code>, <code>{'{procedimento}'}</code>, <code>{'{servico}'}</code>,{' '}
        <code>{'{dias_retorno}'}</code> e <code>{'{data_retorno}'}</code>; elas são trocadas pelos dados do paciente.
      </p>
      {draft.map((c) => (
        <Card key={c.id} className={styles.categoryCard}>
          <h2 className={styles.cardTitle}>{c.name}</h2>
          <div className={styles.grid2}>
            {c.reviewDays !== '' && (
              <TextField label="Retoque depois de (dias)" type="number" min="1" max="180" value={c.reviewDays} onChange={(v) => set(c.id, 'reviewDays', v)} />
            )}
            <TextField
              label={c.id === 'capilar' ? 'Protocolo padrão (dias)' : c.reviewDays !== '' ? 'Nova aplicação depois de (dias)' : 'Retorno depois de (dias)'}
              type="number"
              min="1"
              max="730"
              value={c.recurrenceDays}
              onChange={(v) => set(c.id, 'recurrenceDays', v)}
            />
          </div>
          {c.reviewDays !== '' && (
            <TextField label="Mensagem do retoque" multiline value={c.reviewWhatsappTemplate} onChange={(v) => set(c.id, 'reviewWhatsappTemplate', v)} />
          )}
          <TextField
            label={c.reviewDays !== '' ? 'Mensagem da nova aplicação' : 'Mensagem de retorno'}
            multiline
            value={c.whatsappTemplate}
            onChange={(v) => set(c.id, 'whatsappTemplate', v)}
          />
        </Card>
      ))}
      {error && (
        <p className={styles.errorText} role="alert">
          {error}
        </p>
      )}
      <div className={styles.stickySave}>
        <Button variant="primary" loading={saving} onClick={save}>
          Salvar prazos e mensagens
        </Button>
      </div>
    </div>
  );
}
