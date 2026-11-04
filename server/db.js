import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CATEGORIES } from './classifier.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUNDLE_DATA_DIR = path.resolve(__dirname, '..', 'data');
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : BUNDLE_DATA_DIR;

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

export function createSessionToken(username, secret) {
  const payload = Buffer.from(
    JSON.stringify({
      u: username,
      exp: Date.now() + 1000 * 60 * 60 * 24 * 14, // 14 dias
    })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySessionToken(token, secret) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.exp || Date.now() > data.exp) return null;
    return data.u || null;
  } catch {
    return null;
  }
}

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

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

  const existingAuth = db.prepare('SELECT * FROM app_auth WHERE id = 1').get();
  if (!existingAuth) {
    const defaultUser = process.env.APP_USER || 'dramarina';
    const defaultPass = process.env.APP_PASSWORD || 'clinica2026';
    const secret = crypto.randomBytes(32).toString('hex');
    db.prepare(`
      INSERT INTO app_auth (id, username, password_hash, token_secret, updated_at)
      VALUES (1, ?, ?, ?, ?)
    `).run(defaultUser, hashPassword(defaultPass), secret, new Date().toISOString());
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

  const capilarDefault = DEFAULT_CATEGORIES.find((c) => c.id === 'capilar');
  if (capilarDefault) {
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
}

export default db;
