import { useState } from 'react';
import { useRoute } from '../../app/router.jsx';
import { useToday } from '../../state/useToday.jsx';
import { STAGES } from '../../domain/stages.js';
import { doneMilestone } from '../../domain/vocab.js';
import { ArchiveDialog, ScheduleDialog } from './Dialogs.jsx';
import { openWhatsApp } from './whatsapp.js';

/** Ações de uma tarefa (lista Hoje e ficha do paciente), com os diálogos que elas abrem. */
export function useTaskActions() {
  const { navigate } = useRoute();
  const today = useToday();
  const [dialog, setDialog] = useState(null);

  const handlers = {
    whatsapp: (item) => {
      openWhatsApp(item);
      return today.act(item, { action: 'contacted', cycleKey: item.cycleKey });
    },
    addPhone: (item) => navigate(`/pacientes/${item.patientId}?campo=telefone`),
    schedule: (item) => setDialog({ type: 'schedule', item }),
    archive: (item) => setDialog({ type: 'archive', item }),
    done: (item) => today.act(item, { action: 'done', milestone: doneMilestone(item), anchorDate: item.anchorDate }),
    noShow: (item) => today.act(item, { action: 'no_show' }),
    unarchive: (item) => today.act(item, { action: 'unarchive' }),
    undo: (item) => today.undo(today.keyOf(item)),
    open: (item) => navigate(`/pacientes/${item.patientId}`),
    view: (toStage) =>
      navigate(STAGES.some((s) => s.id === toStage) ? `/hoje?etapa=${toStage}` : `/pacientes?situacao=${toStage}`),
  };

  const patientCategories = dialog
    ? [...new Set(today.items.filter((i) => i.patientId === dialog.item.patientId).map((i) => i.categoryName))]
    : [];

  const dialogs = (
    <>
      {dialog?.type === 'schedule' && (
        <ScheduleDialog
          item={dialog.item}
          onCancel={() => setDialog(null)}
          onConfirm={(date) => {
            const { item } = dialog;
            setDialog(null);
            today.act(item, { action: 'scheduled', date });
          }}
        />
      )}
      {dialog?.type === 'archive' && (
        <ArchiveDialog
          item={dialog.item}
          patientCategories={patientCategories.length ? patientCategories : [dialog.item.categoryName]}
          onCancel={() => setDialog(null)}
          onConfirm={(body) => {
            const { item } = dialog;
            setDialog(null);
            today.act(item, body);
          }}
        />
      )}
    </>
  );

  return { handlers, dialogs };
}
