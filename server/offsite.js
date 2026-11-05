import fs from 'node:fs';
import path from 'node:path';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

// Cópia externa dos backups em qualquer armazenamento compatível com S3
// (Cloudflare R2, Backblaze B2, AWS S3...). Regra: dado de saúde só sai cifrado.
// Variáveis:
//   BACKUP_S3_BUCKET, BACKUP_S3_ACCESS_KEY_ID, BACKUP_S3_SECRET_ACCESS_KEY  (obrigatórias)
//   BACKUP_S3_ENDPOINT  (R2/B2: URL do endpoint S3; AWS: deixar vazio)
//   BACKUP_S3_REGION    (padrão "auto"; AWS São Paulo: "sa-east-1")
//   BACKUP_S3_PREFIX    (padrão "retornos-dra-marina/")
//   BACKUP_REMOTE_RETENTION_DAYS (padrão 30)
//   BACKUP_ENCRYPTION_KEY (obrigatória para enviar)

function config() {
  const env = process.env;
  return {
    bucket: env.BACKUP_S3_BUCKET || '',
    accessKeyId: env.BACKUP_S3_ACCESS_KEY_ID || '',
    secretAccessKey: env.BACKUP_S3_SECRET_ACCESS_KEY || '',
    endpoint: env.BACKUP_S3_ENDPOINT || undefined,
    region: env.BACKUP_S3_REGION || 'auto',
    prefix: env.BACKUP_S3_PREFIX ?? 'retornos-dra-marina/',
    retentionDays: Math.max(1, Number(env.BACKUP_REMOTE_RETENTION_DAYS) || 30),
  };
}

export function offsiteConfigured() {
  const c = config();
  return Boolean(c.bucket && c.accessKeyId && c.secretAccessKey);
}

let client = null;
let clientKey = '';
function getClient() {
  const c = config();
  const key = [c.endpoint, c.region, c.accessKeyId].join('|');
  if (!client || key !== clientKey) {
    client = new S3Client({
      region: c.region,
      endpoint: c.endpoint,
      forcePathStyle: Boolean(c.endpoint),
      credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
      // Compatibilidade com provedores S3 que não aceitam os checksums novos do SDK
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      maxAttempts: 3,
    });
    clientKey = key;
  }
  return client;
}

function statePath(backupDir) {
  return path.join(backupDir, 'offsite-state.json');
}

export function readOffsiteState(backupDir) {
  try {
    return JSON.parse(fs.readFileSync(statePath(backupDir), 'utf8'));
  } catch {
    return {};
  }
}

function writeOffsiteState(backupDir, patch) {
  const next = { ...readOffsiteState(backupDir), ...patch };
  fs.writeFileSync(statePath(backupDir), JSON.stringify(next, null, 2));
  return next;
}

/**
 * Envia o backup do dia (cifrado) se ainda não foi enviado.
 * `encrypt(buffer)` cifra o conteúdo; `oldDate` é a data cujo backup remoto deve ser apagado.
 */
export async function uploadBackupIfNeeded({ backupDir, localPath, dateIso, encrypt, hasKey, oldDate }) {
  if (!offsiteConfigured()) return { skipped: 'not_configured' };
  const state = readOffsiteState(backupDir);
  if (state.lastUploadDate === dateIso) return { skipped: 'already_uploaded' };

  if (!hasKey) {
    const msg = 'BACKUP_ENCRYPTION_KEY não definida: por segurança, nenhum backup é enviado para fora sem criptografia.';
    if (state.lastError !== msg) console.error(`[Backup externo] ${msg}`);
    writeOffsiteState(backupDir, { lastError: msg, lastErrorAt: new Date().toISOString() });
    return { skipped: 'no_encryption_key' };
  }

  const c = config();
  const raw = fs.readFileSync(localPath);
  const body = localPath.endsWith('.enc') ? raw : encrypt(raw);
  const remoteKey = `${c.prefix}backup-${dateIso}.sqlite.enc`;
  try {
    await getClient().send(
      new PutObjectCommand({
        Bucket: c.bucket,
        Key: remoteKey,
        Body: body,
        ContentType: 'application/octet-stream',
      })
    );
  } catch (err) {
    const msg = `Falha ao enviar ${remoteKey}: ${err.name || 'Erro'} ${err.message || ''}`.trim();
    console.error(`[Backup externo] ${msg}`);
    writeOffsiteState(backupDir, { lastError: msg, lastErrorAt: new Date().toISOString() });
    return { error: msg };
  }

  // Retenção remota: apaga o backup de N dias atrás (se existir). Falha aqui não é crítica.
  if (oldDate) {
    try {
      await getClient().send(
        new DeleteObjectCommand({ Bucket: c.bucket, Key: `${c.prefix}backup-${oldDate}.sqlite.enc` })
      );
    } catch (err) {
      console.warn(`[Backup externo] Não foi possível apagar backup antigo (${oldDate}): ${err.message}`);
    }
  }

  writeOffsiteState(backupDir, {
    lastUploadDate: dateIso,
    lastUploadAt: new Date().toISOString(),
    lastUploadKey: remoteKey,
    lastUploadBytes: body.length,
    lastError: null,
    lastErrorAt: null,
  });
  console.log(`[Backup externo] Enviado: ${remoteKey} (${Math.round(body.length / 1024)} KB, cifrado).`);
  return { uploaded: remoteKey };
}

export function offsiteRetentionDays() {
  return config().retentionDays;
}

export function offsitePublicConfig() {
  const c = config();
  return {
    configured: offsiteConfigured(),
    bucket: c.bucket || null,
    endpointHost: c.endpoint ? new URL(c.endpoint).host : c.bucket ? 's3.amazonaws.com' : null,
    region: c.region,
    prefix: c.prefix,
    retentionDays: c.retentionDays,
  };
}
