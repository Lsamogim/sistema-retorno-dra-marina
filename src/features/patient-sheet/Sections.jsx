import { useMemo, useState } from 'react';
import { CheckCircle2, MessageCircle } from 'lucide-react';
import { Badge, Button, Dialog, Select, TextField } from '../../ui/index.js';
import { dueText, dueTone, doneActionLabel, reasonText, ruleText } from '../../domain/vocab.js';
import { formatShortDate } from '../../domain/dates.js';
import { stageLabel } from '../../domain/stages.js';
import { AutosaveField } from './AutosaveField.jsx';
import styles from './PatientSheet.module.css';

/** Ações da etapa atual de um procedimento (mesma lógica da lista Hoje). */
export function StageActions({ item, moved, canUndo, handlers, onAddPhone }) {
  if (moved) {
    return (
      <div className={`${styles.actionCard} ${styles.actionMoved}`}>
        <p className={styles.actionTitle}>{item.categoryName}</p>
        <p className={styles.movedText} aria-live="polite">
          <CheckCircle2 size={16} aria-hidden="true" /> Movido para {stageLabel(moved.toStage)}
        </p>
        <div className={styles.actionButtons}>
          <Button size="sm" variant="secondary" onClick={() => handlers.undo(item)}>
            Desfazer
          </Button>
        </div>
      </div>
    );
  }
  const reason = reasonText(item);
  let buttons = [];
  if (item.stage === 'chamar') {
    buttons = [
      item.whatsappNumber ? (
        <Button key="w" variant="primary" icon={<MessageCircle size={18} />} onClick={() => handlers.whatsapp(item)}>
          Enviar WhatsApp
        </Button>
      ) : (
        <Button key="p" variant="secondary" onClick={onAddPhone}>
          Adicionar telefone
        </Button>
      ),
      <Button key="s" variant="secondary" onClick={() => handlers.schedule(item)}>
        Agendou
      </Button>,
      <Button key="a" variant="ghost" onClick={() => handlers.archive(item)}>
        Não vai voltar
      </Button>,
    ];
  } else if (item.stage === 'aguardando') {
    buttons = [
      <Button key="s" variant="primary" onClick={() => handlers.schedule(item)}>
        Agendou
      </Button>,
      item.whatsappNumber && (
        <Button key="w" variant="secondary" onClick={() => handlers.whatsapp(item)}>
          Mandar de novo
        </Button>
      ),
      <Button key="a" variant="ghost" onClick={() => handlers.archive(item)}>
        Não vai voltar
      </Button>,
    ];
  } else if (item.stage === 'agendado') {
    buttons = [
      <Button key="d" variant="primary" onClick={() => handlers.done(item)}>
        {doneActionLabel(item)}
      </Button>,
      <Button key="r" variant="secondary" onClick={() => handlers.schedule(item)}>
        Remarcar
      </Button>,
      <Button key="f" variant="ghost" onClick={() => handlers.noShow(item)}>
        Faltou
      </Button>,
    ];
  } else if (item.stage === 'concluido' && canUndo) {
    buttons = [
      <Button key="u" variant="secondary" onClick={() => handlers.undo(item)}>
        Desfazer
      </Button>,
    ];
  }
  return (
    <div className={styles.actionCard}>
      <div className={styles.actionHead}>
        <p className={styles.actionTitle}>
          {item.categoryName} · {ruleText(item)}
          {reason && <span className={styles.reason}> · {reason}</span>}
        </p>
        <Badge tone={dueTone(item)}>{item.stage === 'chamar' ? dueText(item.daysUntilDue) : stageLabel(item.stage)}</Badge>
      </div>
      {buttons.length > 0 && <div className={styles.actionButtons}>{buttons}</div>}
    </div>
  );
}

const PROTOCOLS = [
  { value: '15', label: 'A cada 15 dias' },
  { value: '21', label: 'A cada 21 dias' },
  { value: '30', label: 'A cada 30 dias' },
];

