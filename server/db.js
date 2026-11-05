import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CATEGORIES } from './classifier.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUNDLE_DATA_DIR = path.resolve(__dirname, '..', 'data');
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : BUNDLE_DATA_DIR;

export const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const LEGACY_DEFAULT_PASSWORD = 'clinica2026';

// Em hospedagem na nuvem (Railway), sem DATA_DIR o banco fica no disco efêmero
// do container e é apagado a cada novo deploy.
if (process.env.RAILWAY_ENVIRONMENT && !process.env.DATA_DIR) {
  console.error('==========================================================');
  console.error('[Dados] ALERTA: DATA_DIR não definida no Railway.');
  console.error('[Dados] O banco está no disco temporário do container e será');
  console.error('[Dados] PERDIDO no próximo deploy. Monte um Volume (ex.: /data)');
  console.error('[Dados] e defina DATA_DIR=/data.');
  console.error('==========================================================');
}

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const DB_PATH = path.join(DATA_DIR, 'clinica-retorno.sqlite');
export const INITIAL_REPORT_PATH = path.join(DATA_DIR, 'relatorio-dra-marina.xlsx');
export const REMOTE_URL_PATH = path.join(DATA_DIR, 'remote-url.txt');

// Se estivermos rodando na nuvem com volume persistente montado em DATA_DIR (ex: /data),
// copiar o banco inicial e a planilha da pasta do código na primeira inicialização:
if (DATA_DIR !== BUNDLE_DATA_DIR) {
  const seedDb = path.join(BUNDLE_DATA_DIR, 'clinica-retorno.sqlite');
  const seedXlsx = path.join(BUNDLE_DATA_DIR, 'relatorio-dra-marina.xlsx');
  try {
    if (!fs.existsSync(DB_PATH) && fs.existsSync(seedDb)) {
      fs.copyFileSync(seedDb, DB_PATH);
      console.log('[Cloud Seed] Banco SQLite inicial copiado para o volume persistente:', DB_PATH);
    }
    if (!fs.existsSync(INITIAL_REPORT_PATH) && fs.existsSync(seedXlsx)) {
      fs.copyFileSync(seedXlsx, INITIAL_REPORT_PATH);
    }
  } catch (err) {
    console.error('[Cloud Seed] Aviso ao copiar dados iniciais:', err.message);
  }
}

export function hashPassword(plainPassword, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.scryptSync(String(plainPassword), salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(plainPassword, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, keyHex] = storedHash.split(':');
  const derived = crypto.scryptSync(String(plainPassword), salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

const scryptAsync = (password, salt, keylen) =>
  new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, (err, key) => (err ? reject(err) : resolve(key)));
  });

/** Versão assíncrona (não bloqueia o servidor durante o login). */
export async function verifyPasswordAsync(plainPassword, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, keyHex] = storedHash.split(':');
  const derived = await scryptAsync(String(plainPassword), salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export async function hashPasswordAsync(plainPassword) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await scryptAsync(String(plainPassword), salt, 64);
  return `${salt}:${derived.toString('hex')}`;
}

const db = new DatabaseSync(DB_PATH);
// Diário DELETE (e não WAL): o arquivo principal fica sempre completo, sem depender de
// arquivos -wal/-shm compartilhados entre o container antigo e o novo durante um deploy.
db.exec('PRAGMA busy_timeout = 5000;');
db.exec('PRAGMA journal_mode = DELETE;');
db.exec('PRAGMA foreign_keys = ON;');

