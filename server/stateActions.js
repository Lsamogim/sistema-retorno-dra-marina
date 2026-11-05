import db from './db.js';
import { getLocalTodayIso } from './dates.js';

// Ações nomeadas do fluxo por etapas, com desfazer exato: cada ação devolve `before`
// (a linha completa de cada categoria afetada, ou {missing:true} se ela não existia).

const STATE_COLUMNS = [
  'contacted_at',
  'contacted_for_cycle_date',
  'review_dismissed_for_date',
  'review_status_override',
  'renewal_done_for_date',
  'archived',
  'archived_reason',
  'archived_at',
  'custom_due_date',
  'custom_interval_days',
  'scheduled_for',
  'done_at',
  'contact_attempts',
  'archived_until',
  'no_show_at',
];
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class ActionError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
    this.expose = true;
  }
}

function isValidIsoDate(value) {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

const shortText = (value, max) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null);

function getRow(patientId, categoryId) {
  return db
    .prepare('SELECT * FROM patient_category_states WHERE patient_id = ? AND category_id = ?')
    .get(patientId, categoryId);
}

function snapshot(patientId, categoryId) {
  const row = getRow(patientId, categoryId);
  return row ? { ...row } : { patient_id: patientId, category_id: categoryId, missing: true };
}

function writeRow(patientId, categoryId, values) {
  const cols = ['patient_id', 'category_id', ...STATE_COLUMNS];
  const placeholders = cols.map(() => '?').join(', ');
  const updates = STATE_COLUMNS.map((c) => `${c} = excluded.${c}`).join(', ');
  db.prepare(`
    INSERT INTO patient_category_states (${cols.join(', ')}) VALUES (${placeholders})
    ON CONFLICT(patient_id, category_id) DO UPDATE SET ${updates}
  `).run(patientId, categoryId, ...STATE_COLUMNS.map((c) => values[c] ?? null));
}

function patchRow(patientId, categoryId, patch) {
  const current = getRow(patientId, categoryId) || { archived: 0, contact_attempts: 0 };
  writeRow(patientId, categoryId, { ...current, ...patch });
}

function inTransaction(fn) {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/**
 * Aplica uma ação nomeada e devolve o estado anterior para desfazer.
 * @returns {{ before: object[] }}
 */
export function applyAction(patientId, categoryId, body, nowIso = new Date().toISOString()) {
  const today = getLocalTodayIso(new Date(nowIso));
  const action = body?.action;

  switch (action) {
    case 'contacted': {
      const before = [snapshot(patientId, categoryId)];
      const current = getRow(patientId, categoryId);
      patchRow(patientId, categoryId, {
        contacted_at: nowIso,
        contacted_for_cycle_date: shortText(body.cycleKey, 60) || today,
        contact_attempts: (Number(current?.contact_attempts) || 0) + 1,
        no_show_at: null,
      });
      return { before };
    }
    case 'scheduled': {
      if (!isValidIsoDate(body.date)) throw new ActionError('Data de agendamento inválida.');
      if (body.date < today) throw new ActionError('A data do agendamento não pode estar no passado.');
      const before = [snapshot(patientId, categoryId)];
      patchRow(patientId, categoryId, { scheduled_for: body.date, no_show_at: null });
      return { before };
    }
    case 'done': {
      if (!['review', 'renewal'].includes(body.milestone)) throw new ActionError('Etapa do retorno inválida.');
      const anchor = isValidIsoDate(body.anchorDate) ? body.anchorDate : today;
      const before = [snapshot(patientId, categoryId)];
      const milestonePatch =
        body.milestone === 'review'
          ? { review_dismissed_for_date: anchor, review_status_override: 'done' }
          : { renewal_done_for_date: anchor };
      patchRow(patientId, categoryId, {
        ...milestonePatch,
        done_at: nowIso,
        scheduled_for: null,
        contacted_at: null,
        contacted_for_cycle_date: null,
        contact_attempts: 0,
        no_show_at: null,
      });
      return { before };
    }
    case 'no_show': {
      const before = [snapshot(patientId, categoryId)];
      patchRow(patientId, categoryId, { scheduled_for: null, no_show_at: nowIso });
      return { before };
    }
    case 'archive': {
      if (body.until !== undefined && body.until !== null && !isValidIsoDate(body.until)) {
        throw new ActionError('Data de pausa inválida.');
      }
      const categories = body.allCategories
        ? db.prepare('SELECT id FROM categories').all().map((c) => c.id)
        : [categoryId];
      const patch = {
        archived: 1,
        archived_reason: shortText(body.reason, 120) || 'Não vai voltar',
        archived_at: nowIso,
        archived_until: body.until || null,
      };
      return inTransaction(() => {
        const before = categories.map((cid) => snapshot(patientId, cid));
        for (const cid of categories) patchRow(patientId, cid, patch);
        return { before };
      });
    }
    case 'unarchive': {
      const before = [snapshot(patientId, categoryId)];
      patchRow(patientId, categoryId, { archived: 0, archived_reason: null, archived_at: null, archived_until: null });
      return { before };
    }
    default:
      throw new ActionError('Ação desconhecida.');
  }
}

/** Restaura exatamente as linhas devolvidas por applyAction. */
export function restoreStates(patientId, before) {
  if (!Array.isArray(before) || !before.length) throw new ActionError('Nada para desfazer.');
  for (const rowBefore of before) {
    if (Number(rowBefore?.patient_id) !== Number(patientId) || typeof rowBefore?.category_id !== 'string') {
      throw new ActionError('Dados de desfazer inválidos.');
    }
  }
  inTransaction(() => {
    for (const rowBefore of before) {
      if (rowBefore.missing) {
        db.prepare('DELETE FROM patient_category_states WHERE patient_id = ? AND category_id = ?').run(
          patientId,
          rowBefore.category_id
        );
      } else {
        writeRow(patientId, rowBefore.category_id, rowBefore);
      }
    }
  });
}
