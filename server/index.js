import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db, {
  DB_PATH,
  INITIAL_REPORT_PATH,
  REMOTE_URL_PATH,
  initDatabase,
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
} from './db.js';
import { importReportBuffer, importReportFile } from './importer.js';
import { computeDashboardData, getLocalTodayIso } from './returnEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, '..', 'dist');

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
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

app.use(express.json({ limit: '2mb' }));

const SESSION_COOKIE_NAME = 'dra_marina_session';

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    out[k] = decodeURIComponent(v);
  }
  return out;
}

function getAuthenticatedUser(req) {
  const authRow = db.prepare('SELECT * FROM app_auth WHERE id = 1').get();
  if (!authRow) return null;

  let token = null;
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }
  if (!token) {
    const cookies = parseCookies(req.headers.cookie);
    token = cookies[SESSION_COOKIE_NAME] || null;
  }
  if (!token && typeof req.query.token === 'string') {
    token = req.query.token;
  }
  const username = verifySessionToken(token, authRow.token_secret);
  if (!username) return null;
  return authRow.username;
}

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

app.get('/api/auth/session', (req, res) => {
  const username = getAuthenticatedUser(req);
  if (!username) {
    return res.json({ authenticated: false });
  }
  res.json({ authenticated: true, username });
});

app.post('/api/auth/login', (req, res) => {
  const rawUser = String(req.body.username || '').trim().toLowerCase();
  const rawPass = String(req.body.password || '');

  const authRow = db.prepare('SELECT * FROM app_auth WHERE id = 1').get();
  if (!authRow) {
    return res.status(500).json({
      error: { code: 'AUTH_NOT_INITIALIZED', message: 'Autenticação não inicializada.' },
    });
  }

  const expectedUser = authRow.username.trim().toLowerCase();
  const isUserMatch = rawUser === expectedUser;
  const isPassMatch = verifyPassword(rawPass, authRow.password_hash);

  if (!isUserMatch || !isPassMatch) {
    return res.status(401).json({
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'Usuário ou senha incorretos. Verifique e tente novamente.',
      },
    });
  }

  const token = createSessionToken(authRow.username, authRow.token_secret);
  const maxAgeSec = 60 * 60 * 24 * 90; // 90 dias
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAgeSec}; HttpOnly; SameSite=Lax`
  );

  res.json({
    ok: true,
    username: authRow.username,
    token,
  });
});

app.post('/api/auth/logout', (_req, res) => {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`
  );
  res.json({ ok: true });
});

// Middleware de proteção para todas as demais rotas /api/*
app.use('/api', (req, res, next) => {
  if (
    req.path === '/health' ||
    req.path === '/auth/session' ||
    req.path === '/auth/login' ||
    req.path === '/auth/logout'
  ) {
    return next();
  }
  const username = getAuthenticatedUser(req);
  if (!username) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Sessão expirada ou não autenticada. Faça login para acessar os dados.',
      },
    });
  }
  req.authUser = username;
  next();
});

