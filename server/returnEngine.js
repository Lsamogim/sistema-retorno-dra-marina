import db from './db.js';
import { cleanPhoneDigits, formatWhatsappNumber } from './classifier.js';

const STOPWORDS = new Set([
  'da', 'de', 'do', 'das', 'dos', 'e', 'filha', 'filho', 'mae', 'pai',
  'irma', 'irmao', 'esposa', 'marido', 'tia', 'prima', 'capilar',
  'depilacao', 'laser', 'botox', 'bernardino', 'piraju', 'avare', 'ipaussu',
]);

export { getLocalTodayIso, addDaysIso, diffDaysIso } from './dates.js';
import { getLocalTodayIso, addDaysIso, diffDaysIso } from './dates.js';
import { computeStage } from './stages.js';

export function formatBrDate(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

export function formatRecurrenceLabel(days) {
  const n = Number(days) || 0;
  if (n === 180) return '6 meses (180d)';
  if (n === 150) return '5 meses (150d)';
  if (n === 120) return '4 meses (120d)';
  if (n === 240) return '8 meses (240d)';
  if (n === 90) return '3 meses (90d)';
  if (n === 60) return '2 meses (60d)';
  if (n === 30) return '30 dias';
  return `${n} dias`;
}

export function formatShortCycle(days) {
  const n = Number(days) || 0;
  if (n === 180) return '6 meses';
  if (n === 150) return '5 meses';
  if (n === 120) return '4 meses';
  if (n === 240) return '8 meses';
  if (n === 90) return '3 meses';
  if (n === 60) return '2 meses';
  return `${n} dias`;
}

function isNoShow(situation) {
  if (!situation) return false;
  const s = situation.toLowerCase();
  return s.includes('não comparecimento') || s.includes('nao comparecimento') || s.includes('faltou');
}

function firstNameOf(fullName) {
  if (!fullName) return '';
  const clean = fullName.trim().split(/\s+/)[0] || '';
  return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
}

export function buildWhatsappMessage(
  template,
  { patientName, serviceName, categoryName, dueDate, intervalDays }
) {
  const first = firstNameOf(patientName);
  return (template || '')
    .replace(/\{nome\}/gi, first)
    .replace(/\{nome_completo\}/gi, patientName)
    .replace(/\{servico\}/gi, serviceName || categoryName)
    .replace(/\{procedimento\}/gi, categoryName)
    .replace(/\{dias_retorno\}/gi, String(intervalDays || ''))
    .replace(/\{data_retorno\}/gi, formatBrDate(dueDate));
}

function buildPhoneHintsMap(patients) {
  const withPhones = [];
  for (const p of patients) {
    const phone = p.phone_manual || p.phone_imported;
    if (phone && cleanPhoneDigits(phone).length >= 10) {
      const tokens = p.normalized_key
        .split(' ')
        .filter((t) => t.length >= 4 && !STOPWORDS.has(t));
      withPhones.push({ id: p.id, name: p.display_name, phone, tokens });
    }
  }

  const hints = new Map();
  for (const p of patients) {
    const phone = p.phone_manual || p.phone_imported;
    if (phone && cleanPhoneDigits(phone).length >= 10) continue;

    const myTokens = p.normalized_key
      .split(' ')
      .filter((t) => t.length >= 4 && !STOPWORDS.has(t));
    if (!myTokens.length) continue;

    let best = null;
    let bestScore = 0;
    for (const cand of withPhones) {
      if (cand.id === p.id) continue;
      const shared = myTokens.filter((t) => cand.tokens.includes(t));
      if (shared.length >= 2 && shared.length > bestScore) {
        bestScore = shared.length;
        best = {
          phone: cand.phone,
          sourceName: cand.name,
          sourcePatientId: cand.id,
        };
      }
    }
    if (best) {
      hints.set(p.id, best);
    }
  }
  return hints;
}

export function computeDashboardData(referenceDateIso) {
  const today = referenceDateIso || getLocalTodayIso();

  const categories = db
    .prepare('SELECT * FROM categories ORDER BY sort_order ASC')
    .all();

  const patients = db
    .prepare('SELECT * FROM patients WHERE merged_into_id IS NULL ORDER BY display_name ASC')
    .all();

  const appointments = db
    .prepare(`
      SELECT a.*
      FROM appointments a
      JOIN patients p ON p.id = a.patient_id
      WHERE p.merged_into_id IS NULL
      ORDER BY a.appointment_date ASC, a.id ASC
    `)
    .all();

  const states = db.prepare('SELECT * FROM patient_category_states').all();
  const lastImport = db
    .prepare('SELECT * FROM import_logs ORDER BY id DESC LIMIT 1')
    .get();

  const patientMap = new Map(patients.map((p) => [p.id, p]));
  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const stateMap = new Map(states.map((s) => [`${s.patient_id}:${s.category_id}`, s]));
  // Último atendimento real (qualquer tipo, sem faltas) por paciente/procedimento.
  const lastAttendedByKey = new Map();
  // Pausa vencida (archived_until no passado) = paciente de volta ao fluxo normal.
  const isEffectivelyArchived = (state) =>
    Boolean(state.archived) && !(state.archived_until && state.archived_until <= today);
  const phoneHints = buildPhoneHintsMap(patients);

  // Agrupar agendamentos por (patient_id, category_id)
  const grouped = new Map();
  for (const appt of appointments) {
    if (!categoryMap.has(appt.category_id)) continue;
    const key = `${appt.patient_id}:${appt.category_id}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(appt);
  }

  const itemsByCategory = Object.fromEntries(categories.map((c) => [c.id, []]));

  for (const [key, list] of grouped.entries()) {
    const [patientIdStr, categoryId] = key.split(':');
    const patientId = Number(patientIdStr);
    const patient = patientMap.get(patientId);
    const category = categoryMap.get(categoryId);
    if (!patient || !category) continue;

    const state = stateMap.get(key) || {};
    const isCapilar = category.id === 'capilar';
    const hasDualReturn = Boolean(category.review_days) && !isCapilar;
    const defaultCapilarDays = [15, 21, 30].includes(Number(category.recurrence_days))
      ? Number(category.recurrence_days)
      : 15;
    const customIntervalDays =
      isCapilar && [15, 21, 30].includes(Number(state.custom_interval_days))
        ? Number(state.custom_interval_days)
        : null;
    const effectiveIntervalDays = isCapilar
      ? customIntervalDays || defaultCapilarDays
      : category.recurrence_days;

    const firstReturnLabel = hasDualReturn ? `Retoque ${category.review_days} dias` : null;
    const secondReturnLabel = isCapilar
      ? `Retorno ${effectiveIntervalDays} dias`
      : `Retorno ${formatShortCycle(category.recurrence_days)}`;
    const reviewWindowDays =
      category.recurrence_days <= 45
        ? Math.floor(((category.review_days || 15) + category.recurrence_days) / 2)
        : 45;

    const pastCompleted = [];
    const futureScheduled = [];
    let lastNoShow = null;

    for (const ev of list) {
      if (isNoShow(ev.situation)) {
        lastNoShow = {
          date: ev.appointment_date,
          service: ev.raw_service,
          observation: ev.observation,
        };
        continue;
      }
      if (ev.appointment_date > today) {
        futureScheduled.push(ev);
      } else {
        pastCompleted.push(ev);
        lastAttendedByKey.set(key, ev.appointment_date);
      }
    }

    const nextScheduledEv = futureScheduled.length ? futureScheduled[0] : null;
    const nextScheduledReviewEv = futureScheduled.find((e) => e.kind === 'review') || null;

    // Se o paciente só tem agendamento futuro e nunca realizou antes
    if (!pastCompleted.length && nextScheduledEv) {
      const effectivePhone = patient.phone_manual || patient.phone_imported || null;
      const waNumber = formatWhatsappNumber(effectivePhone);
      const message = buildWhatsappMessage(category.whatsapp_template, {
        patientName: patient.display_name,
        serviceName: nextScheduledEv.raw_service,
        categoryName: category.name,
        dueDate: nextScheduledEv.appointment_date,
        intervalDays: effectiveIntervalDays,
      });

      const firstAnchor = nextScheduledEv.appointment_date;
      const isRenewalDone = state.renewal_done_for_date === firstAnchor;

      itemsByCategory[categoryId].push({
        patientId,
        categoryId,
        hasDualReturn,
        firstReturnLabel,
        secondReturnLabel,
        effectiveIntervalDays,
        customIntervalDays,
        anchorDate: firstAnchor,
        patientName: patient.display_name,
        phone: effectivePhone,
        isManualPhone: Boolean(patient.phone_manual),
        phoneHint: phoneHints.get(patientId) || null,
        patientNotes: patient.notes_manual || null,
        whatsappNumber: waNumber,
        whatsappMessage: message,
        reviewWhatsappMessage: null,
        renewalWhatsappMessage: message,
        status: isEffectivelyArchived(state) ? 'arquivado' : isRenewalDone ? 'em_dia' : 'agendado',
        cyclePhase: 'scheduled_first',
        cycleKey: `${nextScheduledEv.appointment_date}:scheduled_first`,
        cycleLabel: '1º Agendamento Futuro',
        lastDate: null,
        lastService: nextScheduledEv.raw_service,
        lastObservation: nextScheduledEv.observation || null,
        procedureDate: null,
        procedureService: null,
        impliedProcedureDate: null,
        reviewDueDate: null,
        renewalDueDate: nextScheduledEv.appointment_date,
        reviewState: null,
        reviewCompletedDate: null,
        reviewCompletedService: null,
        reviewScheduledDate: nextScheduledReviewEv ? nextScheduledReviewEv.appointment_date : null,
        dueDate: nextScheduledEv.appointment_date,
        daysUntilDue: diffDaysIso(nextScheduledEv.appointment_date, today),
        nextScheduled: {
          date: nextScheduledEv.appointment_date,
          timeSlot: nextScheduledEv.time_slot,
          service: nextScheduledEv.raw_service,
          situation: nextScheduledEv.situation,
          kind: nextScheduledEv.kind,
        },
        lastNoShow,
        totalSessions: 0,
        reviewDone: false,
        renewalDone: isRenewalDone,
        canDismissReview: false,
        contactedAt: state.contacted_at || null,
        archived: Boolean(state.archived),
        archivedReason: state.archived_reason || null,
        customDueDate: state.custom_due_date || null,
        history: list.slice().reverse(),
      });
      continue;
    }

    if (!pastCompleted.length) {
      // Caso raro: paciente só teve "Não comparecimento" e nenhum atendimento concluído
      if (!lastNoShow) continue;
      const effectivePhone = patient.phone_manual || patient.phone_imported || null;
      const waNumber = formatWhatsappNumber(effectivePhone);
      const message = buildWhatsappMessage(category.whatsapp_template, {
        patientName: patient.display_name,
        serviceName: lastNoShow.service,
        categoryName: category.name,
        dueDate: lastNoShow.date,
        intervalDays: effectiveIntervalDays,
      });
      const isContacted = Boolean(state.contacted_at);
      const isRenewalDone = state.renewal_done_for_date === lastNoShow.date;
      itemsByCategory[categoryId].push({
        patientId,
        categoryId,
        hasDualReturn,
        firstReturnLabel,
        secondReturnLabel,
        effectiveIntervalDays,
        customIntervalDays,
        anchorDate: lastNoShow.date,
        patientName: patient.display_name,
        phone: effectivePhone,
        isManualPhone: Boolean(patient.phone_manual),
        phoneHint: phoneHints.get(patientId) || null,
        patientNotes: patient.notes_manual || null,
        whatsappNumber: waNumber,
        whatsappMessage: message,
        reviewWhatsappMessage: null,
        renewalWhatsappMessage: message,
        status: isEffectivelyArchived(state)
          ? 'arquivado'
          : isRenewalDone
          ? 'em_dia'
          : isContacted
          ? 'aguardando'
          : 'atrasado',
        cyclePhase: 'no_show_recovery',
        cycleKey: `${lastNoShow.date}:no_show_recovery`,
        cycleLabel: 'Faltou (Reagendar)',
        lastDate: lastNoShow.date,
        lastService: lastNoShow.service,
        lastObservation: lastNoShow.observation || null,
        procedureDate: null,
        procedureService: null,
        impliedProcedureDate: null,
        reviewDueDate: null,
        renewalDueDate: lastNoShow.date,
        reviewState: null,
        reviewCompletedDate: null,
        reviewCompletedService: null,
        reviewScheduledDate: null,
        dueDate: lastNoShow.date,
        daysUntilDue: diffDaysIso(lastNoShow.date, today),
        nextScheduled: null,
        lastNoShow,
        totalSessions: 0,
        reviewDone: false,
        renewalDone: isRenewalDone,
        canDismissReview: false,
        contactedAt: state.contacted_at || null,
        archived: Boolean(state.archived),
        archivedReason: state.archived_reason || null,
        customDueDate: state.custom_due_date || null,
        history: list.slice().reverse(),
      });
      continue;
    }

    // Encontrar última sessão principal (procedure > evaluation) e última observação útil
    const proceduresOnly = pastCompleted.filter((e) => e.kind === 'procedure');
    const evaluationsOnly = pastCompleted.filter((e) => e.kind === 'evaluation');
    const reviewsOnly = pastCompleted.filter((e) => e.kind === 'review');

    const latestAny = pastCompleted[pastCompleted.length - 1];
    const latestWithObs = [...pastCompleted].reverse().find((e) => e.observation && e.observation.trim());

    let anchorDate;
    let lastDisplayEvent;
    let cyclePhase = 'renewal';
    let cycleLabel = `Retorno (${formatRecurrenceLabel(effectiveIntervalDays)})`;
    let dueDate;
    let activeTemplate = category.whatsapp_template;
    let reviewDone = false;
    let renewalDone = false;
    let canDismissReview = false;

    let procedureDate = null;
    let procedureService = null;
    let impliedProcedureDate = null;
    let reviewDueDate = null;
    let renewalDueDate = null;
    let reviewState = null;
    let reviewCompletedDate = null;
    let reviewCompletedService = null;
    let reviewScheduledDate = nextScheduledReviewEv ? nextScheduledReviewEv.appointment_date : null;

    if (proceduresOnly.length > 0) {
      const lastProc = proceduresOnly[proceduresOnly.length - 1];
      anchorDate = lastProc.appointment_date;
      lastDisplayEvent = lastProc;
      procedureDate = lastProc.appointment_date;
      procedureService = lastProc.raw_service;
      renewalDueDate = addDaysIso(lastProc.appointment_date, effectiveIntervalDays);
      renewalDone = state.renewal_done_for_date === anchorDate;

      if (hasDualReturn) {
        reviewDueDate = addDaysIso(lastProc.appointment_date, category.review_days);
        const reviewAfter = reviewsOnly.find((r) => r.appointment_date > lastProc.appointment_date);
        const hasManualReviewOverride = state.review_dismissed_for_date === anchorDate;
        const elapsedSinceProc = diffDaysIso(today, lastProc.appointment_date);
        const recLabel = formatRecurrenceLabel(effectiveIntervalDays);

        // Determinar se o 1º Retorno (15 dias) foi feito
        if (hasManualReviewOverride && state.review_status_override === 'pending') {
          reviewDone = false;
          reviewState = elapsedSinceProc <= reviewWindowDays ? 'pending' : 'not_recorded';
        } else if (hasManualReviewOverride) {
          reviewDone = true;
          reviewState = 'dismissed_manual';
          if (reviewAfter) {
            reviewCompletedDate = reviewAfter.appointment_date;
            reviewCompletedService = reviewAfter.raw_service;
          }
        } else if (reviewAfter) {
          reviewDone = true;
          reviewState = 'done_in_agenda';
          reviewCompletedDate = reviewAfter.appointment_date;
          reviewCompletedService = reviewAfter.raw_service;
        } else if (nextScheduledReviewEv) {
          reviewDone = false;
          reviewState = 'scheduled';
          reviewScheduledDate = nextScheduledReviewEv.appointment_date;
        } else if (elapsedSinceProc <= reviewWindowDays) {
          reviewDone = false;
          reviewState = 'pending';
        } else {
          reviewDone = false;
          reviewState = 'not_recorded';
        }

        canDismissReview = true;

        // Qual retorno governa o alerta ativo do cartão?
        if (!reviewDone && elapsedSinceProc <= reviewWindowDays) {
          cyclePhase = 'review';
          cycleLabel = firstReturnLabel;
          dueDate = reviewDueDate;
          activeTemplate = category.review_whatsapp_template || category.whatsapp_template;
        } else {
          cyclePhase = 'renewal';
          cycleLabel = `Retorno (${recLabel})`;
          dueDate = renewalDueDate;
          activeTemplate = category.whatsapp_template;
        }
      } else {
        dueDate = renewalDueDate;
      }
    } else if (reviewsOnly.length > 0) {
      // Paciente fez aplicação antes do início do relatório (ex: dez/2025) e retorno em 2026
      const lastRev = reviewsOnly[reviewsOnly.length - 1];
      const impliedAppDate = addDaysIso(lastRev.appointment_date, -(category.review_days || 15));
      anchorDate = lastRev.appointment_date;
      lastDisplayEvent = lastRev;
      impliedProcedureDate = impliedAppDate;
      const hasManualReviewOverride = state.review_dismissed_for_date === anchorDate;
      reviewDone = !(hasManualReviewOverride && state.review_status_override === 'pending');
      renewalDone = state.renewal_done_for_date === anchorDate;
      reviewState = reviewDone ? 'only_review_in_sheet' : 'not_recorded';
      reviewCompletedDate = reviewDone ? lastRev.appointment_date : null;
      reviewCompletedService = reviewDone ? lastRev.raw_service : null;
      reviewDueDate = lastRev.appointment_date;
      renewalDueDate = addDaysIso(impliedAppDate, effectiveIntervalDays);
      cyclePhase = 'renewal';
      cycleLabel = `Retorno (${formatRecurrenceLabel(effectiveIntervalDays)})`;
      dueDate = renewalDueDate;
    } else {
      // Apenas avaliação realizada até agora
      const lastEval = evaluationsOnly[evaluationsOnly.length - 1] || latestAny;
      anchorDate = lastEval.appointment_date;
      lastDisplayEvent = lastEval;
      const hasManualReviewOverride = state.review_dismissed_for_date === anchorDate;
      reviewDone = hasManualReviewOverride && state.review_status_override !== 'pending';
      renewalDone = state.renewal_done_for_date === anchorDate;
      if (hasDualReturn) {
        reviewDueDate = addDaysIso(lastEval.appointment_date, category.review_days);
        renewalDueDate = addDaysIso(lastEval.appointment_date, effectiveIntervalDays);
      } else {
        renewalDueDate = addDaysIso(
          lastEval.appointment_date,
          isCapilar ? effectiveIntervalDays : Math.min(effectiveIntervalDays, 15)
        );
      }
      cyclePhase = 'post_evaluation';
      cycleLabel = 'Pós-Avaliação';
      dueDate = reviewDueDate || renewalDueDate;
    }

    if (state.custom_due_date && state.custom_due_date > anchorDate) {
      dueDate = state.custom_due_date;
      renewalDueDate = state.custom_due_date;
      cycleLabel = 'Data personalizada';
    }

    const daysUntilDue = diffDaysIso(dueDate, today);
    const cycleKey = `${anchorDate}:${cyclePhase}`;

    // Verificar se o contato "Já chamei" pertence ao ciclo e fase atuais
    let isContactedForCurrentCycle = false;
    if (state.contacted_at) {
      if (state.contacted_for_cycle_date && state.contacted_for_cycle_date.includes(':')) {
        isContactedForCurrentCycle = state.contacted_for_cycle_date === cycleKey;
      } else if (!state.contacted_for_cycle_date || state.contacted_for_cycle_date >= latestAny.appointment_date) {
        isContactedForCurrentCycle = true;
      }
    }

    const activeMilestoneDone = cyclePhase === 'review' ? reviewDone : renewalDone;

    let status;
    if (isEffectivelyArchived(state)) {
      status = 'arquivado';
    } else if (activeMilestoneDone) {
      status = 'em_dia';
    } else if (nextScheduledEv) {
      status = 'agendado';
    } else if (isContactedForCurrentCycle) {
      status = 'aguardando';
    } else if (daysUntilDue < 0) {
      status = 'atrasado';
    } else if (daysUntilDue <= 5) {
      status = 'vencendo';
    } else {
      status = 'em_dia';
    }

    const effectivePhone = patient.phone_manual || patient.phone_imported || null;
    const waNumber = formatWhatsappNumber(effectivePhone);
    const serviceForMessage = procedureService || lastDisplayEvent.raw_service;

    const whatsappMessage = buildWhatsappMessage(activeTemplate, {
      patientName: patient.display_name,
      serviceName: serviceForMessage,
      categoryName: category.name,
      dueDate,
      intervalDays: effectiveIntervalDays,
    });

    const reviewWhatsappMessage = hasDualReturn
      ? buildWhatsappMessage(category.review_whatsapp_template || category.whatsapp_template, {
          patientName: patient.display_name,
          serviceName: serviceForMessage,
          categoryName: category.name,
          dueDate: reviewDueDate || dueDate,
          intervalDays: category.review_days,
        })
      : null;

    const renewalWhatsappMessage = buildWhatsappMessage(category.whatsapp_template, {
      patientName: patient.display_name,
      serviceName: serviceForMessage,
      categoryName: category.name,
      dueDate: renewalDueDate || dueDate,
      intervalDays: effectiveIntervalDays,
    });

    itemsByCategory[categoryId].push({
      patientId,
      categoryId,
      hasDualReturn,
      firstReturnLabel,
      secondReturnLabel,
      effectiveIntervalDays,
      customIntervalDays,
      anchorDate,
      patientName: patient.display_name,
      phone: effectivePhone,
      isManualPhone: Boolean(patient.phone_manual),
      phoneHint: phoneHints.get(patientId) || null,
      patientNotes: patient.notes_manual || null,
      whatsappNumber: waNumber,
      whatsappMessage,
      reviewWhatsappMessage,
      renewalWhatsappMessage,
      status,
      cyclePhase,
      cycleKey,
      cycleLabel,
      lastDate: lastDisplayEvent.appointment_date,
      lastService: lastDisplayEvent.raw_service,
      lastObservation:
        lastDisplayEvent.observation ||
        (latestWithObs ? latestWithObs.observation : null),
      procedureDate,
      procedureService,
      impliedProcedureDate,
      reviewDueDate,
      renewalDueDate,
      reviewState,
      reviewCompletedDate,
      reviewCompletedService,
      reviewScheduledDate,
      dueDate,
      daysUntilDue,
      nextScheduled: nextScheduledEv
        ? {
            date: nextScheduledEv.appointment_date,
            timeSlot: nextScheduledEv.time_slot,
            service: nextScheduledEv.raw_service,
            situation: nextScheduledEv.situation,
            kind: nextScheduledEv.kind,
          }
        : null,
      lastNoShow:
        lastNoShow && lastNoShow.date >= lastDisplayEvent.appointment_date
          ? lastNoShow
          : null,
      totalSessions: proceduresOnly.length || pastCompleted.length,
      reviewDone,
      renewalDone,
      canDismissReview,
      contactedAt: isContactedForCurrentCycle ? state.contacted_at : null,
      archived: Boolean(state.archived),
      archivedReason: state.archived_reason || null,
      customDueDate: state.custom_due_date || null,
      history: list.slice().reverse(),
    });
  }

  // Ordenar cada categoria por urgência (mais atrasados / vencendo primeiro)
  const statusWeight = {
    atrasado: 1,
    vencendo: 2,
    aguardando: 3,
    em_dia: 4,
    agendado: 5,
    arquivado: 6,
  };

  function emptyStatusBucket() {
    return {
      total: 0,
      atrasado: 0,
      vencendo: 0,
      aguardando: 0,
      agendado: 0,
      em_dia: 0,
      arquivado: 0,
      sem_telefone: 0,
      not_recorded_review: 0,
    };
  }

  // Etapa do fluxo de trabalho (Chamar, Aguardando, Agendados, Concluídos...) para cada item.
  const stageNow = referenceDateIso ? new Date(`${referenceDateIso}T15:00:00Z`) : new Date();
  const categoryNames = new Map(categories.map((c) => [c.id, c.name]));
  for (const list of Object.values(itemsByCategory)) {
    for (const item of list) {
      const state = stateMap.get(`${item.patientId}:${item.categoryId}`) || {};
      item.lastAttendedDate = lastAttendedByKey.get(`${item.patientId}:${item.categoryId}`) || null;
      const { stage, reason, attempt } = computeStage(item, state, stageNow);
      Object.assign(item, {
        stage,
        stageReason: reason,
        attempt,
        categoryName: categoryNames.get(item.categoryId) || item.categoryId,
        contactedAt: state.contacted_at || null,
        scheduledFor: state.scheduled_for || null,
        doneAt: state.done_at || null,
        contactAttempts: Number(state.contact_attempts) || 0,
        archivedUntil: state.archived_until || null,
        noShowAt: state.no_show_at || null,
      });
    }
  }

  const categorySummaries = categories.map((cat) => {
    const items = itemsByCategory[cat.id] || [];
    items.sort((a, b) => {
      const sw = (statusWeight[a.status] || 9) - (statusWeight[b.status] || 9);
      if (sw !== 0) return sw;
      if (a.status === 'atrasado') {
        // Pacientes cujo prazo venceu há poucos dias aparecem primeiro na rotina diária
        return b.daysUntilDue - a.daysUntilDue;
      }
      return a.daysUntilDue - b.daysUntilDue;
    });

    const counts = emptyStatusBucket();
    const reviewPhaseCounts = emptyStatusBucket();
    const renewalPhaseCounts = emptyStatusBucket();
    const intervalCounts = {
      15: emptyStatusBucket(),
      21: emptyStatusBucket(),
      30: emptyStatusBucket(),
    };

    for (const item of items) {
      counts.total += 1;
      counts[item.status] = (counts[item.status] || 0) + 1;
      if (!item.whatsappNumber && item.status !== 'arquivado') {
        counts.sem_telefone += 1;
      }
      if (item.reviewState === 'not_recorded' && item.status !== 'arquivado') {
        counts.not_recorded_review += 1;
      }

      const targetBucket = item.cyclePhase === 'review' ? reviewPhaseCounts : renewalPhaseCounts;
      targetBucket.total += 1;
      targetBucket[item.status] = (targetBucket[item.status] || 0) + 1;
      if (!item.whatsappNumber && item.status !== 'arquivado') {
        targetBucket.sem_telefone += 1;
      }
      if (item.reviewState === 'not_recorded' && item.status !== 'arquivado') {
        targetBucket.not_recorded_review += 1;
      }

      const iv = item.effectiveIntervalDays;
      if (intervalCounts[iv]) {
        intervalCounts[iv].total += 1;
        intervalCounts[iv][item.status] = (intervalCounts[iv][item.status] || 0) + 1;
      }
    }

    return {
      id: cat.id,
      name: cat.name,
      shortName: cat.short_name,
      recurrenceDays: cat.recurrence_days,
      reviewDays: cat.review_days,
      whatsappTemplate: cat.whatsapp_template,
      reviewWhatsappTemplate: cat.review_whatsapp_template,
      sortOrder: cat.sort_order,
      counts,
      phaseCounts: {
        review: reviewPhaseCounts,
        renewal: renewalPhaseCounts,
      },
      intervalCounts,
    };
  });

  const globalTotals = categorySummaries.reduce(
    (acc, c) => {
      acc.atrasado += c.counts.atrasado;
      acc.vencendo += c.counts.vencendo;
      acc.aguardando += c.counts.aguardando;
      acc.agendado += c.counts.agendado;
      acc.em_dia += c.counts.em_dia;
      acc.arquivado += c.counts.arquivado;
      return acc;
    },
    { atrasado: 0, vencendo: 0, aguardando: 0, agendado: 0, em_dia: 0, arquivado: 0 }
  );

  return {
    referenceDate: today,
    lastImport: lastImport
      ? {
          filename: lastImport.filename,
          importedAt: lastImport.imported_at,
          totalRows: lastImport.total_rows,
          validEvents: lastImport.valid_events,
          newPatients: lastImport.new_patients,
          unmappedServices: JSON.parse(lastImport.unmapped_services_json || '{}'),
        }
      : null,
    totalUniquePatients: patients.length,
    globalTotals,
    categories: categorySummaries,
    itemsByCategory,
    allPatients: patients.map((p) => ({
      id: p.id,
      name: p.display_name,
      phone: p.phone_manual || p.phone_imported || '',
    })),
  };
}

const TODAY_STAGES = ['chamar', 'aguardando', 'agendado', 'concluido'];
// Quem está atrasado há mais de 60 dias vai para um grupo à parte no fim da etapa Chamar:
// com o histórico acumulado, a lista do dia ficaria dominada por contatos antigos.
export const STALE_OVERDUE_DAYS = 60;
// Só o atraso puro vai para o grupo de antigos; 2ª tentativa, falta e confirmação ficam visíveis.
const isStale = (item) =>
  item.stage === 'chamar' && (item.stageReason ?? 'atrasado') === 'atrasado' && item.daysUntilDue < -STALE_OVERDUE_DAYS;
const TODAY_SORTERS = {
  chamar: (a, b) => {
    const sa = isStale(a);
    const sb = isStale(b);
    if (sa !== sb) return sa ? 1 : -1;
    return sa ? b.daysUntilDue - a.daysUntilDue : a.daysUntilDue - b.daysUntilDue;
  },
  aguardando: (a, b) => String(a.contactedAt || '').localeCompare(String(b.contactedAt || '')),
  agendado: (a, b) =>
    String(a.scheduledFor || a.nextScheduled?.date || '').localeCompare(String(b.scheduledFor || b.nextScheduled?.date || '')),
  concluido: (a, b) => String(b.doneAt || '').localeCompare(String(a.doneAt || '')),
};

/** Lista do dia: só os itens das 4 etapas, ordenados por etapa, com contadores. */
export function buildTodayData(dashboard) {
  const all = Object.values(dashboard.itemsByCategory).flat();
  const counts = { chamar: 0, chamarAntigos: 0, aguardando: 0, agendado: 0, concluido: 0 };
  const byStage = Object.fromEntries(TODAY_STAGES.map((s) => [s, []]));
  for (const item of all) {
    if (byStage[item.stage]) {
      const staleOverdue = isStale(item);
      byStage[item.stage].push({ ...item, staleOverdue });
      counts[staleOverdue ? 'chamarAntigos' : item.stage] += 1;
    }
  }
  return {
    referenceDate: dashboard.referenceDate,
    counts,
    categories: dashboard.categories.map((c) => ({ id: c.id, name: c.name, shortName: c.shortName })),
    items: TODAY_STAGES.flatMap((s) => byStage[s].sort(TODAY_SORTERS[s])),
  };
}
