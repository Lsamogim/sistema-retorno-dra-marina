import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import { Avatar, Badge, Button, EmptyState, Select } from '../../ui/index.js';
import { endpoints } from '../../api/endpoints.js';
import { useRoute, withQuery } from '../../app/router.jsx';
import { stageLabel } from '../../domain/stages.js';
import { dueTone } from '../../domain/vocab.js';
import styles from './Patients.module.css';

const STAGE_PRIORITY = ['chamar', 'aguardando', 'agendado', 'concluido', 'ainda_nao', 'fora'];
const ACTIVE = new Set(['chamar', 'aguardando', 'agendado', 'concluido']);

const SITUATIONS = [
  { value: '', label: 'Todas as situações' },
  { value: 'acompanhamento', label: 'Em acompanhamento' },
  { value: 'ainda_nao', label: 'Ainda não é hora' },
  { value: 'fora', label: 'Fora da lista' },
  { value: 'sem_telefone', label: 'Sem telefone' },
];

const normalize = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

function buildPatients(dashboard) {
  const byId = new Map();
  for (const p of dashboard.allPatients) byId.set(p.id, { id: p.id, name: p.name, phone: p.phone || '', items: [] });
  for (const item of Object.values(dashboard.itemsByCategory).flat()) {
    const entry = byId.get(item.patientId);
    if (!entry) continue;
    entry.items.push(item);
    if (!entry.phone && item.phone) entry.phone = item.phone;
  }
  return [...byId.values()].map((p) => {
    const top = [...p.items].sort((a, b) => STAGE_PRIORITY.indexOf(a.stage) - STAGE_PRIORITY.indexOf(b.stage))[0] || null;
    return { ...p, top };
  });
}

export function PatientsPage() {
  const { path, query, navigate } = useRoute();
  const [state, setState] = useState({ status: 'loading', patients: [], categories: [] });
  const [search, setSearch] = useState('');
  const proc = query.get('proc') || '';
  const situacao = query.get('situacao') || '';

  const load = async () => {
    try {
      const d = await endpoints.getDashboard();
      setState({ status: 'ready', patients: buildPatients(d), categories: d.categories });
    } catch (err) {
      setState((s) => ({ ...s, status: 'error', error: err.message }));
    }
  };
  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = normalize(search.trim());
    const digits = search.replace(/\D/g, '');
    return state.patients
      .filter((p) => {
        const items = proc ? p.items.filter((i) => i.categoryId === proc) : p.items;
        if (proc && items.length === 0) return false;
        if (situacao === 'acompanhamento' && !items.some((i) => ACTIVE.has(i.stage))) return false;
        if (situacao === 'ainda_nao' && !items.some((i) => i.stage === 'ainda_nao')) return false;
        if (situacao === 'fora' && !items.some((i) => i.stage === 'fora')) return false;
        if (situacao === 'sem_telefone' && p.phone.replace(/\D/g, '').length >= 8) return false;
        if (!q) return true;
        return normalize(p.name).includes(q) || (digits.length >= 3 && p.phone.replace(/\D/g, '').includes(digits));
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [state.patients, search, proc, situacao]);

  const setFilter = (changes) => navigate(withQuery(path, query, changes), { replace: true });

  if (state.status === 'loading') return <p className={styles.loading}>Carregando pacientes…</p>;
  if (state.status === 'error') {
    return <EmptyState title="Não foi possível carregar os pacientes" body={state.error} action={<Button onClick={load}>Tentar de novo</Button>} />;
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Pacientes</h1>
        <p className={styles.count}>{filtered.length === 1 ? '1 paciente' : `${filtered.length} pacientes`}</p>
      </header>

      <div className={styles.filters}>
        <div className={styles.search}>
          <label htmlFor="patients-search" className="visually-hidden">
            Buscar paciente
          </label>
          <Search size={18} className={styles.searchIcon} aria-hidden="true" />
          <input
            id="patients-search"
            type="search"
            className={styles.searchInput}
            placeholder="Buscar nome ou telefone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          label="Procedimento"
          value={proc}
          onChange={(v) => setFilter({ proc: v })}
          options={[{ value: '', label: 'Todos os procedimentos' }, ...state.categories.map((c) => ({ value: c.id, label: c.name }))]}
        />
        <Select label="Situação" value={situacao} onChange={(v) => setFilter({ situacao: v })} options={SITUATIONS} />
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="Nenhum paciente com esse filtro" body="Mude a busca ou os filtros acima." />
      ) : (
        <ul className={styles.list} aria-label="Pacientes">
          {filtered.map((p) => {
            const out = p.items.find((i) => i.stage === 'fora' && (!proc || i.categoryId === proc));
            return (
              <li key={p.id} className={styles.row}>
                <button type="button" className={styles.rowButton} onClick={() => navigate(`/pacientes/${p.id}`)}>
                  <Avatar name={p.name} />
                  <span className={styles.main}>
                    <span className={styles.name}>{p.name}</span>
                    <span className={styles.meta}>
                      {p.phone || 'Sem telefone'}
                      {situacao === 'fora' && out?.archivedReason ? ` · ${out.archivedReason}` : ''}
                    </span>
                  </span>
                  <span className={styles.tags}>
                    {p.items.map((i) => (
                      <Badge key={i.categoryId} tone="neutral">
                        {i.categoryName}
                      </Badge>
                    ))}
                  </span>
                  {p.top && <Badge tone={dueTone(p.top)}>{stageLabel(p.top.stage)}</Badge>}
                  <ChevronRight size={18} className={styles.chevron} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