app.put('/api/auth/credentials', (req, res, next) => {
  try {
    const currentPassword = String(req.body.currentPassword || '');
    const newUsername = String(req.body.newUsername || '').trim();
    const newPassword = String(req.body.newPassword || '');

    const authRow = db.prepare('SELECT * FROM app_auth WHERE id = 1').get();
    if (!verifyPassword(currentPassword, authRow.password_hash)) {
      return res.status(400).json({
        error: {
          code: 'WRONG_CURRENT_PASSWORD',
          message: 'A senha atual informada está incorreta.',
        },
      });
    }

    const updatedUser = newUsername || authRow.username;
    const updatedHash = newPassword.length >= 4 ? hashPassword(newPassword) : authRow.password_hash;

    db.prepare(`
      UPDATE app_auth
      SET username = ?,
          password_hash = ?,
          updated_at = ?
      WHERE id = 1
    `).run(updatedUser, updatedHash, new Date().toISOString());

    const token = createSessionToken(updatedUser, authRow.token_secret);
    const maxAgeSec = 60 * 60 * 24 * 90;
    res.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAgeSec}; HttpOnly; SameSite=Lax`
    );

    res.json({ ok: true, username: updatedUser, token });
  } catch (err) {
    next(err);
  }
});

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

app.get('/api/dashboard', (req, res, next) => {
  try {
    const refDate =
      typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
        ? req.query.date
        : undefined;
    const data = computeDashboardData(refDate);
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

    const displayName =
      typeof req.body.displayName === 'string' && req.body.displayName.trim()
        ? req.body.displayName.trim()
        : existing.display_name;

    const phoneManual =
      req.body.phoneManual !== undefined
        ? req.body.phoneManual && String(req.body.phoneManual).trim()
          ? String(req.body.phoneManual).trim()
          : null
        : existing.phone_manual;

    const notesManual =
      req.body.notesManual !== undefined
        ? req.body.notesManual && String(req.body.notesManual).trim()
          ? String(req.body.notesManual).trim()
          : null
        : existing.notes_manual;

    db.prepare(`
      UPDATE patients
      SET display_name = ?, phone_manual = ?, notes_manual = ?, updated_at = ?
      WHERE id = ?
    `).run(displayName, phoneManual, notesManual, new Date().toISOString(), patientId);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.post('/api/patients/:id/merge', (req, res, next) => {
  try {
    const sourceId = Number(req.params.id);
    const targetId = Number(req.body.targetPatientId);

    if (!Number.isInteger(sourceId) || !Number.isInteger(targetId) || sourceId === targetId) {
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

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.patch('/api/patients/:id/categories/:categoryId', (req, res, next) => {
  try {
    const patientId = Number(req.params.id);
    const { categoryId } = req.params;

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
        contactedForCycleDate = req.body.cycleDate || getLocalTodayIso();
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
      archivedReason = req.body.archived ? req.body.archivedReason || 'Tratamento concluído' : null;
      archivedAt = req.body.archived ? nowIso : null;
    }

    let reviewDismissedForDate = existing.review_dismissed_for_date ?? null;
    let reviewStatusOverride = existing.review_status_override ?? null;

    if (req.body.reviewDone && typeof req.body.reviewDone === 'object') {
      const { done, anchorDate } = req.body.reviewDone;
      reviewDismissedForDate = anchorDate || getLocalTodayIso();
      reviewStatusOverride = done ? 'done' : 'pending';
    } else if (req.body.dismissReviewForDate !== undefined) {
      reviewDismissedForDate = req.body.dismissReviewForDate || null;
      reviewStatusOverride = req.body.dismissReviewForDate ? 'done' : null;
    }

    let renewalDoneForDate = existing.renewal_done_for_date ?? null;
    if (req.body.renewalDone && typeof req.body.renewalDone === 'object') {
      const { done, anchorDate } = req.body.renewalDone;
      renewalDoneForDate = done ? anchorDate || getLocalTodayIso() : null;
    }

    const customDueDate =
      req.body.customDueDate !== undefined
        ? req.body.customDueDate || null
        : existing.custom_due_date ?? null;

    let customIntervalDays = existing.custom_interval_days ?? null;
    if (req.body.customIntervalDays !== undefined) {
      const parsedInterval = Number(req.body.customIntervalDays);
      customIntervalDays =
        req.body.customIntervalDays === null || req.body.customIntervalDays === ''
          ? null
          : [15, 21, 30].includes(parsedInterval)
          ? parsedInterval
          : parsedInterval > 0
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

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.put('/api/categories', (req, res, next) => {
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
        const revDays =
          item.reviewDays != null && item.reviewDays !== ''
            ? Math.max(1, Math.min(180, Number(item.reviewDays)))
            : null;
        updateStmt.run(
          recDays,
          revDays,
          String(item.whatsappTemplate || '').trim(),
          item.reviewWhatsappTemplate ? String(item.reviewWhatsappTemplate).trim() : null,
          item.id
        );
      }
      db.exec('COMMIT');
    } catch (innerErr) {
      db.exec('ROLLBACK');
      throw innerErr;
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.get('/api/backup', (_req, res, next) => {
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    const filename = `backup-retornos-dra-marina-${getLocalTodayIso()}.sqlite`;
    res.download(DB_PATH, filename);
  } catch (err) {
    next(err);
  }
});

app.get('/api/sync-snapshot', (_req, res, next) => {
  try {
    res.json({
      categories: db.prepare('SELECT * FROM categories').all(),
      patients: db.prepare('SELECT * FROM patients').all(),
      appointments: db.prepare('SELECT * FROM appointments').all(),
      states: db.prepare('SELECT * FROM patient_category_states').all(),
      importLogs: db.prepare('SELECT * FROM import_logs').all(),
    });
  } catch (err) {
    next(err);
  }
});

app.post('/api/sync-snapshot', express.json({ limit: '25mb' }), (req, res, next) => {
  try {
    const { categories = [], patients = [], appointments = [], states = [], importLogs = [] } =
      req.body || {};

    db.exec('PRAGMA foreign_keys = OFF;');
    db.exec('BEGIN');
    try {
      const upsertCat = db.prepare(`
        INSERT OR REPLACE INTO categories (
          id, name, short_name, recurrence_days, review_days,
          whatsapp_template, review_whatsapp_template, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const c of categories) {
        upsertCat.run(
          c.id,
          c.name,
          c.short_name,
          c.recurrence_days,
          c.review_days ?? null,
          c.whatsapp_template,
          c.review_whatsapp_template ?? null,
          c.sort_order
        );
      }

      const upsertPat = db.prepare(`
        INSERT OR REPLACE INTO patients (
          id, normalized_key, display_name, phone_imported, phone_manual,
          notes_manual, merged_into_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const p of patients) {
        upsertPat.run(
          p.id,
          p.normalized_key,
          p.display_name,
          p.phone_imported ?? null,
          p.phone_manual ?? null,
          p.notes_manual ?? null,
          p.merged_into_id ?? null,
          p.created_at,
          p.updated_at
        );
      }

      const upsertAppt = db.prepare(`
        INSERT OR REPLACE INTO appointments (
          id, dedupe_hash, patient_id, category_id, kind,
          appointment_date, time_slot, raw_service, full_services_cell,
          situation, observation, price, professional
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const a of appointments) {
        upsertAppt.run(
          a.id,
          a.dedupe_hash,
          a.patient_id,
          a.category_id,
          a.kind,
          a.appointment_date,
          a.time_slot ?? null,
          a.raw_service,
          a.full_services_cell ?? null,
          a.situation ?? null,
          a.observation ?? null,
          a.price ?? null,
          a.professional ?? null
        );
      }

      const upsertState = db.prepare(`
        INSERT OR REPLACE INTO patient_category_states (
          patient_id, category_id, contacted_at, contacted_for_cycle_date,
          review_dismissed_for_date, review_status_override, renewal_done_for_date,
          archived, archived_reason, archived_at, custom_due_date, custom_interval_days
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const s of states) {
        upsertState.run(
          s.patient_id,
          s.category_id,
          s.contacted_at ?? null,
          s.contacted_for_cycle_date ?? null,
          s.review_dismissed_for_date ?? null,
          s.review_status_override ?? null,
          s.renewal_done_for_date ?? null,
          s.archived ?? 0,
          s.archived_reason ?? null,
          s.archived_at ?? null,
          s.custom_due_date ?? null,
          s.custom_interval_days ?? null
        );
      }

      const upsertLog = db.prepare(`
        INSERT OR REPLACE INTO import_logs (
          id, filename, imported_at, total_rows, valid_events, new_patients, unmapped_services_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const l of importLogs) {
        upsertLog.run(
          l.id,
          l.filename,
          l.imported_at,
          l.total_rows,
          l.valid_events,
          l.new_patients,
          l.unmapped_services_json ?? '{}'
        );
      }

      db.exec('COMMIT');
    } catch (innerErr) {
      db.exec('ROLLBACK');
      throw innerErr;
    } finally {
      db.exec('PRAGMA foreign_keys = ON;');
    }

    res.json({
      ok: true,
      importedPatients: patients.length,
      importedAppointments: appointments.length,
    });
  } catch (err) {
    next(err);
  }
});

// Servir frontend estático compilado em produção local
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get('/{*splat}', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

app.use((err, _req, res, _next) => {
  console.error('[API Error]', err);
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: err.message || 'Erro interno ao processar a solicitação.',
    },
  });
});

const PORT = Number(process.env.PORT) || 3456;
app.listen(PORT, '0.0.0.0', () => {
  const localUrls = getLocalNetworkUrls(PORT);
  console.log(`Servidor Dra. Marina Retornos rodando em http://localhost:${PORT}`);
  if (localUrls.length) {
    console.log(`Acesso na mesma rede Wi-Fi: ${localUrls.join(' | ')}`);
  }
});
