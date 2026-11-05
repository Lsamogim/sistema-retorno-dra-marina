import React, { memo, useState } from 'react';
import {
  MessageCircle,
  Check,
  UserX,
  RotateCcw,
  Phone,
  AlertTriangle,
  CalendarCheck,
  Square,
  CheckSquare,
  Calendar,
  X,
} from 'lucide-react';

const STOP_REASONS = [
  { label: 'Parou o tratamento', reason: 'Parou o tratamento', allCategories: false },
  { label: 'Não volta por um tempo', reason: 'Não volta por um tempo', allCategories: false },
  { label: 'Teve alta / Concluiu', reason: 'Teve alta / Concluiu', allCategories: false },
  {
    label: 'Não volta mais (todos os procedimentos)',
    reason: 'Não volta mais',
    allCategories: true,
  },
];

const CAPILAR_INTERVAL_OPTIONS = [15, 21, 30];

function formatBrDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function formatShortBrDate(iso) {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

function renderStatusBadge(item) {
  if (item.status === 'arquivado') {
    return (
      <span className="status-badge arquivado">
        <UserX size={12} />
        {item.archivedReason || 'Parou o tratamento'}
      </span>
    );
  }
  if (item.status === 'agendado' && item.nextScheduled) {
    return (
      <span className="status-badge agendado tabular">
        <CalendarCheck size={13} />
        Agendado {formatShortBrDate(item.nextScheduled.date)}
      </span>
    );
  }
  if (item.status === 'aguardando') {
    return (
      <span className="status-badge aguardando">
        <Check size={13} />
        Já chamei
      </span>
    );
  }
  if (item.status === 'atrasado') {
    const days = Math.abs(item.daysUntilDue);
    return (
      <span className="status-badge atrasado tabular">
        Atrasado há {days}d
      </span>
    );
  }
  if (item.status === 'vencendo') {
    if (item.daysUntilDue === 0) {
      return <span className="status-badge vencendo">Vence hoje</span>;
    }
    return (
      <span className="status-badge vencendo tabular">
        Vence em {item.daysUntilDue}d
      </span>
    );
  }
  return <span className="status-badge em_dia tabular">Em dia</span>;
}

const PatientRow = memo(function PatientRow({
  item,
  onOpenDrawer,
  onSaveQuickPhone,
  onUpdateState,
}) {
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState(item.phone || '');
  const [showStopMenu, setShowStopMenu] = useState(false);

  const handleQuickPhoneSubmit = async (e) => {
    e.preventDefault();
    const saved = await onSaveQuickPhone(item.patientId, phoneInput);
    if (saved) setEditingPhone(false); // em caso de erro, manter o número digitado
  };

  const handleSelectStopReason = (opt) => {
    setShowStopMenu(false);
    onUpdateState(
      item.patientId,
      item.categoryId,
      {
        archived: true,
        archivedReason: opt.reason,
        applyToAllCategories: opt.allCategories,
      },
      {
        patientName: item.patientName,
        reasonLabel: opt.label,
      }
    );
  };

  const handleReactivate = () => {
    onUpdateState(
      item.patientId,
      item.categoryId,
      {
        archived: false,
      },
      {
        patientName: item.patientName,
        reactivated: true,
      }
    );
  };

  const handleWhatsappClick = () => {
    if (!item.whatsappNumber) {
      setPhoneInput(item.phone || '');
      setEditingPhone(true);
      return;
    }
    const url = `https://wa.me/${item.whatsappNumber}?text=${encodeURIComponent(item.whatsappMessage)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const anchorDate = item.anchorDate || item.procedureDate || item.lastDate;

  const handleToggleReviewDone = () => {
    onUpdateState(item.patientId, item.categoryId, {
      reviewDone: {
        done: !item.reviewDone,
        anchorDate,
      },
    });
  };

  const handleToggleRenewalDone = () => {
    onUpdateState(item.patientId, item.categoryId, {
      renewalDone: {
        done: !item.renewalDone,
        anchorDate,
      },
    });
  };

  const handleSelectCapilarInterval = (days) => {
    if (item.effectiveIntervalDays === days && item.customIntervalDays === days) return;
    onUpdateState(
      item.patientId,
      item.categoryId,
      {
        customIntervalDays: days,
      },
      {
        patientName: item.patientName,
        intervalDays: days,
      }
    );
  };

  const statusBadge = renderStatusBadge(item);
  const isCapilar = item.categoryId === 'capilar';
  const activeCapilarDays = item.effectiveIntervalDays || 15;
  const hasTwoCheckboxes = Boolean(item.hasDualReturn && item.reviewDueDate && !isCapilar);

  const firstStatusClass = item.reviewDone
    ? 'done'
    : item.reviewScheduledDate
    ? 'scheduled'
    : item.cyclePhase === 'review' && item.status === 'atrasado'
    ? 'overdue'
    : 'pending';

  const firstStatusText = item.reviewDone
    ? 'Feito'
    : item.reviewScheduledDate
    ? `Agendado ${formatShortBrDate(item.reviewScheduledDate)}`
    : item.cyclePhase === 'review' && item.status === 'atrasado'
    ? 'Atrasado'
    : 'Pendente';

  const secondStatusClass = item.renewalDone
    ? 'done'
    : item.nextScheduled && (!hasTwoCheckboxes || item.nextScheduled.kind === 'procedure')
    ? 'scheduled'
    : (!hasTwoCheckboxes || item.cyclePhase === 'renewal') && item.status === 'atrasado'
    ? 'overdue'
    : 'pending';

  const secondStatusText = item.renewalDone
    ? 'Feito'
    : item.nextScheduled && (!hasTwoCheckboxes || item.nextScheduled.kind === 'procedure')
    ? `Agendado ${formatShortBrDate(item.nextScheduled.date)}`
    : (!hasTwoCheckboxes || item.cyclePhase === 'renewal') && item.status === 'atrasado'
    ? 'Atrasado'
    : 'Pendente';

  return (
    <article className={`patient-card is-${item.status}`}>
      <div className="patient-card-grid">
        {/* Bloco 1: Paciente, Status & Telefone */}
        <div className="card-patient-block">
          <div className="patient-top-bar">
            <button
              type="button"
              className="patient-name-btn"
              onClick={() => onOpenDrawer(item)}
              title="Abrir ficha completa e histórico"
            >
              {item.patientName}
            </button>
            <div className="card-status-pill">{statusBadge}</div>
          </div>

          {!editingPhone ? (
            <div className="phone-line">
              {item.phone ? (
                <>
                  <span className="phone-number tabular">{item.phone}</span>
                  <button
                    type="button"
                    className="link-inline-btn"
                    onClick={() => {
                      setPhoneInput(item.phone || '');
                      setEditingPhone(true);
                    }}
                  >
                    Editar
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="missing-phone-btn"
                    onClick={() => {
                      setPhoneInput('');
                      setEditingPhone(true);
                    }}
                  >
                    <Phone size={12} /> Cadastrar telefone
                  </button>
                  {item.phoneHint && (
                    <button
                      type="button"
                      className="phone-hint-chip tabular"
                      title={`Copiar telefone de ${item.phoneHint.sourceName}`}
                      onClick={() => onSaveQuickPhone(item.patientId, item.phoneHint.phone)}
                    >
                      Usar {item.phoneHint.phone} ({item.phoneHint.sourceName.split(' ')[0]})
                    </button>
                  )}
                </>
              )}
            </div>
          ) : (
            <form className="inline-phone-editor" onSubmit={handleQuickPhoneSubmit}>
              <input
                type="tel"
                inputMode="tel"
                className="inline-phone-input tabular"
                placeholder="(14) 99999-9999"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                autoFocus
              />
              <button type="submit" className="btn btn-clinical btn-inline-save">
                Salvar
              </button>
              <button
                type="button"
                className="btn-ghost-sm btn-inline-cancel"
                onClick={() => setEditingPhone(false)}
              >
                Cancelar
              </button>
            </form>
          )}

          {item.patientNotes && (
            <div className="patient-note-inline">Nota: {item.patientNotes}</div>
          )}
        </div>

        {/* Bloco 2: Procedimento Realizado */}
        <div className="card-session-block">
          <div className="session-service">{item.procedureService || item.lastService}</div>
          <div className="session-date-sub tabular">
            <Calendar size={12} />
            {item.procedureDate ? (
              <span>
                Realizado em <strong>{formatBrDate(item.procedureDate)}</strong>
              </span>
            ) : item.lastDate ? (
              <span>
                Registrado em <strong>{formatBrDate(item.lastDate)}</strong>
              </span>
            ) : (
              <span>
                Agendado para <strong>{formatBrDate(item.dueDate)}</strong>
              </span>
            )}
          </div>

          {item.lastObservation && (
            <div className="obs-pill">Obs: {item.lastObservation}</div>
          )}

          {item.lastNoShow && (
            <div>
              <span className="noshow-badge tabular">
                <AlertTriangle size={12} /> Faltou em {formatBrDate(item.lastNoShow.date)}
              </span>
            </div>
          )}
        </div>

        {/* Bloco 3: Caixinhas de Confirmação de Retorno (Uniforme para todos os procedimentos) */}
        <div className="card-returns-block">
          <div className="dual-check-card">
            {isCapilar && (
              <div
                className="capilar-protocol-bar"
                role="group"
                aria-label="Protocolo de retorno capilar do paciente"
              >
                <span className="capilar-protocol-label">Protocolo:</span>
                <div className="capilar-protocol-options">
                  {CAPILAR_INTERVAL_OPTIONS.map((days) => {
                    const isSelected = activeCapilarDays === days;
                    return (
                      <button
                        key={days}
                        type="button"
                        className={`capilar-protocol-btn tabular ${isSelected ? 'is-active' : ''}`}
                        onClick={() => handleSelectCapilarInterval(days)}
                        title={`Salvar protocolo de retorno de ${days} dias para ${item.patientName}`}
                      >
                        {isSelected && <Check size={12} />}
                        <span>{days} dias</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {hasTwoCheckboxes && (
              <button
                type="button"
                className={`return-check-row ${item.reviewDone ? 'is-checked' : 'is-unchecked'}`}
                onClick={handleToggleReviewDone}
                title={`Clique para marcar ou desmarcar ${item.firstReturnLabel || 'o 1º retorno'} como feito`}
              >
                <span className="return-check-main">
                  {item.reviewDone ? <CheckSquare size={17} /> : <Square size={17} />}
                  <span className="return-check-title">
                    {item.firstReturnLabel || 'Retorno 15 dias'}
                  </span>
                </span>
                <span className="return-check-meta tabular">
                  <span className="return-check-date">
                    {formatBrDate(item.reviewCompletedDate || item.reviewDueDate)}
                  </span>
                  <span className={`return-check-status ${firstStatusClass}`}>
                    {firstStatusText}
                  </span>
                </span>
              </button>
            )}

            <button
              type="button"
              className={`return-check-row ${item.renewalDone ? 'is-checked' : 'is-unchecked'}`}
              onClick={handleToggleRenewalDone}
              title={`Clique para marcar ou desmarcar ${item.secondReturnLabel || 'o retorno'} como feito`}
            >
              <span className="return-check-main">
                {item.renewalDone ? <CheckSquare size={17} /> : <Square size={17} />}
                <span className="return-check-title">
                  {item.secondReturnLabel || 'Retorno'}
                </span>
              </span>
              <span className="return-check-meta tabular">
                <span className="return-check-date">
                  {formatBrDate(item.renewalDueDate || item.dueDate)}
                </span>
                <span className={`return-check-status ${secondStatusClass}`}>
                  {secondStatusText}
                </span>
              </span>
            </button>
          </div>
        </div>

        {/* Bloco 4: Ações Rápidas */}
        <div className="card-actions-block">
          <div className="actions-cluster">
            <button
              type="button"
              className={`btn ${item.whatsappNumber ? 'btn-whatsapp' : 'btn-outline'} action-btn-primary`}
              onClick={handleWhatsappClick}
              title={
                item.whatsappNumber
                  ? 'Abrir conversa no WhatsApp com mensagem pronta'
                  : 'Cadastre o telefone para chamar no WhatsApp'
              }
            >
              {item.whatsappNumber ? <MessageCircle size={15} /> : <Phone size={14} />}
              <span>{item.whatsappNumber ? 'WhatsApp' : '+ Telefone'}</span>
            </button>

            {!item.archived && item.status !== 'agendado' && (
              <button
                type="button"
                className={`btn-ghost-sm action-btn-secondary ${item.contactedAt ? 'is-active' : ''}`}
                onClick={() =>
                  onUpdateState(item.patientId, item.categoryId, {
                    contacted: !item.contactedAt,
                    cycleDate: item.cycleKey || item.lastDate,
                  })
                }
                title={
                  item.contactedAt
                    ? 'Clique para desmarcar e voltar para a fila'
                    : 'Marcar que você já chamou o paciente no WhatsApp'
                }
              >
                <Check size={14} />
                <span>{item.contactedAt ? 'Chamado' : 'Já chamei'}</span>
              </button>
            )}

            {item.archived ? (
              <button
                type="button"
                className="btn-ghost-sm action-btn-secondary is-reactivate"
                onClick={handleReactivate}
                title="Voltar este paciente para a lista ativa de retornos"
              >
                <RotateCcw size={14} />
                <span>Voltar p/ lista</span>
              </button>
            ) : (
              <button
                type="button"
                className={`btn-ghost-sm action-btn-secondary is-stop-trigger ${
                  showStopMenu ? 'is-open' : ''
                }`}
                onClick={() => setShowStopMenu((v) => !v)}
                title="Marcar que o paciente parou o tratamento ou não vai voltar"
              >
                <UserX size={14} />
                <span>Não volta / Parou</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Painel rápido embutido no card para tirar o paciente da lista com 1 toque */}
      {showStopMenu && !item.archived && (
        <div className="stop-reason-picker" role="region" aria-label="Motivo para tirar da lista">
          <div className="stop-reason-header">
            <span>Tirar {item.patientName.split(' ')[0]} da lista de retornos:</span>
            <button
              type="button"
              className="stop-reason-close"
              onClick={() => setShowStopMenu(false)}
              aria-label="Cancelar"
            >
              <X size={14} /> Cancelar
            </button>
          </div>
          <div className="stop-reason-options">
            {STOP_REASONS.map((opt) => (
              <button
                key={opt.label}
                type="button"
                className={`stop-reason-btn ${opt.allCategories ? 'is-all-cats' : ''}`}
                onClick={() => handleSelectStopReason(opt)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </article>
  );
});

export default PatientRow;
