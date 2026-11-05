import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Button, EmptyState, Select, StageTabs } from '../../ui/index.js';
import { useRoute, withQuery } from '../../app/router.jsx';
import { useToday } from '../../state/useToday.jsx';
import { STAGES, isStaleOverdue, stageLabel } from '../../domain/stages.js';
import { doneMilestone } from '../../domain/vocab.js';
import { formatLongDate } from '../../domain/dates.js';
import { TaskRow } from './TaskRow.jsx';
import { ArchiveDialog, ScheduleDialog } from './Dialogs.jsx';
import { openWhatsApp } from './whatsapp.js';
import styles from './Today.module.css';

const EMPTY_TITLES = {
  chamar: 'Ninguém para chamar agora',
  aguardando: 'Ninguém aguardando resposta',
  agendado: 'Nenhum agendamento em aberto',
  concluido: 'Nada concluído nos últimos 7 dias',
};

const normalize = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

export function TodayPage() {
  const { path, query, navigate } = useRoute();
  const today = useToday();
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState(null); // {type:'schedule'|'archive', item}

  const stage = STAGES.some((s) => s.id === query.get('etapa')) ? query.get('etapa') : 'chamar';
  const proc = query.get('proc') || '';

  const filterItem = useMemo(() => {
    const q = normalize(search.trim());
    const digits = search.replace(/\D/g, '');
    return (item) => {
      if (proc && item.categoryId !== proc) return false;
      if (!q) return true;
      return (
        normalize(item.patientName).includes(q) ||
        (digits.length >= 3 && String(item.phone || item.whatsappNumber || '').replace(/\D/g, '').includes(digits))
      );
    };
  }, [search, proc]);

  if (today.status === 'loading') return <p className={styles.loading}>Carregando a lista do dia…</p>;
  if (today.status === 'error') {
    return (
      <EmptyState
        title="Não foi possível carregar a lista"
        body={today.error}
        action={<Button onClick={today.reload}>Tentar de novo</Button>}
      />
    );
  }

  const visible = today.visibleItems(stage).filter(filterItem);
  const recent = visible.filter((i) => !isStaleOverdue(i) || today.moved.get(today.keyOf(i)));
  const stale = visible.filter((i) => isStaleOverdue(i) && !today.moved.get(today.keyOf(i)));

  const stageTabs = STAGES.map((s) => ({ ...s, count: today.counts[s.id] }));
  const goStage = (id) => navigate(withQuery(path, query, { etapa: id }), { replace: true });

  const handlers = {
    whatsapp: (item) => {
      openWhatsApp(item);
      today.act(item, { action: 'contacted', cycleKey: item.cycleKey });
    },
    addPhone: (item) => navigate(`/pacientes/${item.patientId}?campo=telefone`),
    schedule: (item) => setDialog({ type: 'schedule', item }),
    archive: (item) => setDialog({ type: 'archive', item }),
    done: (item) => today.act(item, { action: 'done', milestone: doneMilestone(item), anchorDate: item.anchorDate }),
    noShow: (item) => today.act(item, { action: 'no_show' }),
    undo: (item) => today.undo(today.keyOf(item)),
    open: (item) => navigate(`/pacientes/${item.patientId}`),
    view: (toStage) => navigate(STAGES.some((s) => s.id === toStage) ? `/hoje?etapa=${toStage}` : `/pacientes?situacao=${toStage}`),
  };

  const renderRow = (item) => (
    <TaskRow
      key={today.keyOf(item)}
      item={item}
      moved={today.moved.get(today.keyOf(item))}
      canUndo={today.canUndo(today.keyOf(item))}
      handlers={handlers}
    />
  );

  const busiest = STAGES.filter((s) => s.id !== stage && today.counts[s.id] > 0).sort((a, b) => today.counts[b.id] - today.counts[a.id])[0];
  const patientCategories = dialog
    ? [...new Set(today.items.filter((i) => i.patientId === dialog.item.patientId).map((i) => i.categoryName))]
    : [];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Hoje</h1>
        <p className={styles.date}>{formatLongDate(today.referenceDate)}</p>
      </header>

      <StageTabs stages={stageTabs} value={stage} onChange={goStage} pulseId={today.lastMovedToken} />

      <div className={styles.toolbar}>
        <Select
          label="Procedimento"
          hideLabel
          value={proc}
          onChange={(v) => navigate(withQuery(path, query, { proc: v }), { replace: true })}
          options={[{ value: '', label: 'Todos os procedimentos' }, ...today.categories.map((c) => ({ value: c.id, label: c.name }))]}
          className={styles.procSelect}
        />
        <div className={styles.search}>
          <label htmlFor="today-search" className="visually-hidden">
            Buscar paciente
          </label>
          <Search size={18} className={styles.searchIcon} aria-hidden="true" />
          <input
            id="today-search"
            type="search"
            className={styles.searchInput}
            placeholder="Buscar nome ou telefone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {recent.length === 0 && stale.length === 0 ? (
        <EmptyState
          title={search || proc ? 'Nenhum paciente com esse filtro' : EMPTY_TITLES[stage]}
          body={busiest ? `Há ${today.counts[busiest.id]} em ${busiest.label}.` : 'Tudo em dia por aqui.'}
          action={busiest ? <Button onClick={() => goStage(busiest.id)}>Ver {busiest.label}</Button> : null}
        />
      ) : (
        <>
          {recent.length > 0 && (
            <ul className={styles.list} aria-label={stageLabel(stage)}>
              {recent.map(renderRow)}
            </ul>
          )}
          {stale.length > 0 && (
            <details className={styles.staleGroup}>
              <summary className={styles.staleSummary}>
                Atrasados há mais de 60 dias ({stale.length}) — retomar contato quando houver tempo
              </summary>
              <ul className={styles.list} aria-label="Atrasados há mais de 60 dias">
                {stale.map(renderRow)}
              </ul>
            </details>
          )}
        </>
      )}

      {dialog?.type === 'schedule' && (
        <ScheduleDialog
          item={dialog.item}
          onCancel={() => setDialog(null)}
          onConfirm={(date) => {
            const item = dialog.item;
            setDialog(null);
            today.act(item, { action: 'scheduled', date });
          }}
        />
      )}
      {dialog?.type === 'archive' && (
        <ArchiveDialog
          item={dialog.item}
          patientCategories={patientCategories}
          onCancel={() => setDialog(null)}
          onConfirm={(body) => {
            const item = dialog.item;
            setDialog(null);
            today.act(item, body);
          }}
        />
      )}
    </div>
  );
}
