import { CheckCircle2, MessageCircle } from 'lucide-react';
import { Avatar, Badge, Button, Menu } from '../../ui/index.js';
import { dueText, dueTone, doneActionLabel, reasonText, ruleText } from '../../domain/vocab.js';
import { formatShortDate } from '../../domain/dates.js';
import { stageLabel } from '../../domain/stages.js';
import styles from './Today.module.css';

function badgeText(item) {
  switch (item.stage) {
    case 'agendado':
      return `Agendado para ${formatShortDate(item.scheduledFor || item.nextScheduled?.date).slice(0, 5)}`;
    case 'concluido':
      return `Feito em ${formatShortDate(item.doneAt).slice(0, 5)}`;
    case 'aguardando':
      return `Mensagem em ${formatShortDate(item.contactedAt).slice(0, 5)}`;
    default:
      return dueText(item.daysUntilDue);
  }
}

/**
 * Uma tarefa da lista do dia. `handlers` vem da página:
 * whatsapp, addPhone, schedule, done, noShow, archive, undo, open, view.
 */
export function TaskRow({ item, moved, canUndo, handlers }) {
  const nameId = `task-${item.patientId}-${item.categoryId}`;
  const reason = reasonText(item);

  if (moved) {
    return (
      <li className={`${styles.row} ${styles.moved}`} aria-labelledby={nameId}>
        <Avatar name={item.patientName} />
        <div className={styles.main}>
          <span id={nameId} className={styles.name}>
            {item.patientName}
          </span>
          <p className={styles.movedText} aria-live="polite">
            <CheckCircle2 size={16} aria-hidden="true" /> Movido para {stageLabel(moved.toStage)}
          </p>
        </div>
        <div className={styles.actions}>
          <Button size="sm" variant="ghost" onClick={() => handlers.view(moved.toStage)}>
            Ver
          </Button>
          <Button size="sm" variant="secondary" onClick={() => handlers.undo(item)}>
            Desfazer
          </Button>
        </div>
      </li>
    );
  }

  let primary;
  let menuItems = [];
  switch (item.stage) {
    case 'chamar':
      primary = item.whatsappNumber ? (
        <Button variant="primary" icon={<MessageCircle size={18} />} onClick={() => handlers.whatsapp(item)}>
          Enviar WhatsApp
        </Button>
      ) : (
        <Button variant="secondary" onClick={() => handlers.addPhone(item)}>
          Adicionar telefone
        </Button>
      );
      menuItems = [
        { label: 'Agendou', onSelect: () => handlers.schedule(item) },
        { label: 'Abrir ficha', onSelect: () => handlers.open(item) },
        { label: 'Não vai voltar', onSelect: () => handlers.archive(item), destructive: true },
      ];
      break;
    case 'aguardando':
      primary = (
        <Button variant="primary" onClick={() => handlers.schedule(item)}>
          Agendou
        </Button>
      );
      menuItems = [
        ...(item.whatsappNumber ? [{ label: 'Mandar de novo', onSelect: () => handlers.whatsapp(item) }] : []),
        { label: 'Abrir ficha', onSelect: () => handlers.open(item) },
        { label: 'Não vai voltar', onSelect: () => handlers.archive(item), destructive: true },
      ];
      break;
    case 'agendado':
      primary = (
        <Button variant="primary" onClick={() => handlers.done(item)}>
          {doneActionLabel(item)}
        </Button>
      );
      menuItems = [
        { label: 'Remarcar', onSelect: () => handlers.schedule(item) },
        { label: 'Faltou', onSelect: () => handlers.noShow(item) },
        { label: 'Abrir ficha', onSelect: () => handlers.open(item) },
      ];
      break;
    default:
      primary = canUndo ? (
        <Button variant="secondary" onClick={() => handlers.undo(item)}>
          Desfazer
        </Button>
      ) : (
        <Button variant="ghost" onClick={() => handlers.open(item)}>
          Abrir ficha
        </Button>
      );
  }

  return (
    <li className={styles.row} aria-labelledby={nameId}>
      <Avatar name={item.patientName} />
      <div className={styles.main}>
        <button type="button" id={nameId} className={styles.nameButton} onClick={() => handlers.open(item)}>
          {item.patientName}
        </button>
        <p className={styles.meta}>
          {item.categoryName} · {ruleText(item)}
          {reason && <span className={styles.reason}> · {reason}</span>}
        </p>
      </div>
      <Badge tone={dueTone(item)} className={styles.badge}>
        {badgeText(item)}
      </Badge>
      <div className={styles.actions}>
        {primary}
        {menuItems.length > 0 && <Menu label={`Mais ações para ${item.patientName}`} items={menuItems} />}
      </div>
    </li>
  );
}
