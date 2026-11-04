import crypto from 'node:crypto';
import fs from 'node:fs';
import XLSX from 'xlsx';
import db from './db.js';
import {
  classifySingleService,
  cleanPhoneDigits,
  normalizePatientKey,
  normalizeText,
  splitServiceCell,
} from './classifier.js';

/**
 * Converte valores de data do relatório ("Sáb, 03/01/2026", "03/01/2026", "2026-01-03" ou serial Excel)
 * para formato ISO YYYY-MM-DD.
 */
export function parseReportDate(raw) {
  if (raw == null || raw === '') return null;

  if (typeof raw === 'number' && raw > 30000 && raw < 80000) {
    const parsed = XLSX.SSF.parse_date_code(raw);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      return `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }

  const text = String(raw).trim();
  const brMatch = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (brMatch) {
    const [, dd, mm, yyyy] = brMatch;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  return null;
}

const MAX_IMPORT_ROWS = 10000;

/**
 * Lê buffer de arquivo .xlsx / .xls / .csv tratando codificação UTF-8 ou Windows-1252 em CSVs brasileiros.
 */
function readSpreadsheetRows(buffer, filename = '') {
  const lower = filename.toLowerCase();
  const safeOpts = {
    raw: true,
    cellFormula: false,
    cellHTML: false,
    sheetRows: MAX_IMPORT_ROWS + 1,
  };
  let workbook;

  if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
    let text = buffer.toString('utf8');
    if (text.includes('\uFFFD')) {
      text = buffer.toString('latin1');
    }
    workbook = XLSX.read(text, { ...safeOpts, type: 'string' });
  } else {
    workbook = XLSX.read(buffer, { ...safeOpts, type: 'buffer' });
  }

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const sheet = workbook.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });
}

/**
 * Encontra valor de coluna tolerando pequenas variações de cabeçalho.
 */
function pickCol(row, candidates) {
  for (const key of Object.keys(row)) {
    const normKey = normalizeText(key);
    if (candidates.some((cand) => normKey === cand || normKey.startsWith(cand))) {
      return row[key];
    }
  }
  return null;
}

export function importReportFile(filePath, displayFilename) {
  const buffer = fs.readFileSync(filePath);
  return importReportBuffer(buffer, displayFilename || filePath.split(/[\\/]/).pop());
}

export function importReportBuffer(buffer, filename = 'relatorio.xlsx') {
  const rows = readSpreadsheetRows(buffer, filename);
  if (!rows.length) {
    throw new Error('A planilha selecionada está vazia ou não possui linhas válidas.');
  }

  const nowIso = new Date().toISOString();

  const findPatientByKey = db.prepare(
    'SELECT id, display_name, phone_imported, merged_into_id FROM patients WHERE normalized_key = ?'
  );
  const findPatientById = db.prepare(
    'SELECT id, display_name, phone_imported, merged_into_id FROM patients WHERE id = ?'
  );
  const insertPatient = db.prepare(`
    INSERT INTO patients (normalized_key, display_name, phone_imported, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  const updatePatientImportedPhone = db.prepare(`
    UPDATE patients
    SET phone_imported = COALESCE(?, phone_imported),
        updated_at = ?
    WHERE id = ?
  `);

  const upsertAppointment = db.prepare(`
    INSERT INTO appointments (
      dedupe_hash, patient_id, category_id, kind, appointment_date,
      time_slot, raw_service, full_services_cell, situation, observation, price, professional
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(dedupe_hash) DO UPDATE SET
      patient_id = excluded.patient_id,
      raw_service = excluded.raw_service,
      full_services_cell = excluded.full_services_cell,
      situation = excluded.situation,
      observation = COALESCE(excluded.observation, appointments.observation),
      price = COALESCE(excluded.price, appointments.price),
      professional = COALESCE(excluded.professional, appointments.professional)
  `);

  const findRecentDualProcedure = db.prepare(`
    SELECT category_id, appointment_date
    FROM appointments
    WHERE patient_id = ?
      AND category_id IN ('botox', 'preenchimento')
      AND kind = 'procedure'
      AND appointment_date <= ?
      AND (situation IS NULL OR LOWER(situation) NOT LIKE '%comparecimento%')
    ORDER BY appointment_date DESC
    LIMIT 4
  `);

  const insertImportLog = db.prepare(`
    INSERT INTO import_logs (
      filename, imported_at, total_rows, valid_events, new_patients, unmapped_services_json
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);

  let validEvents = 0;
  let newPatients = 0;
  const unmappedCounter = new Map();
  const deferredGenericReviews = [];
  const deferredTypedDualReviews = [];
  const seenHashes = new Set();
  let minImportedDate = null;
  let maxImportedDate = null;

  db.exec('BEGIN');
  try {
    for (const row of rows) {
      const rawClient = pickCol(row, ['cliente', 'paciente', 'nome']);
      const rawDate = pickCol(row, ['data']);
      const rawServices = pickCol(row, ['servico(s)', 'servicos', 'servico', 'procedimento']);

      if (!rawClient || !rawDate || !rawServices) continue;

      const appointmentDate = parseReportDate(rawDate);
      const clientName = String(rawClient).replace(/\s+/g, ' ').trim();
      const normKey = normalizePatientKey(clientName);
      if (!appointmentDate || !normKey) continue;

      if (!minImportedDate || appointmentDate < minImportedDate) minImportedDate = appointmentDate;
      if (!maxImportedDate || appointmentDate > maxImportedDate) maxImportedDate = appointmentDate;

      const rawPhone = pickCol(row, ['telefone', 'celular', 'whatsapp', 'fone']);
      const cleanPhone = rawPhone && cleanPhoneDigits(rawPhone).length >= 8 ? String(rawPhone).trim() : null;
      const timeSlot = pickCol(row, ['horario', 'hora']) ? String(pickCol(row, ['horario', 'hora'])).trim() : null;
      const situation = pickCol(row, ['situacao', 'status']) ? String(pickCol(row, ['situacao', 'status'])).trim() : '-';
      const observation = pickCol(row, ['observacao', 'obs']) ? String(pickCol(row, ['observacao', 'obs'])).trim() : null;
      const rawPrice = pickCol(row, ['preco', 'valor']);
      const price = rawPrice != null && rawPrice !== '' ? Number(String(rawPrice).replace(',', '.')) : null;
      const professional = pickCol(row, ['profissional']) ? String(pickCol(row, ['profissional'])).trim() : null;

      // Resolver ou criar paciente respeitando eventuais unificações (merged_into_id)
      let patient = findPatientByKey.get(normKey);
      if (!patient) {
        const res = insertPatient.run(normKey, clientName, cleanPhone, nowIso, nowIso);
        patient = { id: Number(res.lastInsertRowid), merged_into_id: null };
        newPatients += 1;
      } else {
        let targetId = patient.id;
        const visitedMergeIds = new Set([patient.id]);
        while (patient && patient.merged_into_id && !visitedMergeIds.has(patient.merged_into_id)) {
          visitedMergeIds.add(patient.merged_into_id);
          patient = findPatientById.get(patient.merged_into_id);
          if (patient) targetId = patient.id;
        }
        if (cleanPhone) {
          updatePatientImportedPhone.run(cleanPhone, nowIso, targetId);
        }
        patient = { id: targetId };
      }

      const fullCell = String(rawServices).trim();
      const serviceTokens = splitServiceCell(fullCell);

      // Agrupar tokens da mesma linha por (categoryId, kind) para evitar duplicidade na mesma sessão
      const rowGroupedEvents = new Map();

      for (const token of serviceTokens) {
        const classifiedList = classifySingleService(token);
        for (const item of classifiedList) {
          if (item.categoryId === '__unmapped__') {
            unmappedCounter.set(item.rawService, (unmappedCounter.get(item.rawService) || 0) + 1);
            continue;
          }

          if (item.categoryId === '__generic_review__') {
            deferredGenericReviews.push({
              normKey,
              patientId: patient.id,
              appointmentDate,
              timeSlot,
              rawService: item.rawService,
              fullCell,
              situation,
              observation,
              price,
              professional,
            });
            continue;
          }

          const groupKey = `${item.categoryId}|${item.kind}`;
          if (!rowGroupedEvents.has(groupKey)) {
            rowGroupedEvents.set(groupKey, {
              categoryId: item.categoryId,
              kind: item.kind,
              services: [],
            });
          }
          const grp = rowGroupedEvents.get(groupKey);
          if (!grp.services.some((s) => normalizeText(s) === normalizeText(item.rawService))) {
            grp.services.push(item.rawService);
          }
        }
      }

      for (const grp of rowGroupedEvents.values()) {
        const combinedService = grp.services.join(' + ');
        const hashSource = `${normKey}|${appointmentDate}|${timeSlot || ''}|${grp.categoryId}|${grp.kind}`;
        const dedupeHash = crypto.createHash('sha1').update(hashSource).digest('hex');
        seenHashes.add(dedupeHash);

        upsertAppointment.run(
          dedupeHash,
          patient.id,
          grp.categoryId,
          grp.kind,
          appointmentDate,
          timeSlot,
          combinedService,
          fullCell,
          situation,
          observation,
          Number.isFinite(price) ? price : null,
          professional
        );
        validEvents += 1;
      }
    }

    // Resolver "Retorno" genérico associando a Botox/Preenchimento recente do mesmo paciente (até 60 dias)
    for (const rev of deferredGenericReviews) {
      const recents = findRecentDualProcedure.all(rev.patientId, rev.appointmentDate);
      const matchedCategories = new Set();
      for (const rec of recents) {
        if (matchedCategories.has(rec.category_id)) continue;
        const diffDays =
          (new Date(`${rev.appointmentDate}T12:00:00Z`) - new Date(`${rec.appointment_date}T12:00:00Z`)) /
          86400000;
        if (diffDays >= 1 && diffDays <= 60) {
          matchedCategories.add(rec.category_id);
          const hashSource = `${rev.normKey}|${rev.appointmentDate}|${rev.timeSlot || ''}|${rec.category_id}|review`;
          const dedupeHash = crypto.createHash('sha1').update(hashSource).digest('hex');
          seenHashes.add(dedupeHash);
          upsertAppointment.run(
            dedupeHash,
            rev.patientId,
            rec.category_id,
            'review',
            rev.appointmentDate,
            rev.timeSlot,
            rev.rawService,
            rev.fullCell,
            rev.situation,
            rev.observation,
            Number.isFinite(rev.price) ? rev.price : null,
            rev.professional
          );
          validEvents += 1;
        }
      }
    }

    // Se for uma planilha completa de período (>= 50 linhas e janela <= 400 dias), remover agendamentos que saíram da agenda
    if (rows.length >= 50 && minImportedDate && maxImportedDate && seenHashes.size > 0) {
      const windowSpanDays =
        (new Date(`${maxImportedDate}T12:00:00Z`) - new Date(`${minImportedDate}T12:00:00Z`)) /
        86400000;
      if (windowSpanDays >= 0 && windowSpanDays <= 400) {
        const existingInWindow = db
          .prepare('SELECT id, dedupe_hash FROM appointments WHERE appointment_date >= ? AND appointment_date <= ?')
          .all(minImportedDate, maxImportedDate);
        const deleteById = db.prepare('DELETE FROM appointments WHERE id = ?');
        for (const appt of existingInWindow) {
          if (!seenHashes.has(appt.dedupe_hash)) {
            deleteById.run(appt.id);
          }
        }
      }
    }

    const unmappedObj = Object.fromEntries(unmappedCounter.entries());
    insertImportLog.run(
      filename,
      nowIso,
      rows.length,
      validEvents,
      newPatients,
      JSON.stringify(unmappedObj)
    );

    db.exec('COMMIT');
    return {
      filename,
      importedAt: nowIso,
      totalRows: rows.length,
      validEvents,
      newPatients,
      unmappedServices: unmappedObj,
    };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
