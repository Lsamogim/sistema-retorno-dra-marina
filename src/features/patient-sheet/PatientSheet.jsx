import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Sheet, useToast } from '../../ui/index.js';
import { endpoints } from '../../api/endpoints.js';
import { useRoute } from '../../app/router.jsx';
import { useToday } from '../../state/useToday.jsx';
import { TODAY_STAGE_IDS } from '../../domain/stages.js';
import { useTaskActions } from '../today/useTaskActions.jsx';
import { AutosaveField } from './AutosaveField.jsx';
import { HistorySection, MergeSection, ProcedureSection, StageActions } from './Sections.jsx';
import styles from './PatientSheet.module.css';

export function PatientSheet({ patientId }) {
  const { query, navigate } = useRoute();
  const today = useToday();
  const toast = useToast();
  const { handlers, dialogs } = useTaskActions();
  const [data, setData] = useState({ status: 'loading', items: [], allPatients: [], patient: null });
  const phoneRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const d = await endpoints.getDashboard();
      const items = Object.values(d.itemsByCategory)
        .flat()
        .filter((i) => i.patientId === patientId);
      const patient = d.allPatients.find((p) => p.id === patientId) || null;
      setData({ status: 'ready', items, allPatients: d.allPatients, patient });
    } catch (err) {
      setData((s) => ({ ...s, status: 'error', error: err.message }));
    }
  }, [patientId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (data.status === 'ready' && query.get('campo') === 'telefone') phoneRef.current?.focus();
  }, [data.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => {
    if (window.history.state?.from) window.history.back();
    else navigate('/hoje');
  };

  const first = data.items[0];
  const name = first?.patientName || data.patient?.name || 'Paciente';
  const phone = first?.phone || data.patient?.phone || '';
  const notes = first?.patientNotes || '';

  const afterChange = async () => {
    await load();
    today.reload();
  };

  const savePatient = async (fields) => {
    await endpoints.updatePatient(patientId, fields);
    await afterChange();
  };

  const saveState = async (item, body, message) => {
    try {
      await endpoints.updateState(item.patientId, item.categoryId, body);
      await afterChange();
      if (message) toast.show({ message });
    } catch (err) {
      if (message) toast.show({ message: err.message, tone: 'error' });
      else throw err;
    }
  };

  // Etapa atual vinda da lista do dia (inclui o estado "Movido para…").
  const todayItems = today.items.filter((i) => i.patientId === patientId);
  const activeItems = todayItems.filter((i) => TODAY_STAGE_IDS.includes(i.stage) || today.moved.get(today.keyOf(i)));

  return (
    <Sheet open title={name} subtitle={data.items.map((i) => i.categoryName).join(' · ')} onClose={close}>
      {data.status === 'loading' && <p className={styles.help}>Carregando a ficha…</p>}
      {data.status === 'error' && (
        <div className={styles.section}>
          <p className={styles.help}>{data.error}</p>
          <Button onClick={load}>Tentar de novo</Button>
        </div>
      )}
      {data.status === 'ready' && (
        <>
          <section className={styles.section} aria-labelledby="sheet-contato">
            <h3 id="sheet-contato" className={styles.sectionTitle}>
              Contato
            </h3>
            <AutosaveField
              label="Telefone / WhatsApp"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              inputRef={phoneRef}
              value={phone}
              onSave={(v) => savePatient({ phoneManual: v })}
            />
          </section>

          {activeItems.length > 0 && (
            <section className={styles.section} aria-labelledby="sheet-agora">
              <h3 id="sheet-agora" className={styles.sectionTitle}>
                O que fazer agora
              </h3>
              {activeItems.map((item) => (
                <StageActions
                  key={today.keyOf(item)}
                  item={item}
                  moved={today.moved.get(today.keyOf(item))}
                  canUndo={today.canUndo(today.keyOf(item))}
                  handlers={handlers}
                  onAddPhone={() => phoneRef.current?.focus()}
                />
              ))}
            </section>
          )}

          <section className={styles.section} aria-labelledby="sheet-proc">
            <h3 id="sheet-proc" className={styles.sectionTitle}>
              Procedimentos
            </h3>
            {data.items.length === 0 && <p className={styles.help}>Nenhum procedimento acompanhado.</p>}
            {data.items.map((item) => (
              <ProcedureSection
                key={item.categoryId}
                item={item}
                onSaveState={saveState}
                onUnarchive={async (it) => {
                  await handlers.unarchive(it);
                  await load();
                }}
              />
            ))}
          </section>

          <section className={styles.section} aria-labelledby="sheet-notas">
            <h3 id="sheet-notas" className={styles.sectionTitle}>
              Anotações da equipe
            </h3>
            <AutosaveField
              label="Anotação"
              multiline
              value={notes}
              placeholder="Prefere horários à tarde, avisar a irmã…"
              onSave={(v) => savePatient({ notesManual: v })}
            />
          </section>

          <section className={styles.section}>
            {data.items.map((item) => (
              <HistorySection key={item.categoryId} item={item} />
            ))}
            <details className={styles.collapsible}>
              <summary>Editar cadastro</summary>
              <div className={styles.collapsibleBody}>
                <AutosaveField
                  label="Nome do paciente"
                  value={name}
                  validate={(v) => (v.trim() ? '' : 'O nome não pode ficar vazio.')}
                  onSave={(v) => savePatient({ displayName: v.trim() })}
                />
              </div>
            </details>
            <MergeSection
              patientId={patientId}
              patientName={name}
              allPatients={data.allPatients}
              onMerge={async (targetId) => {
                try {
                  await endpoints.mergePatient(patientId, targetId);
                  toast.show({ message: 'Cadastros unificados.' });
                  today.reload();
                  navigate(`/pacientes/${targetId}`, { replace: true });
                } catch (err) {
                  toast.show({ message: err.message, tone: 'error' });
                }
              }}
            />
          </section>
        </>
      )}
      {dialogs}
    </Sheet>
  );
}
