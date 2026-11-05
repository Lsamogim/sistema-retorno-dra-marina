import React, { useEffect, useState } from 'react';
import {
  X,
  MessageCircle,
  Save,
  GitMerge,
  UserX,
  RotateCcw,
  Square,
  CheckSquare,
  Check,
} from 'lucide-react';

const CAPILAR_INTERVAL_OPTIONS = [15, 21, 30];

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

function formatBrDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export default function PatientDrawer({
  item,
  category,
  allPatients,
  onClose,
  onSavePatient,
  onUpdateState,
  onMergePatient,
}) {
  const [displayName, setDisplayName] = useState(item.patientName);
  const [phoneManual, setPhoneManual] = useState(item.phone || '');
  const [notesManual, setNotesManual] = useState(item.patientNotes || '');
  const [customDueDate, setCustomDueDate] = useState(item.customDueDate || '');
  const [customMessage, setCustomMessage] = useState(item.whatsappMessage || '');
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [mergeFilter, setMergeFilter] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCustomMessage(item.whatsappMessage || '');
  }, [item.whatsappMessage]);

  const handleSaveDetails = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const saved = await onSavePatient(item.patientId, {
        displayName,
        phoneManual,
        notesManual,
      });
      if (!saved) return; // erro já exibido; manter a ficha aberta com o que foi digitado
      if ((customDueDate || '') !== (item.customDueDate || '')) {
        const dateSaved = await onUpdateState(item.patientId, item.categoryId, {
          customDueDate: customDueDate || null,
        });
        if (!dateSaved) return;
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleOpenCustomWhatsapp = () => {
    const digits = (phoneManual || '').replace(/\D/g, '');
    if (digits.length < 10) return;
    const waNum = digits.startsWith('55') && digits.length >= 12 ? digits : `55${digits}`;
    const url = `https://wa.me/${waNum}?text=${encodeURIComponent(customMessage)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleMerge = async () => {
    if (!mergeTargetId) return;
    const target = allPatients.find((p) => String(p.id) === String(mergeTargetId));
    if (!target) return;
    const confirmed = window.confirm(
      `Unificar "${item.patientName}" dentro de "${target.name}"?\nTodos os agendamentos passados e futuros passarão para "${target.name}".`
    );
    if (!confirmed) return;
    const merged = await onMergePatient(item.patientId, Number(mergeTargetId));
    if (merged) onClose();
  };

  const filteredMergeCandidates = allPatients
    .filter((p) => p.id !== item.patientId)
    .filter((p) =>
      mergeFilter.trim()
        ? p.name.toLowerCase().includes(mergeFilter.trim().toLowerCase())
        : true
    )
    .slice(0, 40);

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="panel-header">
          <div style={{ minWidth: 0 }}>
            <h2 style={{ wordBreak: 'break-word' }}>{item.patientName}</h2>
            <div style={{ fontSize: '12.5px', color: 'var(--ink-secondary)' }}>
              {category.name} — {item.totalSessions}{' '}
              {item.totalSessions === 1 ? 'atendimento registrado' : 'atendimentos registrados'}
            </div>
          </div>
          <button type="button" className="btn-ghost-sm" onClick={onClose} aria-label="Fechar ficha">
            <X size={16} />
          </button>
        </div>

        <div className="panel-body">
          <form id="patient-drawer-form" onSubmit={handleSaveDetails}>
            <div className="form-field">
              <label htmlFor="drawer-name">Nome do paciente</label>
              <input
                id="drawer-name"
                className="form-input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="drawer-phone">Telefone / WhatsApp (salvo no banco local)</label>
              <input
                id="drawer-phone"
                type="tel"
                inputMode="tel"
                className="form-input tabular"
                placeholder="(14) 99999-9999"
                value={phoneManual}
                onChange={(e) => setPhoneManual(e.target.value)}
              />
              {item.phoneHint && !phoneManual && (
                <button
                  type="button"
                  className="phone-hint-chip"
                  style={{ marginTop: 6 }}
                  onClick={() => setPhoneManual(item.phoneHint.phone)}
                >
                  Usar {item.phoneHint.phone} (de {item.phoneHint.sourceName})
                </button>
              )}
            </div>

            <div className="form-field">
              <label htmlFor="drawer-custom-due">
                Data personalizada do próximo retorno (padrão: {formatBrDate(item.dueDate)})
              </label>
              <div className="drawer-date-row">
                <input
                  id="drawer-custom-due"
                  type="date"
                  className="form-input tabular"
                  value={customDueDate}
                  onChange={(e) => setCustomDueDate(e.target.value)}
                />
                {customDueDate && (
                  <button
                    type="button"
                    className="btn-ghost-sm"
                    onClick={() => setCustomDueDate('')}
                  >
                    Cálculo automático
                  </button>
                )}
              </div>
            </div>

            <div className="form-field">
              <label htmlFor="drawer-notes">Anotação interna da recepção</label>
              <textarea
                id="drawer-notes"
                className="form-textarea"
                rows={2}
                placeholder="Ex: Prefere horários à tarde ou aos sábados..."
                value={notesManual}
                onChange={(e) => setNotesManual(e.target.value)}
              />
            </div>
          </form>

          {/* Controle clicável dos Retornos */}
          <div className="drawer-section-divider">
            <h3 style={{ fontSize: '13.5px', margin: '0 0 8px' }}>
              {item.categoryId === 'capilar'
                ? 'Protocolo de atendimento e confirmação de retorno (Capilar)'
                : `Confirmar retorno realizado (${category.shortName})`}
            </h3>
            <div className="dual-check-card">
              {item.categoryId === 'capilar' && (
                <div
                  className="capilar-protocol-bar"
                  role="group"
                  aria-label="Selecionar protocolo de retorno capilar"
                >
                  <span className="capilar-protocol-label">Protocolo:</span>
                  <div className="capilar-protocol-options">
                    {CAPILAR_INTERVAL_OPTIONS.map((days) => {
                      const isSelected = (item.effectiveIntervalDays || 15) === days;
                      return (
                        <button
                          key={days}
                          type="button"
                          className={`capilar-protocol-btn tabular ${isSelected ? 'is-active' : ''}`}
                          onClick={() =>
                            onUpdateState(
                              item.patientId,
                              item.categoryId,
                              { customIntervalDays: days },
                              { patientName: item.patientName, intervalDays: days }
                            )
                          }
                        >
                          {isSelected && <Check size={12} />}
                          <span>{days} dias</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {item.hasDualReturn && item.reviewDueDate && (
                <button
                  type="button"
                  className={`return-check-row ${item.reviewDone ? 'is-checked' : 'is-unchecked'}`}
                  onClick={() =>
                    onUpdateState(item.patientId, item.categoryId, {
                      reviewDone: {
                        done: !item.reviewDone,
                        anchorDate: item.anchorDate || item.procedureDate || item.lastDate,
                      },
                    })
                  }
                >
                  <span className="return-check-main">
                    {item.reviewDone ? <CheckSquare size={16} /> : <Square size={16} />}
                    <span className="return-check-title">
                      {item.firstReturnLabel || 'Retorno 15 dias'}
                    </span>
                  </span>
                  <span className="return-check-meta tabular">
                    <span className="return-check-date">
                      {formatBrDate(item.reviewCompletedDate || item.reviewDueDate)}
                    </span>
                    <span className={`return-check-status ${item.reviewDone ? 'done' : 'pending'}`}>
                      {item.reviewDone ? 'Feito' : 'Pendente'}
                    </span>
                  </span>
                </button>
              )}

              <button
                type="button"
                className={`return-check-row ${item.renewalDone ? 'is-checked' : 'is-unchecked'}`}
                onClick={() =>
                  onUpdateState(item.patientId, item.categoryId, {
                    renewalDone: {
                      done: !item.renewalDone,
                      anchorDate: item.anchorDate || item.procedureDate || item.lastDate,
                    },
                  })
                }
              >
                <span className="return-check-main">
                  {item.renewalDone ? <CheckSquare size={16} /> : <Square size={16} />}
                  <span className="return-check-title">
                    {item.secondReturnLabel || 'Retorno'}
                  </span>
                </span>
                <span className="return-check-meta tabular">
                  <span className="return-check-date">
                    {formatBrDate(item.renewalDueDate || item.dueDate)}
                  </span>
                  <span className={`return-check-status ${item.renewalDone ? 'done' : 'pending'}`}>
                    {item.renewalDone ? 'Feito' : 'Pendente'}
                  </span>
                </span>
              </button>
            </div>
          </div>

          {/* Envio de WhatsApp com mensagem ajustável */}
          <div className="drawer-section-divider">
            <div className="form-field" style={{ marginBottom: 10 }}>
              <div className="drawer-wpp-label-row">
                <label htmlFor="drawer-wpp-msg" style={{ marginBottom: 0 }}>
                  Mensagem de WhatsApp para este retorno
                </label>
                {item.hasDualReturn && item.reviewWhatsappMessage && item.renewalWhatsappMessage && (
                  <div className="drawer-wpp-template-switch">
                    <button
                      type="button"
                      className={`btn-ghost-sm ${
                        customMessage === item.reviewWhatsappMessage ? 'is-active' : ''
                      }`}
                      onClick={() => setCustomMessage(item.reviewWhatsappMessage)}
                    >
                      {item.firstReturnLabel || '15 dias'}
                    </button>
                    <button
                      type="button"
                      className={`btn-ghost-sm ${
                        customMessage === item.renewalWhatsappMessage ? 'is-active' : ''
                      }`}
                      onClick={() => setCustomMessage(item.renewalWhatsappMessage)}
                    >
                      {item.secondReturnLabel || '2º Retorno'}
                    </button>
                  </div>
                )}
              </div>
              <textarea
                id="drawer-wpp-msg"
                className="form-textarea"
                rows={3}
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
              />
            </div>
            <div className="drawer-wpp-actions">
              <button
                type="button"
                className="btn btn-whatsapp drawer-wpp-primary"
                disabled={(phoneManual || '').replace(/\D/g, '').length < 10}
                onClick={handleOpenCustomWhatsapp}
              >
                <MessageCircle size={15} />
                Abrir WhatsApp com esta mensagem
              </button>

              <button
                type="button"
                className="btn btn-outline"
                onClick={() =>
                  onUpdateState(item.patientId, item.categoryId, {
                    contacted: !item.contactedAt,
                    cycleDate: item.cycleKey || item.lastDate,
                  })
                }
              >
                {item.contactedAt ? 'Desmarcar chamado' : 'Marcar "Já chamei"'}
              </button>
            </div>
          </div>

          {/* Tirar paciente da lista / Não volta mais */}
          <div className="drawer-section-divider">
            <h3 style={{ fontSize: '13.5px', margin: '0 0 6px' }}>
              Paciente parou ou não vai voltar?
            </h3>
            {item.archived ? (
              <div className="drawer-stopped-banner">
                <span>
                  Fora da lista ativa: <strong>{item.archivedReason || 'Parou o tratamento'}</strong>
                </span>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() =>
                    onUpdateState(
                      item.patientId,
                      item.categoryId,
                      { archived: false },
                      { patientName: item.patientName, reactivated: true }
                    )
                  }
                >
                  <RotateCcw size={14} /> Voltar para a lista ativa
                </button>
              </div>
            ) : (
              <>
                <p style={{ fontSize: '12px', color: 'var(--ink-secondary)', margin: '0 0 8px' }}>
                  Escolha o motivo para tirar este paciente da fila de chamadas:
                </p>
                <div className="stop-reason-options">
                  {STOP_REASONS.map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
                      className={`stop-reason-btn ${opt.allCategories ? 'is-all-cats' : ''}`}
                      onClick={() =>
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
                        )
                      }
                    >
                      <UserX size={13} />
                      <span>{opt.label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Histórico completo na categoria */}
          <div className="drawer-section-divider">
            <h3 style={{ fontSize: '13.5px', margin: '0 0 10px' }}>
              Histórico em {category.name} ({item.history.length})
            </h3>
            <ul className="history-list">
              {item.history.map((ev) => (
                <li key={ev.id} className="history-item">
                  <div className="history-item-head">
                    <span className="tabular">
                      {formatBrDate(ev.appointment_date)}
                      {ev.time_slot ? ` · ${ev.time_slot}` : ''}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span
                        className={`history-kind-pill ${
                          ev.kind === 'review' ? 'is-review' : 'is-proc'
                        }`}
                      >
                        {ev.kind === 'review'
                          ? 'Retorno / Retoque'
                          : ev.kind === 'evaluation'
                          ? 'Avaliação'
                          : 'Procedimento'}
                      </span>
                      <span className="history-item-status">
                        {ev.situation && ev.situation !== '-' ? ev.situation : 'Realizado'}
                      </span>
                    </div>
                  </div>
                  <div style={{ fontSize: '13px', marginTop: 2, wordBreak: 'break-word' }}>
                    {ev.raw_service}
                  </div>
                  {ev.observation && (
                    <div className="obs-pill" style={{ marginTop: 5 }}>
                      Obs: {ev.observation}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Unificação de cadastros duplicados */}
          <div className="drawer-section-divider" style={{ marginBottom: 0 }}>
            <h3 style={{ fontSize: '13.5px', margin: '0 0 6px' }}>Unificar cadastro duplicado</h3>
            <p style={{ fontSize: '12px', color: 'var(--ink-secondary)', margin: '0 0 8px' }}>
              Se este paciente aparece com outro nome na planilha, unifique-o para juntar o histórico e o telefone.
            </p>
            <input
              type="text"
              className="form-input"
              placeholder="Filtrar paciente destino pelo nome..."
              value={mergeFilter}
              onChange={(e) => setMergeFilter(e.target.value)}
              style={{ marginBottom: 8 }}
            />
            <div className="drawer-merge-row">
              <select
                className="select-control drawer-merge-select"
                value={mergeTargetId}
                onChange={(e) => setMergeTargetId(e.target.value)}
              >
                <option value="">Selecionar cadastro principal...</option>
                {filteredMergeCandidates.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.phone ? `(${p.phone})` : '(sem telefone)'}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-outline"
                disabled={!mergeTargetId}
                onClick={handleMerge}
              >
                <GitMerge size={14} /> Unificar
              </button>
            </div>
          </div>
        </div>

        <div className="panel-footer">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Fechar
          </button>
          <button type="submit" form="patient-drawer-form" className="btn btn-clinical" disabled={saving}>
            <Save size={15} />
            {saving ? 'Salvando...' : 'Salvar ficha'}
          </button>
        </div>
      </div>
    </div>
  );
}
