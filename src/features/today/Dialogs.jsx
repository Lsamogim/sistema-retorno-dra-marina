import { useId, useState } from 'react';
import { Dialog, TextField } from '../../ui/index.js';
import { todayIso } from '../../domain/dates.js';
import styles from './Today.module.css';

export function ScheduleDialog({ item, onConfirm, onCancel }) {
  const [date, setDate] = useState('');
  const [error, setError] = useState('');
  const today = todayIso();
  const reschedule = item.stage === 'agendado';
  return (
    <Dialog
      open
      title={reschedule ? `Remarcar ${item.patientName}` : `${item.patientName} agendou`}
      description="Informe a data combinada. A planilha da semana confirma o atendimento depois."
      confirmLabel="Salvar agendamento"
      onCancel={onCancel}
      onConfirm={() => {
        if (!date) return setError('Escolha a data do agendamento.');
        if (date < today) return setError('A data não pode estar no passado.');
        onConfirm(date);
      }}
    >
      <div className={styles.dialogField}>
        <TextField label="Data do agendamento" type="date" min={today} value={date} onChange={(v) => { setDate(v); setError(''); }} error={error} />
      </div>
    </Dialog>
  );
}

const REASONS = [
  { id: 'parou', label: 'Parou o tratamento' },
  { id: 'alta', label: 'Teve alta' },
  { id: 'pausa', label: 'Pausar até…' },
  { id: 'todos', label: 'Não volta mais em nenhum procedimento' },
];

export function ArchiveDialog({ item, patientCategories, onConfirm, onCancel }) {
  const name = useId();
  const [reason, setReason] = useState('parou');
  const [until, setUntil] = useState('');
  const [error, setError] = useState('');
  const [confirmAll, setConfirmAll] = useState(false);
  const today = todayIso();

  if (confirmAll) {
    return (
      <Dialog
        open
        destructive
        title={`Tirar ${item.patientName} de todos os procedimentos?`}
        description={`${item.patientName} sai da lista em todos os procedimentos (${patientCategories.join(', ')}). Dá para desfazer logo em seguida.`}
        confirmLabel="Tirar de todos os procedimentos"
        onCancel={onCancel}
        onConfirm={() => onConfirm({ action: 'archive', reason: 'Não volta mais', allCategories: true })}
      />
    );
  }

  return (
    <Dialog
      open
      title={`${item.patientName} não vai voltar`}
      description={`Escolha o motivo. ${item.categoryName} sai da lista do dia.`}
      confirmLabel={reason === 'todos' ? 'Continuar' : 'Tirar da lista'}
      destructive={reason !== 'todos'}
      onCancel={onCancel}
      onConfirm={() => {
        if (reason === 'todos') return setConfirmAll(true);
        if (reason === 'pausa') {
          if (!until || until <= today) return setError('Escolha uma data futura para voltar à lista.');
          return onConfirm({ action: 'archive', reason: 'Pausa', until });
        }
        return onConfirm({ action: 'archive', reason: REASONS.find((r) => r.id === reason).label });
      }}
    >
      <fieldset className={styles.reasons}>
        <legend className="visually-hidden">Motivo</legend>
        {REASONS.map((r) => (
          <label key={r.id} className={styles.reasonOption}>
            <input type="radio" name={name} value={r.id} checked={reason === r.id} onChange={() => setReason(r.id)} />
            {r.label}
          </label>
        ))}
      </fieldset>
      {reason === 'pausa' && (
        <div className={styles.dialogField}>
          <TextField label="Voltar à lista em" type="date" min={today} value={until} onChange={(v) => { setUntil(v); setError(''); }} error={error} />
        </div>
      )}
    </Dialog>
  );
}
