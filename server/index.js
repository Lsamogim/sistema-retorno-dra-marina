import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db, { INITIAL_REPORT_PATH, REMOTE_URL_PATH, initDatabase } from './db.js';
import { apiGuard, purgeExpiredSessions, registerAuthRoutes, requireAdmin } from './auth.js';
import { audit } from './audit.js';
import { backupStatus, createSanitizedSnapshot, startBackupScheduler, tmpBackupPath } from './backup.js';
import { importReportBuffer, importReportFile } from './importer.js';
import { computeDashboardData, getLocalTodayIso } from './returnEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, '..', 'dist');
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_UPLOAD_EXTS = new Set(['.xlsx', '.xls', '.csv']);

function clampStr(val, maxLen) {
  if (typeof val !== 'string') return null;
  const trimmed = val.trim();
  return trimmed ? trimmed.slice(0, maxLen) : null;
}

function validIsoOrNull(val) {
  return typeof val === 'string' && ISO_DATE_RE.test(val) ? val : null;
}

initDatabase();

// Auto-importar a planilha inicial da Dra. Marina na primeira execução
const existingImports = db.prepare('SELECT COUNT(*) AS cnt FROM import_logs').get();
if ((!existingImports || existingImports.cnt === 0) && fs.existsSync(INITIAL_REPORT_PATH)) {
  try {
    const summary = importReportFile(INITIAL_REPORT_PATH, 'relatorio-dra-marina.xlsx');
    console.log(
      `[Bootstrap] Planilha inicial importada: ${summary.totalRows} linhas, ${summary.validEvents} procedimentos classificados, ${summary.newPatients} pacientes.`
    );
  } catch (err) {
    console.error('[Bootstrap] Erro ao importar planilha inicial:', err);
  }
}

const app = express();
app.disable('x-powered-by');
// Só confiar em X-Forwarded-For atrás de um proxy conhecido (Railway). Localmente o próprio
// cliente poderia forjar o cabeçalho e burlar o limite de tentativas de login.
if (process.env.RAILWAY_ENVIRONMENT || process.env.TRUST_PROXY) {
  app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);
}

// Cabeçalhos de segurança HTTP (CSP, HSTS, Anti-Clickjacking, NoSniff)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  );
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_UPLOAD_EXTS.has(ext)) {
      const err = new Error('Formato de arquivo não permitido. Envie apenas .xlsx, .xls ou .csv.');
      err.status = 400;
      err.expose = true;
      return cb(err);
    }
    cb(null, true);
  },
});

app.use(express.json({ limit: '512kb' }));

function getLocalNetworkUrls(port) {
  const nets = os.networkInterfaces();
  const urls = [];
  for (const list of Object.values(nets)) {
    if (!list) continue;
    for (const net of list) {
      if (net.family === 'IPv4' && !net.internal) {
        urls.push(`http://${net.address}:${port}`);
      }
    }
  }
  return urls;
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', date: getLocalTodayIso() });
});

// CSRF + sessão para tudo em /api (rotas públicas: health, session, login, logout)
app.use('/api', apiGuard);
registerAuthRoutes(app);

app.get('/api/server-info', (_req, res) => {
  const port = Number(process.env.PORT) || 3456;
  let remoteUrl = process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : null;
  if (!remoteUrl && fs.existsSync(REMOTE_URL_PATH)) {
    try {
      const txt = fs.readFileSync(REMOTE_URL_PATH, 'utf8').trim();
      if (txt.startsWith('https://')) remoteUrl = txt;
    } catch {
      // ignore
    }
  }
  res.json({
    localUrls: process.env.RAILWAY_PUBLIC_DOMAIN ? [] : getLocalNetworkUrls(port),
    remoteUrl,
  });
});

// Registrar acesso à lista de pacientes no máximo 1 vez a cada 30 min por sessão
const lastDashboardAudit = new Map();
function auditDashboardView(req) {
  const key = req.authUser?.sessionHash;
  if (!key) return;
  const now = Date.now();
  if (now - (lastDashboardAudit.get(key) || 0) < 30 * 60 * 1000) return;
  if (lastDashboardAudit.size > 2000) lastDashboardAudit.clear();
  lastDashboardAudit.set(key, now);
  audit(req, 'patients_list_viewed');
}