export function ProcedureSection({ item, onSaveState, onUnarchive }) {
  const lastSession = formatShortDate(item.anchorDate || item.lastDate);
  return (
    <div className={styles.procedure}>
      <div className={styles.procedureHead}>
        <h4 className={styles.procedureTitle}>{item.categoryName}</h4>
        <Badge tone={dueTone(item)}>{stageLabel(item.stage)}</Badge>
      </div>
      <dl className={styles.facts}>
        <div>
          <dt>Última sessão</dt>
          <dd>{formatShortDate(item.lastDate)}</dd>
        </div>
        <div>
          <dt>Próximo retorno</dt>
          <dd>
            {formatShortDate(item.dueDate)} · {dueText(item.daysUntilDue)}
          </dd>
        </div>
        <div>
          <dt>Regra</dt>
          <dd>{ruleText(item)}</dd>
        </div>
      </dl>
      {item.stage === 'fora' ? (
        <div className={styles.outBox}>
          <p>
            Fora da lista{item.archivedReason ? ` — ${item.archivedReason}` : ''}
            {item.archivedUntil ? ` (volta em ${formatShortDate(item.archivedUntil)})` : ''}
          </p>
          <Button size="sm" variant="secondary" onClick={() => onUnarchive(item)}>
            Voltar para a lista
          </Button>
        </div>
      ) : (
        <div className={styles.procedureFields}>
          {item.categoryId === 'capilar' && (
            <Select
              label={`Protocolo (${item.categoryName})`}
              value={String(item.customIntervalDays || item.effectiveIntervalDays)}
              options={PROTOCOLS}
              onChange={(v) => onSaveState(item, { customIntervalDays: Number(v) }, `Protocolo salvo: retorno a cada ${v} dias.`)}
            />
          )}
          <AutosaveField
            label={`Próximo retorno personalizado (${item.categoryName})`}
            type="date"
            value={item.customDueDate || ''}
            hint="Deixe vazio para usar a regra do procedimento."
            validate={(v) => (v && v <= (item.anchorDate || item.lastDate) ? `A data precisa ser depois da última sessão (${lastSession}).` : '')}
            onSave={(v) => onSaveState(item, { customDueDate: v || null })}
          />
        </div>
      )}
    </div>
  );
}

const KIND_LABELS = { review: 'Retoque', evaluation: 'Avaliação', procedure: 'Procedimento' };

export function HistorySection({ item }) {
  return (
    <details className={styles.collapsible}>
      <summary>
        Histórico em {item.categoryName} ({item.history?.length || 0})
      </summary>
      <ul className={styles.history}>
        {(item.history || []).map((ev) => (
          <li key={ev.id ?? `${ev.appointment_date}-${ev.raw_service}`}>
            <span className={styles.historyDate}>
              {formatShortDate(ev.appointment_date)}
              {ev.time_slot ? ` · ${ev.time_slot}` : ''}
            </span>
            <span>
              {KIND_LABELS[ev.kind] || 'Atendimento'} — {ev.raw_service}
            </span>
            {ev.situation && <span className={styles.historySituation}>{ev.situation}</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}

export function MergeSection({ patientId, patientName, allPatients, onMerge }) {
  const [filter, setFilter] = useState('');
  const [target, setTarget] = useState('');
  const [confirming, setConfirming] = useState(false);
  const candidates = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return allPatients.filter((p) => p.id !== patientId && (!q || p.name.toLowerCase().includes(q))).slice(0, 50);
  }, [allPatients, filter, patientId]);
  const targetName = allPatients.find((p) => String(p.id) === target)?.name;

  return (
    <details className={styles.collapsible}>
      <summary>Unificar cadastro duplicado</summary>
      <div className={styles.collapsibleBody}>
        <p className={styles.help}>
          Se esta pessoa aparece com outro nome na planilha, junte os dois cadastros. O histórico e o telefone passam
          para o cadastro escolhido.
        </p>
        <TextField label="Procurar o outro cadastro" value={filter} onChange={setFilter} />
        <Select
          label="Cadastro principal"
          value={target}
          onChange={setTarget}
          options={[{ value: '', label: 'Escolha o cadastro' }, ...candidates.map((p) => ({ value: String(p.id), label: p.name }))]}
        />
        <Button variant="secondary" disabled={!target} onClick={() => setConfirming(true)}>
          Unificar cadastros
        </Button>
      </div>
      <Dialog
        open={confirming}
        title={`Unificar ${patientName} em ${targetName}?`}
        description={`Os atendimentos de ${patientName} passam para ${targetName}. Não dá para desfazer.`}
        confirmLabel="Unificar"
        destructive
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          onMerge(Number(target));
        }}
      />
    </details>
  );
}