/** Diagnóstico sem dados pessoais: arquivos da pasta de dados e quantidade de registros. */
function logStartupDiagnostics() {
  const listDir = (dir) => {
    try {
      return fs.readdirSync(dir).map((name) => {
        const st = fs.statSync(path.join(dir, name));
        return `${name} (${st.isDirectory() ? 'pasta' : `${st.size} bytes`}, ${st.mtime.toISOString()})`;
      });
    } catch (err) {
      return [`(erro ao listar: ${err.message})`];
    }
  };
  const count = (table) => {
    try {
      return db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c;
    } catch {
      return 'n/d';
    }
  };
  console.error('[Diagnóstico] DATA_DIR =', DATA_DIR, '| DB_PATH =', DB_PATH);
  console.error('[Diagnóstico] Arquivos em DATA_DIR:', JSON.stringify(listDir(DATA_DIR)));
  console.error('[Diagnóstico] Arquivos em backups:', JSON.stringify(listDir(path.join(DATA_DIR, 'backups'))));
  console.error(
    '[Diagnóstico] Registros:',
    JSON.stringify({
      patients: count('patients'),
      appointments: count('appointments'),
      states: count('patient_category_states'),
      import_logs: count('import_logs'),
      users: count('users'),
      audit_log: count('audit_log'),
      sessions: count('sessions'),
    })
  );
}

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      short_name TEXT NOT NULL,
      recurrence_days INTEGER NOT NULL,
      review_days INTEGER,
      whatsapp_template TEXT NOT NULL,
      review_whatsapp_template TEXT,
      sort_order INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      normalized_key TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      phone_imported TEXT,
      phone_manual TEXT,
      notes_manual TEXT,
      merged_into_id INTEGER REFERENCES patients(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dedupe_hash TEXT NOT NULL UNIQUE,
      patient_id INTEGER NOT NULL REFERENCES patients(id),
      category_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      appointment_date TEXT NOT NULL,
      time_slot TEXT,
      raw_service TEXT NOT NULL,
      full_services_cell TEXT,
      situation TEXT,
      observation TEXT,
      price REAL,
      professional TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_appointments_patient_cat
      ON appointments(patient_id, category_id, appointment_date);

    CREATE INDEX IF NOT EXISTS idx_appointments_category_date
      ON appointments(category_id, appointment_date);

    CREATE TABLE IF NOT EXISTS patient_category_states (
      patient_id INTEGER NOT NULL REFERENCES patients(id),
      category_id TEXT NOT NULL,
      contacted_at TEXT,
      contacted_for_cycle_date TEXT,
      review_dismissed_for_date TEXT,
      review_status_override TEXT,
      renewal_done_for_date TEXT,
      archived INTEGER NOT NULL DEFAULT 0,
      archived_reason TEXT,
      archived_at TEXT,
      custom_due_date TEXT,
      custom_interval_days INTEGER,
      PRIMARY KEY (patient_id, category_id)
    );

    CREATE TABLE IF NOT EXISTS import_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      imported_at TEXT NOT NULL,
      total_rows INTEGER NOT NULL,
      valid_events INTEGER NOT NULL,
      new_patients INTEGER NOT NULL,
      unmapped_services_json TEXT
    );

    CREATE TABLE IF NOT EXISTS app_auth (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      username TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      token_secret TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name TEXT,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'recepcao')),
      active INTEGER NOT NULL DEFAULT 1,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_login_at TEXT
    );

    -- Sessões no servidor: o cookie guarda um token aleatório; aqui fica só o hash dele.
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      ip TEXT,
      user_agent TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

    -- Trilha de auditoria (LGPD art. 37): quem fez o quê e quando. Sem conteúdo clínico.
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at TEXT NOT NULL,
      user_id INTEGER,
      username TEXT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      details_json TEXT,
      ip TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at);
  `);

  let userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  // Em produção, um banco sem usuárias é inesperado (pode ser o container anterior ainda
  // liberando o volume). Conferir de novo por alguns segundos antes de concluir.
  for (let attempt = 0; IS_PRODUCTION && userCount === 0 && attempt < 6; attempt++) {
    console.warn(`[Auth] Nenhuma usuária encontrada; conferindo de novo (${attempt + 1}/6)...`);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000);
    userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  }
  if (userCount === 0) {
    const nowIso = new Date().toISOString();
    const legacy = db.prepare('SELECT * FROM app_auth WHERE id = 1').get();
    if (legacy) {
      // Migração: a conta única antiga vira a primeira administradora (mesma senha).
      db.prepare(`
        INSERT INTO users (username, display_name, password_hash, role, created_at, updated_at)
        VALUES (?, ?, ?, 'admin', ?, ?)
      `).run(legacy.username, legacy.username, legacy.password_hash, nowIso, nowIso);
      console.log(`[Auth] Conta "${legacy.username}" migrada para o novo sistema de usuários (administradora).`);
    } else {
      const initialUser = process.env.APP_USER || 'dramarina';
      let initialPass = process.env.APP_PASSWORD;
      if (!initialPass) {
        if (IS_PRODUCTION) {
          logStartupDiagnostics();
          throw new Error(
            '[Auth] APP_PASSWORD não definida. Em produção a senha inicial é obrigatória ' +
              '(defina APP_PASSWORD nas variáveis de ambiente antes de iniciar).'
          );
        }
        // Modo local: gera senha aleatória e mostra apenas no console desta máquina.
        initialPass = crypto.randomBytes(9).toString('base64url');
        console.warn('==========================================================');
        console.warn(`[Auth] Primeiro acesso. Usuário: ${initialUser}`);
        console.warn(`[Auth] Senha inicial gerada: ${initialPass}`);
        console.warn('[Auth] Troque essa senha em Configurações após entrar.');
        console.warn('==========================================================');
      } else if (initialPass.length < 12) {
        console.warn('[Auth] Aviso: APP_PASSWORD tem menos de 12 caracteres. Use uma senha mais forte.');
      }
      db.prepare(`
        INSERT INTO users (username, display_name, password_hash, role, created_at, updated_at)
        VALUES (?, ?, ?, 'admin', ?, ?)
      `).run(initialUser, initialUser, hashPassword(initialPass), nowIso, nowIso);
    }
  }
  // O segredo de sessão antigo não é mais usado: apagar para não ficar no banco.
  db.exec('DELETE FROM app_auth;');

  const legacyPasswordUsers = db
    .prepare('SELECT username, password_hash FROM users WHERE active = 1')
    .all()
    .filter((u) => verifyPassword(LEGACY_DEFAULT_PASSWORD, u.password_hash))
    .map((u) => u.username);
  if (legacyPasswordUsers.length) {
    console.error('==========================================================');
    console.error('[Auth] ALERTA DE SEGURANÇA: a senha atual ainda é a senha padrão antiga,');
    console.error(`[Auth] que é pública (usuário: ${legacyPasswordUsers.join(', ')}). Troque imediatamente.`);
    console.error('==========================================================');
  }

  const insertCat = db.prepare(`
    INSERT OR IGNORE INTO categories (
      id, name, short_name, recurrence_days, review_days,
      whatsapp_template, review_whatsapp_template, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const cat of DEFAULT_CATEGORIES) {
    insertCat.run(
      cat.id,
      cat.name,
      cat.shortName,
      cat.recurrenceDays,
      cat.reviewDays,
      cat.whatsappTemplate,
      cat.reviewWhatsappTemplate,
      cat.sortOrder
    );
  }

  // Migrações seguras para controle individual dos 2 retornos
  const existingCols = db
    .prepare("PRAGMA table_info('patient_category_states')")
    .all()
    .map((c) => c.name);
  if (!existingCols.includes('review_status_override')) {
    db.exec('ALTER TABLE patient_category_states ADD COLUMN review_status_override TEXT;');
  }
  if (!existingCols.includes('renewal_done_for_date')) {
    db.exec('ALTER TABLE patient_category_states ADD COLUMN renewal_done_for_date TEXT;');
  }
  if (!existingCols.includes('custom_interval_days')) {
    db.exec('ALTER TABLE patient_category_states ADD COLUMN custom_interval_days INTEGER;');
  }

  // Atualizar padrões de Botox (15d retoque + 180d procedimento) e Preenchimento (15d retoque + 180d procedimento)
  const botoxDefault = DEFAULT_CATEGORIES.find((c) => c.id === 'botox');
  if (botoxDefault) {
    db.prepare(`
      UPDATE categories
      SET recurrence_days = ?,
          review_days = ?,
          whatsapp_template = ?,
          review_whatsapp_template = ?
      WHERE id = 'botox' AND recurrence_days = 120
    `).run(
      botoxDefault.recurrenceDays,
      botoxDefault.reviewDays,
      botoxDefault.whatsappTemplate,
      botoxDefault.reviewWhatsappTemplate
    );
  }

  const preenchDefault = DEFAULT_CATEGORIES.find((c) => c.id === 'preenchimento');
  if (preenchDefault) {
    db.prepare(`
      UPDATE categories
      SET recurrence_days = ?,
          review_days = ?,
          whatsapp_template = ?,
          review_whatsapp_template = ?
      WHERE id = 'preenchimento' AND recurrence_days = 240
    `).run(
      preenchDefault.recurrenceDays,
      preenchDefault.reviewDays,
      preenchDefault.whatsappTemplate,
      preenchDefault.reviewWhatsappTemplate
    );
  }

  // Migrações numeradas: cada uma roda uma única vez por banco (PRAGMA user_version).
  const schemaVersion = db.prepare('PRAGMA user_version').get().user_version;

  // v1: ajuste dos padrões do Capilar. Antes rodava a cada boot e apagava
  // as edições feitas pela equipe em Configurações.
  const capilarDefault = DEFAULT_CATEGORIES.find((c) => c.id === 'capilar');
  if (schemaVersion < 1 && capilarDefault) {
    db.prepare(`
      UPDATE categories
      SET recurrence_days = ?,
          review_days = NULL,
          whatsapp_template = ?,
          review_whatsapp_template = NULL
      WHERE id = 'capilar'
    `).run(
      capilarDefault.recurrenceDays,
      capilarDefault.whatsappTemplate
    );
  }
  if (schemaVersion < 1) {
    db.exec('PRAGMA user_version = 1;');
  }
}

export default db;