app.get('/api/dashboard', (req, res, next) => {
  try {
    const refDate =
      typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
        ? req.query.date
        : undefined;
    const data = computeDashboardData(refDate);
    auditDashboardView(req);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

app.post('/api/imports', upload.single('file'), (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: {
          code: 'MISSING_FILE',
          message: 'Selecione um arquivo .xlsx, .xls ou .csv exportado do aplicativo da Dra. Marina.',
        },
      });
    }
    const summary = importReportBuffer(req.file.buffer, req.file.originalname);
    audit(req, 'report_imported', {
      details: {
        filename: String(req.file.originalname || '').slice(0, 120),
        validEvents: summary.validEvents,
        newPatients: summary.newPatients,
        removedAppointments: summary.removedAppointments,
        cleanupSkipped: summary.cleanupSkipped,
      },
    });
    try {
      fs.writeFileSync(INITIAL_REPORT_PATH, req.file.buffer);
    } catch (_ignore) {
      // Ignorar caso não seja possível sobrescrever o arquivo de referência
    }
    const dashboard = computeDashboardData();
    res.status(201).json({ summary, dashboard });
  } catch (err) {
    next(err);
  }
});

app.patch('/api/patients/:id', (req, res, next) => {
  try {
    const patientId = Number(req.params.id);
    if (!Number.isInteger(patientId) || patientId <= 0) {
      return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Paciente inválido.' } });
    }

    const existing = db.prepare('SELECT * FROM patients WHERE id = ?').get(patientId);
    if (!existing) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Paciente não encontrado.' } });
    }

    const displayName = clampStr(req.body.displayName, 160) || existing.display_name;

    const phoneManual =
      req.body.phoneManual !== undefined
        ? clampStr(String(req.body.phoneManual || ''), 40)
        : existing.phone_manual;

    const notesManual =
      req.body.notesManual !== undefined
        ? clampStr(String(req.body.notesManual || ''), 1000)
        : existing.notes_manual;

    db.prepare(`
      UPDATE patients
      SET display_name = ?, phone_manual = ?, notes_manual = ?, updated_at = ?
      WHERE id = ?
    `).run(displayName, phoneManual, notesManual, new Date().toISOString(), patientId);

    const changedFields = [];
    if (displayName !== existing.display_name) changedFields.push('nome');
    if (phoneManual !== existing.phone_manual) changedFields.push('telefone');
    if (notesManual !== existing.notes_manual) changedFields.push('anotacao');
    audit(req, 'patient_updated', { targetType: 'patient', targetId: patientId, details: { fields: changedFields } });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.post('/api/patients/:id/merge', (req, res, next) => {
  try {
    const sourceId = Number(req.params.id);
    const targetId = Number(req.body.targetPatientId);

    if (
      !Number.isInteger(sourceId) ||
      !Number.isInteger(targetId) ||
      sourceId <= 0 ||
      targetId <= 0 ||
      sourceId === targetId
    ) {
      return res.status(400).json({
        error: { code: 'INVALID_MERGE', message: 'Selecione um paciente diferente para unificar.' },
      });
    }

    const source = db.prepare('SELECT * FROM patients WHERE id = ?').get(sourceId);
    const target = db.prepare('SELECT * FROM patients WHERE id = ?').get(targetId);
    if (!source || !target) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Paciente de origem ou destino não encontrado.' },
      });
    }

    if (target.merged_into_id) {
      return res.status(400).json({
        error: {
          code: 'TARGET_ALREADY_MERGED',
          message: 'O paciente de destino já foi unificado em outro cadastro.',
        },
      });
    }

    const nowIso = new Date().toISOString();
    db.exec('BEGIN');
    try {
      // Preservar telefone caso o destino esteja sem telefone
      if (!target.phone_manual && (source.phone_manual || source.phone_imported)) {
        const bestPhone = source.phone_manual || source.phone_imported;
        db.prepare(`
          UPDATE patients
          SET phone_imported = COALESCE(phone_imported, ?),
              updated_at = ?
          WHERE id = ?
        `).run(bestPhone, nowIso, targetId);
      }

      db.prepare('UPDATE appointments SET patient_id = ? WHERE patient_id = ?').run(targetId, sourceId);

      // Migrar estados de categorias que ainda não existam no paciente destino
      const sourceStates = db
        .prepare('SELECT * FROM patient_category_states WHERE patient_id = ?')
        .all(sourceId);
      const insertTargetState = db.prepare(`
        INSERT OR IGNORE INTO patient_category_states (
          patient_id, category_id, contacted_at, contacted_for_cycle_date,
          review_dismissed_for_date, review_status_override, renewal_done_for_date,
          archived, archived_reason, archived_at, custom_due_date, custom_interval_days
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const st of sourceStates) {
        insertTargetState.run(
          targetId,
          st.category_id,
          st.contacted_at,
          st.contacted_for_cycle_date,
          st.review_dismissed_for_date,
          st.review_status_override,
          st.renewal_done_for_date,
          st.archived,
          st.archived_reason,
          st.archived_at,
          st.custom_due_date,
          st.custom_interval_days ?? null
        );
      }
      db.prepare('DELETE FROM patient_category_states WHERE patient_id = ?').run(sourceId);

      db.prepare('UPDATE patients SET merged_into_id = ?, updated_at = ? WHERE id = ?').run(
        targetId,
        nowIso,
        sourceId
      );
      db.prepare('UPDATE patients SET merged_into_id = ? WHERE merged_into_id = ?').run(
        targetId,
        sourceId
      );

      db.exec('COMMIT');
    } catch (innerErr) {
      db.exec('ROLLBACK');
      throw innerErr;
    }

    audit(req, 'patients_merged', { targetType: 'patient', targetId: targetId, details: { mergedFrom: sourceId } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.patch('/api/patients/:id/categories/:categoryId', (req, res, next) => {
  try {
    const patientId = Number(req.params.id);
    const { categoryId } = req.params;

    if (!Number.isInteger(patientId) || patientId <= 0) {
      return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Paciente inválido.' } });
    }

    const patExists = db.prepare('SELECT 1 FROM patients WHERE id = ?').get(patientId);
    const catExists = db.prepare('SELECT 1 FROM categories WHERE id = ?').get(categoryId);
    if (!patExists || !catExists) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Paciente ou categoria não encontrados.' },
      });
    }

    const existing =
      db
        .prepare('SELECT * FROM patient_category_states WHERE patient_id = ? AND category_id = ?')
        .get(patientId, categoryId) || {};

    const nowIso = new Date().toISOString();

    let contactedAt = existing.contacted_at ?? null;
    let contactedForCycleDate = existing.contacted_for_cycle_date ?? null;
    if (typeof req.body.contacted === 'boolean') {
      if (req.body.contacted) {
        contactedAt = nowIso;
        contactedForCycleDate = clampStr(req.body.cycleDate, 60) || getLocalTodayIso();
      } else {
        contactedAt = null;
        contactedForCycleDate = null;
      }
    }

    let archived = existing.archived ?? 0;
    let archivedReason = existing.archived_reason ?? null;
    let archivedAt = existing.archived_at ?? null;
    if (typeof req.body.archived === 'boolean') {
      archived = req.body.archived ? 1 : 0;
      archivedReason = req.body.archived
        ? clampStr(req.body.archivedReason, 120) || 'Tratamento concluído'
        : null;
      archivedAt = req.body.archived ? nowIso : null;
    }

    let reviewDismissedForDate = existing.review_dismissed_for_date ?? null;
    let reviewStatusOverride = existing.review_status_override ?? null;

    if (req.body.reviewDone && typeof req.body.reviewDone === 'object') {
      const { done, anchorDate } = req.body.reviewDone;
      reviewDismissedForDate = validIsoOrNull(anchorDate) || getLocalTodayIso();
      reviewStatusOverride = done ? 'done' : 'pending';
    } else if (req.body.dismissReviewForDate !== undefined) {
      reviewDismissedForDate = validIsoOrNull(req.body.dismissReviewForDate);
      reviewStatusOverride = reviewDismissedForDate ? 'done' : null;
    }

    let renewalDoneForDate = existing.renewal_done_for_date ?? null;
    if (req.body.renewalDone && typeof req.body.renewalDone === 'object') {
      const { done, anchorDate } = req.body.renewalDone;
      renewalDoneForDate = done ? validIsoOrNull(anchorDate) || getLocalTodayIso() : null;
    }

    const customDueDate =
      req.body.customDueDate !== undefined
        ? validIsoOrNull(req.body.customDueDate)
        : existing.custom_due_date ?? null;

    let customIntervalDays = existing.custom_interval_days ?? null;
    if (req.body.customIntervalDays !== undefined) {
      const parsedInterval = Number(req.body.customIntervalDays);
      customIntervalDays =
        req.body.customIntervalDays === null || req.body.customIntervalDays === ''
          ? null
          : [15, 21, 30].includes(parsedInterval)
          ? parsedInterval
          : Number.isInteger(parsedInterval) && parsedInterval >= 1 && parsedInterval <= 730
          ? parsedInterval
          : null;
    }

    db.prepare(`
      INSERT INTO patient_category_states (
        patient_id, category_id, contacted_at, contacted_for_cycle_date,
        review_dismissed_for_date, review_status_override, renewal_done_for_date,
        archived, archived_reason, archived_at, custom_due_date, custom_interval_days
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(patient_id, category_id) DO UPDATE SET
        contacted_at = excluded.contacted_at,
        contacted_for_cycle_date = excluded.contacted_for_cycle_date,
        review_dismissed_for_date = excluded.review_dismissed_for_date,
        review_status_override = excluded.review_status_override,
        renewal_done_for_date = excluded.renewal_done_for_date,
        archived = excluded.archived,
        archived_reason = excluded.archived_reason,
        archived_at = excluded.archived_at,
        custom_due_date = excluded.custom_due_date,
        custom_interval_days = excluded.custom_interval_days
    `).run(
      patientId,
      categoryId,
      contactedAt,
      contactedForCycleDate,
      reviewDismissedForDate,
      reviewStatusOverride,
      renewalDoneForDate,
      archived,
      archivedReason,
      archivedAt,
      customDueDate,
      customIntervalDays
    );

    if (req.body.applyToAllCategories && typeof req.body.archived === 'boolean') {
      const allCats = db.prepare('SELECT id FROM categories').all();
      const upsertArchiveAll = db.prepare(`
        INSERT INTO patient_category_states (
          patient_id, category_id, archived, archived_reason, archived_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(patient_id, category_id) DO UPDATE SET
          archived = excluded.archived,
          archived_reason = excluded.archived_reason,
          archived_at = excluded.archived_at
      `);
      for (const c of allCats) {
        upsertArchiveAll.run(patientId, c.id, archived, archivedReason, archivedAt);
      }
    }

    audit(req, 'patient_return_updated', {
      targetType: 'patient',
      targetId: patientId,
      details: { category: categoryId, fields: Object.keys(req.body || {}).slice(0, 15) },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.put('/api/categories', requireAdmin, (req, res, next) => {
  try {
    const list = Array.isArray(req.body.categories) ? req.body.categories : null;
    if (!list) {
      return res.status(400).json({
        error: { code: 'INVALID_PAYLOAD', message: 'Lista de categorias inválida.' },
      });
    }

    const updateStmt = db.prepare(`
      UPDATE categories
      SET recurrence_days = ?,
          review_days = ?,
          whatsapp_template = ?,
          review_whatsapp_template = ?
      WHERE id = ?
    `);

    db.exec('BEGIN');
    try {
      for (const item of list) {
        const recDays = Math.max(1, Math.min(730, Number(item.recurrenceDays) || 30));
        const parsedRev = Number(item.reviewDays);
        const revDays =
          item.reviewDays != null && item.reviewDays !== '' && Number.isFinite(parsedRev)
            ? Math.max(1, Math.min(180, parsedRev))
            : null;
        updateStmt.run(
          recDays,
          revDays,
          clampStr(item.whatsappTemplate, 1000) || '',
          clampStr(item.reviewWhatsappTemplate, 1000),
          String(item.id || '')
        );
      }
      db.exec('COMMIT');
    } catch (innerErr) {
      db.exec('ROLLBACK');
      throw innerErr;
    }

    audit(req, 'categories_updated', { details: { categories: list.map((c) => String(c.id || '')).slice(0, 20) } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.get('/api/backup', requireAdmin, (req, res, next) => {
  const tmpPath = tmpBackupPath();
  try {
    createSanitizedSnapshot(tmpPath);
    audit(req, 'backup_downloaded');
    const filename = `backup-retornos-dra-marina-${getLocalTodayIso()}.sqlite`;
    res.download(tmpPath, filename, () => {
      fs.rmSync(tmpPath, { force: true });
    });
  } catch (err) {
    fs.rmSync(tmpPath, { force: true });
    next(err);
  }
});

app.get('/api/admin/backup-status', requireAdmin, (_req, res) => {
  res.json(backupStatus());
});

app.use('/api', (_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Rota não encontrada.' } });
});

// Servir frontend estático compilado em produção local
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get('/{*splat}', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

app.use((err, req, res, _next) => {
  let statusCode = Number(err.status || err.statusCode) || 500;
  let message = err.expose && err.message ? err.message : 'Erro interno ao processar a solicitação.';
  if (err.name === 'MulterError') {
    statusCode = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'Arquivo grande demais (máximo 8 MB).' : 'Envio de arquivo inválido.';
  } else if (err.type === 'entity.too.large') {
    message = 'Dados enviados grandes demais.';
  } else if (err.type === 'entity.parse.failed') {
    message = 'Dados enviados em formato inválido.';
  }
  // Nunca registrar o corpo da requisição (pode conter senha ou dados de pacientes).
  console.error(
    `[API Error] ${req.method} ${req.path} -> ${statusCode} ${err.name || 'Error'}: ${err.type || err.code || ''} ${
      statusCode >= 500 ? err.stack || err.message : err.message
    }`
  );
  res.status(statusCode).json({
    error: {
      code: statusCode === 400 ? 'BAD_REQUEST' : statusCode === 413 ? 'PAYLOAD_TOO_LARGE' : 'INTERNAL_ERROR',
      message,
    },
  });
});

purgeExpiredSessions();
setInterval(purgeExpiredSessions, 60 * 60 * 1000).unref();
startBackupScheduler();

const PORT = Number(process.env.PORT) || 3456;
app.listen(PORT, '0.0.0.0', () => {
  const localUrls = getLocalNetworkUrls(PORT);
  console.log(`Servidor Dra. Marina Retornos rodando em http://localhost:${PORT}`);
  if (localUrls.length) {
    console.log(`Acesso na mesma rede Wi-Fi: ${localUrls.join(' | ')}`);
  }
});
