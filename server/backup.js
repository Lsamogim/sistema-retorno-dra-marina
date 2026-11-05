import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import db, { DATA_DIR } from './db.js';
import { getLocalTodayIso } from './returnEngine.js';

export const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const RETENTION = Math.max(1, Number(process.env.BACKUP_RETENTION_DAYS) || 14);
const ENC_MAGIC = Buffer.from('DMBK1');

/**
 * Gera uma cópia consistente do banco sem credenciais: sem sessões, sem hashes de senha
 * e sem o segredo legado. secure_delete + VACUUM garantem que os bytes apagados não
 * fiquem recuperáveis nas páginas livres do arquivo.
 */
export function createSanitizedSnapshot(destPath) {
  db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  db.prepare('VACUUM INTO ?').run(destPath);
  const snap = new DatabaseSync(destPath);
  try {
    snap.exec('PRAGMA journal_mode = DELETE;');
    snap.exec('PRAGMA secure_delete = ON;');
    snap.exec('DELETE FROM app_auth;');
    snap.exec('DELETE FROM sessions;');
    snap.exec("UPDATE users SET password_hash = '!';");
    snap.exec('VACUUM;');
  } finally {
    snap.close();
  }
}

export function tmpBackupPath() {
  return path.join(os.tmpdir(), `clinica-backup-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.sqlite`);
}

function encryptionKey() {
  const secret = process.env.BACKUP_ENCRYPTION_KEY;
  return secret ? deriveBackupKey(secret) : null;
}

/** Formato: "DMBK1" | iv (12 bytes) | tag GCM (16 bytes) | dados cifrados (AES-256-GCM). */
export function encryptBuffer(plain, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([ENC_MAGIC, iv, cipher.getAuthTag(), enc]);
}

export function decryptBuffer(data, key) {
  if (!data.subarray(0, ENC_MAGIC.length).equals(ENC_MAGIC)) throw new Error('Arquivo não é um backup cifrado.');
  const iv = data.subarray(5, 17);
  const tag = data.subarray(17, 33);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data.subarray(33)), decipher.final()]);
}

export function deriveBackupKey(secret) {
  return crypto.scryptSync(secret, 'dra-marina-backup-v1', 32);
}

/** Cria o backup do dia (se ainda não existir) e apaga os mais antigos que a retenção. */
export function runDailyBackupIfDue() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const today = getLocalTodayIso();
  const existing = fs.readdirSync(BACKUP_DIR).filter((f) => /^backup-\d{4}-\d{2}-\d{2}\.sqlite(\.enc)?$/.test(f));
  if (existing.some((f) => f.startsWith(`backup-${today}.`))) return null;

  const tmp = tmpBackupPath();
  try {
    createSanitizedSnapshot(tmp);
    const key = encryptionKey();
    const finalName = `backup-${today}.sqlite${key ? '.enc' : ''}`;
    const finalPath = path.join(BACKUP_DIR, finalName);
    if (key) {
      fs.writeFileSync(finalPath, encryptBuffer(fs.readFileSync(tmp), key), { mode: 0o600 });
    } else {
      fs.copyFileSync(tmp, finalPath);
    }

    const all = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => /^backup-\d{4}-\d{2}-\d{2}\.sqlite(\.enc)?$/.test(f))
      .sort();
    for (const old of all.slice(0, Math.max(0, all.length - RETENTION))) {
      fs.rmSync(path.join(BACKUP_DIR, old), { force: true });
    }
    console.log(`[Backup] Backup diário criado: ${finalName}${key ? ' (cifrado)' : ''}. Mantidos: ${Math.min(all.length, RETENTION)}.`);
    return finalPath;
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

export function startBackupScheduler() {
  if (process.env.DISABLE_AUTO_BACKUP === 'true') return;
  const tick = () => {
    try {
      runDailyBackupIfDue();
    } catch (err) {
      console.error('[Backup] Falha no backup automático:', err.message);
    }
  };
  setTimeout(tick, 60 * 1000).unref();
  setInterval(tick, 60 * 60 * 1000).unref();
}
