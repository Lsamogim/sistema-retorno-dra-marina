import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Upload,
  Settings,
  Search,
  Download,
  Sparkles,
  Scissors,
  Zap,
  Syringe,
  HeartHandshake,
  Activity,
  Scale,
  Dna,
  LogOut,
} from 'lucide-react';
import PatientRow from './components/PatientRow.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import PatientDrawer from './components/PatientDrawer.jsx';
import LoginScreen from './components/LoginScreen.jsx';

function getAuthHeaders() {
  return {};
}

const CATEGORY_ICONS = {
  capilar: Scissors,
  laser: Zap,
  botox: Syringe,
  preenchimento: HeartHandshake,
  vasinhos: Activity,
  emagrecimento: Scale,
  facial: Sparkles,
  bioestimulador: Dna,
};

function formatBrDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function formatMonthsLabel(days) {
  const n = Number(days) || 0;
  if (n === 180) return '6 meses (180d)';
  if (n === 150) return '5 meses (150d)';
  if (n === 120) return '4 meses (120d)';
  if (n === 240) return '8 meses (240d)';
  if (n === 90) return '3 meses (90d)';
  return `${n} dias`;
}

export default function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [authUser, setAuthUser] = useState(null);

  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedCategoryId, setSelectedCategoryId] = useState('capilar');
  const [phaseFilter, setPhaseFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('pendentes');
  const [recencyFilter, setRecencyFilter] = useState('all');
  const [sortBy, setSortBy] = useState('urgency');
  const [searchQuery, setSearchQuery] = useState('');

  const [showSettings, setShowSettings] = useState(false);
  const [drawerItem, setDrawerItem] = useState(null);
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState(null);

  const fileInputRef = useRef(null);
  const toastTimerRef = useRef(null);

  const showToastMessage = useCallback((msg, onUndo = null) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    const toastObj = { message: msg, onUndo };
    setToast(toastObj);
    toastTimerRef.current = setTimeout(() => {
      setToast((curr) => (curr === toastObj ? null : curr));
    }, onUndo ? 6500 : 4500);
  }, []);

  const dashboardLoadedRef = useRef(false);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard', {
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (res.status === 401) {
        setAuthUser(null);
        setAuthChecked(true);
        setLoading(false);
        return;
      }
      if (!res.ok) throw new Error('Não foi possível carregar os dados do servidor local.');
      const data = await res.json();
      setDashboard(data);
      dashboardLoadedRef.current = true;
      setError(null);
    } catch (err) {
      if (dashboardLoadedRef.current) {
        // Já há dados na tela: avisar sem derrubar a interface (e sem fechar ficha/modal abertos).
        showToastMessage('Não foi possível atualizar a lista agora. Tente novamente em instantes.');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [showToastMessage]);

  // Envia uma alteração ao servidor. Retorna true se salvou; em caso de falha mostra o
  // motivo para a usuária e retorna false (quem chamou não deve fechar o formulário).
  const sendMutation = useCallback(
    async (url, method, body) => {
      let res;
      try {
        res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          credentials: 'include',
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch {
        showToastMessage('Sem conexão com o servidor. A alteração NÃO foi salva.');
        return false;
      }
      if (res.status === 401) {
        showToastMessage('Sua sessão expirou. Entre novamente; a alteração NÃO foi salva.');
        setAuthUser(null);
        setDashboard(null);
        dashboardLoadedRef.current = false;
        return false;
      }
      if (!res.ok) {
        let message = '';
        try {
          const payload = await res.json();
          message = payload?.error?.message || '';
        } catch {
          // resposta sem JSON (ex.: erro do proxy)
        }
        showToastMessage(`Não foi possível salvar: ${message || `erro ${res.status}`}`);
        return false;
      }
      return true;
    },
    [showToastMessage]
  );

  useEffect(() => {
    let mounted = true;
    try {
      localStorage.removeItem('dra_marina_auth_token');
    } catch {
      // ignore storage errors
    }
    fetch('/api/auth/session', {
      headers: getAuthHeaders(),
      credentials: 'include',
    })
      .then((r) => r.json())
      .then((session) => {
        if (!mounted) return;
        if (session?.authenticated) {
          setAuthUser(session.username);
          setAuthChecked(true);
          fetchDashboard();
        } else {
          setAuthUser(null);
          setAuthChecked(true);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!mounted) return;
        setAuthChecked(true);
        setLoading(false);
        setError('Não foi possível conectar ao servidor.');
      });
    return () => {
      mounted = false;
    };
  }, [fetchDashboard]);

  const handleLoginSuccess = useCallback(
    ({ username }) => {
      setAuthUser(username);
      setLoading(true);
      fetchDashboard();
    },
    [fetchDashboard]
  );

  const handleLogout = useCallback(async () => {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
    }).catch(() => {});
    try {
      localStorage.removeItem('dra_marina_auth_token');
    } catch {
      // ignore
    }
    setAuthUser(null);
    setDashboard(null);
    dashboardLoadedRef.current = false;
  }, []);

  const activeDrawerItem = useMemo(() => {
    if (!drawerItem || !dashboard) return null;
    const list = dashboard.itemsByCategory[drawerItem.categoryId] || [];
    return list.find((i) => i.patientId === drawerItem.patientId) || null;
  }, [drawerItem, dashboard]);

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/imports', {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: formData,
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error?.message || `Falha ao importar relatório (erro ${res.status}).`);
      }
      setDashboard(payload.dashboard);
      const { filename, validEvents, removedAppointments, cleanupSkipped } = payload.summary;
      let msg = `Relatório "${filename}" importado: ${validEvents} atendimentos processados.`;
      if (removedAppointments > 0) {
        msg += ` ${removedAppointments} agendamento(s) que saíram da agenda foram removidos.`;
      }
      if (cleanupSkipped > 0) {
        msg += ` Atenção: ${cleanupSkipped} agendamento(s) do período não estavam na planilha e foram mantidos (parece uma exportação parcial).`;
      }
      showToastMessage(msg);
    } catch (err) {
      showToastMessage(`Erro na importação: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  const handleSaveQuickPhone = useCallback(
    async (patientId, phoneManual) => {
      const ok = await sendMutation(`/api/patients/${patientId}`, 'PATCH', { phoneManual });
      if (!ok) return false;
      await fetchDashboard();
      showToastMessage('Telefone salvo.');
      return true;
    },
    [fetchDashboard, sendMutation, showToastMessage]
  );

  const handleSavePatientDetails = useCallback(
    async (patientId, body) => {
      const ok = await sendMutation(`/api/patients/${patientId}`, 'PATCH', body);
      if (!ok) return false;
      await fetchDashboard();
      showToastMessage('Ficha do paciente atualizada.');
      return true;
    },
    [fetchDashboard, sendMutation, showToastMessage]
  );

  const handleUpdateCategoryState = useCallback(
    async (patientId, categoryId, body, meta = null) => {
      const ok = await sendMutation(`/api/patients/${patientId}/categories/${categoryId}`, 'PATCH', body);
      if (ok) {
        await fetchDashboard();
        if (meta && body.archived === true) {
          const shortName = (meta.patientName || 'Paciente').split(' ')[0];
          showToastMessage(
            `${shortName} removido da lista (${body.archivedReason || 'Parou o tratamento'}).`,
            async () => {
              setToast(null);
              const undone = await sendMutation(
                `/api/patients/${patientId}/categories/${categoryId}`,
                'PATCH',
                {
                  archived: false,
                  applyToAllCategories: Boolean(body.applyToAllCategories),
                }
              );
              if (undone) await fetchDashboard();
            }
          );
        } else if (meta && meta.reactivated) {
          const shortName = (meta.patientName || 'Paciente').split(' ')[0];
          showToastMessage(`${shortName} voltou para a lista ativa de retornos.`);
        } else if (meta && meta.intervalDays) {
          const shortName = (meta.patientName || 'Paciente').split(' ')[0];
          showToastMessage(
            `Protocolo de ${shortName} salvo: retorno de ${meta.intervalDays} dias.`
          );
        }
      }
      return ok;
    },
    [fetchDashboard, sendMutation, showToastMessage]
  );

  const handleMergePatient = useCallback(
    async (sourceId, targetPatientId) => {
      const ok = await sendMutation(`/api/patients/${sourceId}/merge`, 'POST', { targetPatientId });
      if (!ok) return false;
      await fetchDashboard();
      showToastMessage('Cadastros unificados com sucesso.');
      return true;
    },
    [fetchDashboard, sendMutation, showToastMessage]
  );

  const handleSaveSettings = useCallback(
    async (categoriesDraft) => {
      const ok = await sendMutation('/api/categories', 'PUT', { categories: categoriesDraft });
      if (!ok) return false;
      setShowSettings(false);
      await fetchDashboard();
      showToastMessage('Prazos e mensagens padrão atualizados.');
      return true;
    },
    [fetchDashboard, sendMutation, showToastMessage]
  );

  const activeCategory = useMemo(() => {
    if (!dashboard) return null;
    return (
      dashboard.categories.find((c) => c.id === selectedCategoryId) || dashboard.categories[0]
    );
  }, [dashboard, selectedCategoryId]);

  const effectivePhaseFilter =
    activeCategory?.reviewDays || activeCategory?.id === 'capilar' ? phaseFilter : 'all';

  const phaseScopedItems = useMemo(() => {
    if (!dashboard || !activeCategory) return [];
    const rawList = dashboard.itemsByCategory[activeCategory.id] || [];
    if (effectivePhaseFilter === 'all') return rawList;
    if (activeCategory.id === 'capilar' && ['15', '21', '30'].includes(effectivePhaseFilter)) {
      const targetDays = Number(effectivePhaseFilter);
      return rawList.filter((item) => (item.effectiveIntervalDays || 15) === targetDays);
    }
    if (effectivePhaseFilter === 'review') {
      return rawList.filter((item) => item.cyclePhase === 'review');
    }
    if (effectivePhaseFilter === 'renewal') {
      return rawList.filter((item) => item.cyclePhase !== 'review');
    }
    if (effectivePhaseFilter === 'not_recorded') {
      return rawList.filter((item) => item.reviewState === 'not_recorded');
    }
    return rawList;
  }, [dashboard, activeCategory, effectivePhaseFilter]);

  const scopedCounts = useMemo(() => {
    const bucket = {
      total: 0,
      atrasado: 0,
      vencendo: 0,
      aguardando: 0,
      agendado: 0,
      em_dia: 0,
      arquivado: 0,
      sem_telefone: 0,
    };
    for (const item of phaseScopedItems) {
      bucket.total += 1;
      bucket[item.status] = (bucket[item.status] || 0) + 1;
      if (!item.whatsappNumber && item.status !== 'arquivado') {
        bucket.sem_telefone += 1;
      }
    }
    return bucket;
  }, [phaseScopedItems]);

  const filteredItems = useMemo(() => {
    if (!dashboard || !activeCategory) return [];
    const refIso = dashboard.referenceDate;
    const query = searchQuery.trim().toLowerCase();

    const filtered = phaseScopedItems.filter((item) => {
      if (statusFilter === 'pendentes') {
        if (item.status !== 'atrasado' && item.status !== 'vencendo') return false;
      } else if (statusFilter === 'todos') {
        if (item.status === 'arquivado') return false;
      } else if (item.status !== statusFilter) {
        return false;
      }

      if (recencyFilter === '90d' && item.lastDate) {
        const diffDays =
          (new Date(`${refIso}T12:00:00Z`) - new Date(`${item.lastDate}T12:00:00Z`)) / 86400000;
        const activeWindow = Math.max(90, activeCategory.recurrenceDays + 60);
        if (diffDays > activeWindow) return false;
      }

      if (query) {
        const hay = `${item.patientName} ${item.phone || ''} ${item.lastService || ''} ${item.procedureService || ''} ${item.lastObservation || ''}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }

      return true;
    });

    const sorted = [...filtered];
    if (sortBy === 'oldest_overdue') {
      sorted.sort((a, b) => a.daysUntilDue - b.daysUntilDue);
    } else if (sortBy === 'name') {
      sorted.sort((a, b) => a.patientName.localeCompare(b.patientName, 'pt-BR'));
    } else if (sortBy === 'last_date') {
      sorted.sort((a, b) => (b.lastDate || '').localeCompare(a.lastDate || ''));
    }

    return sorted;
  }, [dashboard, activeCategory, phaseScopedItems, statusFilter, recencyFilter, searchQuery, sortBy]);

  if (!authChecked || (authUser && loading)) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink-secondary)' }}>
        Carregando controle de retornos da Dra. Marina...
      </div>
    );
  }

  if (!authUser) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  if (error || !dashboard || !activeCategory) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <h2 style={{ color: 'var(--status-overdue-ink)' }}>Servidor local indisponível</h2>
        <p>{error || 'Verifique se o servidor local está em execução.'}</p>
        <button type="button" className="btn btn-clinical" onClick={fetchDashboard}>
          Tentar novamente
        </button>
      </div>
    );
  }

  const c = scopedCounts;
  const totalCategoryCounts = activeCategory.counts;
  const reviewCounts = activeCategory.phaseCounts?.review || { total: 0, atrasado: 0, vencendo: 0 };
  const renewalCounts = activeCategory.phaseCounts?.renewal || { total: 0, atrasado: 0, vencendo: 0 };
  const pendingActionCount = c.atrasado + c.vencendo;

  return (
    <div className="app-shell">
      {/* Navegação lateral (desktop) / barra superior deslizante (mobile) */}
      <aside className="procedure-rail" aria-label="Categorias de procedimentos">
        <div className="brand-block">
          <div className="brand-row">
            <div>
              <h2 className="brand-title">Dra. Marina Carbonera</h2>
              <p className="brand-subtitle">
                Controle de Retornos · {dashboard.totalUniquePatients} pacientes
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <a
                href="/api/backup"
                className="mobile-backup-btn"
                title="Baixar cópia de segurança do banco local"
                aria-label="Baixar backup"
              >
                <Download size={15} />
              </a>
              <button
                type="button"
                className="mobile-backup-btn"
                onClick={handleLogout}
                title="Sair da conta neste aparelho"
                aria-label="Sair"
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </div>

        <p className="rail-section-title">Procedimentos ({dashboard.categories.length})</p>

        <nav className="rail-nav">
          {dashboard.categories.map((cat) => {
            const Icon = CATEGORY_ICONS[cat.id] || Sparkles;
            const isActive = cat.id === activeCategory.id;
            const cycleText =
              cat.id === 'capilar'
                ? '15, 21 ou 30 dias'
                : cat.reviewDays
                ? `${cat.reviewDays}d retoque · ${
                    cat.recurrenceDays === 180 ? '6 meses' : `${cat.recurrenceDays}d`
                  }`
                : `Ciclo ${cat.recurrenceDays === 90 ? '3 meses' : `${cat.recurrenceDays} dias`}`;

            return (
              <button
                key={cat.id}
                type="button"
                className={`rail-item ${isActive ? 'is-active' : ''}`}
                onClick={(e) => {
                  setSelectedCategoryId(cat.id);
                  setPhaseFilter('all');
                  e.currentTarget.scrollIntoView({
                    behavior: 'smooth',
                    inline: 'center',
                    block: 'nearest',
                  });
                }}
              >
                <div className="rail-item-main">
                  <Icon size={16} />
                  <div className="rail-item-label">
                    <span className="rail-item-name">{cat.shortName}</span>
                    <span className="rail-item-cycle">{cycleText}</span>
                  </div>
                </div>

                <div className="rail-badges">
                  {cat.counts.atrasado > 0 && (
                    <span className="rail-count-urgent" title={`${cat.counts.atrasado} atrasados`}>
                      {cat.counts.atrasado}
                    </span>
                  )}
                  {cat.counts.vencendo > 0 && (
                    <span className="rail-count-soon" title={`${cat.counts.vencendo} vencendo em até 5 dias`}>
                      +{cat.counts.vencendo}
                    </span>
                  )}
                  {cat.counts.atrasado === 0 && cat.counts.vencendo === 0 && (
                    <span className="rail-count-neutral">{cat.counts.total}</span>
                  )}
                </div>
              </button>
            );
          })}
        </nav>

        <div className="rail-footer">
          <div>
            <div>
              <strong>{dashboard.totalUniquePatients}</strong> pacientes na base local
            </div>
            {dashboard.lastImport && (
              <div className="tabular" style={{ marginTop: 2 }}>
                Última planilha: {formatBrDate(dashboard.lastImport.importedAt.slice(0, 10))}
              </div>
            )}
          </div>
          <div className="rail-footer-actions">
            <a
              href="/api/backup"
              className="btn-rail-secondary"
              title="Baixar cópia de segurança do banco local"
            >
              <Download size={13} /> Backup local
            </a>
            <button
              type="button"
              className="btn-rail-secondary"
              onClick={handleLogout}
              title={`Sair (${authUser})`}
            >
              <LogOut size={13} /> Sair
            </button>
          </div>
        </div>
      </aside>

      {/* Área principal de triagem e agendamento */}
      <main className="workspace-main">
        <header className="workspace-header">
          <div className="category-heading-group">
            <h1>{activeCategory.name}</h1>
            <div className="category-meta-line tabular">
              <span>
                {activeCategory.id === 'capilar' ? (
                  <>
                    Protocolo por paciente: <strong>15, 21 ou 30 dias</strong>
                  </>
                ) : activeCategory.reviewDays ? (
                  <>
                    2 retornos:{' '}
                    <strong>
                      Retoque ({activeCategory.reviewDays} dias) · Procedimento (
                      {formatMonthsLabel(activeCategory.recurrenceDays)})
                    </strong>
                  </>
                ) : (
                  <>
                    Recorrência: <strong>a cada {activeCategory.recurrenceDays} dias</strong>
                  </>
                )}
              </span>
              <span className="meta-sep">·</span>
              <span>Ref: {formatBrDate(dashboard.referenceDate)}</span>
              {c.sem_telefone > 0 && (
                <span className="missing-count-pill">
                  {c.sem_telefone} sem telefone
                </span>
              )}
            </div>
          </div>

          <div className="header-actions">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              style={{ display: 'none' }}
              onChange={handleImportFile}
            />
            <button
              type="button"
              className="btn btn-outline header-action-btn"
              onClick={() => setShowSettings(true)}
            >
              <Settings size={15} />
              <span>Prazos e mensagens</span>
            </button>

            <button
              type="button"
              className="btn btn-clinical header-action-btn"
              disabled={importing}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={15} />
              <span className="desktop-label">
                {importing ? 'Importando...' : 'Importar relatório (.xlsx / .csv)'}
              </span>
              <span className="mobile-label">
                {importing ? 'Importando...' : 'Importar planilha'}
              </span>
            </button>
          </div>
        </header>

        {/* Seletor de protocolo para Capilar (15, 21 ou 30 dias) */}
        {activeCategory.id === 'capilar' && (
          <div
            className="dual-return-bar"
            role="region"
            aria-label="Filtrar por protocolo capilar (15, 21 ou 30 dias)"
          >
            <div className="dual-return-pills">
              <button
                type="button"
                className={`dual-return-pill ${effectivePhaseFilter === 'all' ? 'is-active' : ''}`}
                onClick={() => setPhaseFilter('all')}
              >
                <span>Todos os protocolos</span>
                <span className="dual-pill-badge">{totalCategoryCounts.total}</span>
              </button>

              {[15, 21, 30].map((days) => {
                const countForDays = activeCategory.intervalCounts?.[days]?.total || 0;
                return (
                  <button
                    key={days}
                    type="button"
                    className={`dual-return-pill ${
                      effectivePhaseFilter === String(days) ? 'is-active' : ''
                    }`}
                    onClick={() => setPhaseFilter(String(days))}
                  >
                    <span>Retorno {days} dias</span>
                    <span className="dual-pill-badge">{countForDays}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Seletor simples para procedimentos com 2 tipos de retorno (ex: Botox e Preenchimento) */}
        {activeCategory.reviewDays && activeCategory.id !== 'capilar' && (
          <div className="dual-return-bar" role="region" aria-label="Separar por tipo de retorno">
            <div className="dual-return-pills">
              <button
                type="button"
                className={`dual-return-pill ${effectivePhaseFilter === 'all' ? 'is-active' : ''}`}
                onClick={() => setPhaseFilter('all')}
              >
                <span>Todos</span>
                <span className="dual-pill-badge">{totalCategoryCounts.total}</span>
              </button>

              <button
                type="button"
                className={`dual-return-pill is-review-pill ${effectivePhaseFilter === 'review' ? 'is-active' : ''}`}
                onClick={() => setPhaseFilter('review')}
              >
                <span>Retoque ({activeCategory.reviewDays} dias)</span>
                <span className="dual-pill-badge">{reviewCounts.total}</span>
              </button>

              <button
                type="button"
                className={`dual-return-pill is-renewal-pill ${effectivePhaseFilter === 'renewal' ? 'is-active' : ''}`}
                onClick={() => setPhaseFilter('renewal')}
              >
                <span>
                  Retorno ({activeCategory.recurrenceDays === 180 ? '6 meses' : `${activeCategory.recurrenceDays} dias`})
                </span>
                <span className="dual-pill-badge">{renewalCounts.total}</span>
              </button>
            </div>
          </div>
        )}

        {/* Barra de semáforo interativa (deslizante horizontal no mobile) */}
        <div className="triage-strip" role="tablist" aria-label="Filtrar por situação do retorno">
          <button
            type="button"
            className={`triage-tab ${statusFilter === 'pendentes' ? 'is-selected' : ''}`}
            onClick={() => setStatusFilter('pendentes')}
          >
            <span className="triage-dot overdue" />
            Para chamar
            <span className="triage-count">{pendingActionCount}</span>
          </button>

          <button
            type="button"
            className={`triage-tab ${statusFilter === 'atrasado' ? 'is-selected' : ''}`}
            onClick={() => setStatusFilter('atrasado')}
          >
            <span className="triage-dot overdue" />
            Atrasados
            <span className="triage-count">{c.atrasado}</span>
          </button>

          <button
            type="button"
            className={`triage-tab ${statusFilter === 'vencendo' ? 'is-selected' : ''}`}
            onClick={() => setStatusFilter('vencendo')}
          >
            <span className="triage-dot soon" />
            Vencendo (5d)
            <span className="triage-count">{c.vencendo}</span>
          </button>

          <button
            type="button"
            className={`triage-tab ${statusFilter === 'aguardando' ? 'is-selected' : ''}`}
            onClick={() => setStatusFilter('aguardando')}
          >
            <span className="triage-dot waiting" />
            Já chamei
            <span className="triage-count">{c.aguardando}</span>
          </button>

          <button
            type="button"
            className={`triage-tab ${statusFilter === 'agendado' ? 'is-selected' : ''}`}
            onClick={() => setStatusFilter('agendado')}
          >
            <span className="triage-dot scheduled" />
            Já agendados
            <span className="triage-count">{c.agendado}</span>
          </button>

          <button
            type="button"
            className={`triage-tab ${statusFilter === 'em_dia' ? 'is-selected' : ''}`}
            onClick={() => setStatusFilter('em_dia')}
          >
            Em dia
            <span className="triage-count">{c.em_dia}</span>
          </button>

          <button
            type="button"
            className={`triage-tab ${statusFilter === 'todos' ? 'is-selected' : ''}`}
            onClick={() => setStatusFilter('todos')}
          >
            Todos ativos
            <span className="triage-count">{c.total - c.arquivado}</span>
          </button>

          <button
            type="button"
            className={`triage-tab ${statusFilter === 'arquivado' ? 'is-selected' : ''}`}
            onClick={() => setStatusFilter('arquivado')}
            title="Pacientes que pararam o tratamento, pausaram ou tiveram alta"
          >
            <span className="triage-dot archived" />
            Não voltam / Pararam
            <span className="triage-count">{c.arquivado}</span>
          </button>
        </div>

        {/* Busca, filtro de janela ativa e ordenação */}
        <div className="toolbar-row">
          <div className="search-box">
            <Search size={15} />
            <input
              type="search"
              className="search-input"
              placeholder="Buscar nome, telefone ou observação..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="toolbar-controls">
            <div className="segmented-toggle" role="group" aria-label="Período de atividade">
              <button
                type="button"
                className={`segmented-btn ${recencyFilter === '90d' ? 'is-active' : ''}`}
                onClick={() => setRecencyFilter('90d')}
                title="Mostrar apenas pacientes em ciclo recente"
              >
                Recentes
              </button>
              <button
                type="button"
                className={`segmented-btn ${recencyFilter === 'all' ? 'is-active' : ''}`}
                onClick={() => setRecencyFilter('all')}
              >
                Todos ({c.total})
              </button>
            </div>

            <select
              className="select-control sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              aria-label="Ordenação da lista"
            >
              <option value="urgency">Atraso recente</option>
              <option value="oldest_overdue">Maior atraso</option>
              <option value="last_date">Última sessão</option>
              <option value="name">Nome (A–Z)</option>
            </select>
          </div>
        </div>

        {/* Lista de pacientes em Cards Individuais (Desktop e iPhone) */}
        <section className="cards-feed" aria-label={`Pacientes de ${activeCategory.name}`}>
          {filteredItems.length === 0 ? (
            <div className="empty-ledger">
              <h3>Nenhum paciente neste filtro</h3>
              <p>
                {searchQuery
                  ? `Nenhum resultado para "${searchQuery}" em ${activeCategory.name}.`
                  : 'Altere o filtro acima (ex: "Todos ativos") para visualizar outros pacientes desta categoria.'}
              </p>
            </div>
          ) : (
            <div className="patient-cards-list">
              {filteredItems.map((item) => (
                <PatientRow
                  key={`${item.categoryId}-${item.patientId}`}
                  item={item}
                  onOpenDrawer={setDrawerItem}
                  onSaveQuickPhone={handleSaveQuickPhone}
                  onUpdateState={handleUpdateCategoryState}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      {showSettings && (
        <SettingsModal
          categories={dashboard.categories}
          currentUsername={authUser}
          authHeaders={getAuthHeaders}
          onCredentialsUpdated={(newUser) => {
            setAuthUser(newUser);
            showToastMessage('Usuário e senha atualizados com sucesso.');
          }}
          onClose={() => setShowSettings(false)}
          onSave={handleSaveSettings}
        />
      )}

      {activeDrawerItem && (
        <PatientDrawer
          item={activeDrawerItem}
          category={activeCategory}
          allPatients={dashboard.allPatients}
          onClose={() => setDrawerItem(null)}
          onSavePatient={handleSavePatientDetails}
          onUpdateState={handleUpdateCategoryState}
          onMergePatient={handleMergePatient}
        />
      )}

      {toast && (
        <div className="toast-banner" role="status">
          <span>{typeof toast === 'string' ? toast : toast.message}</span>
          {toast.onUndo && (
            <button type="button" className="toast-undo-btn" onClick={toast.onUndo}>
              Desfazer
            </button>
          )}
        </div>
      )}
    </div>
  );
}
