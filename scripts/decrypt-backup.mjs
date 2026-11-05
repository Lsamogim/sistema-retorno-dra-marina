// Decifra um backup automático (.sqlite.enc) gerado com BACKUP_ENCRYPTION_KEY.
// Uso (a chave vem da variável de ambiente, nunca da linha de comando):
//   PowerShell:  $env:BACKUP_ENCRYPTION_KEY = '...'; node scripts/decrypt-backup.mjs backup-2026-11-05.sqlite.enc
//   Bash:        BACKUP_ENCRYPTION_KEY=... node scripts/decrypt-backup.mjs backup-2026-11-05.sqlite.enc
// Gera o arquivo .sqlite ao lado do original.
import crypto from 'node:crypto';
import fs from 'node:fs';

const [input] = process.argv.slice(2);
const secret = process.env.BACKUP_ENCRYPTION_KEY;
if (!input || !secret) {
  console.error('Uso: BACKUP_ENCRYPTION_KEY=... node scripts/decrypt-backup.mjs <arquivo.sqlite.enc>');
  process.exit(1);
}

const data = fs.readFileSync(input);
if (data.subarray(0, 5).toString() !== 'DMBK1') {
  console.error('Arquivo não é um backup cifrado do sistema.');
  process.exit(1);
}
const key = crypto.scryptSync(secret, 'dra-marina-backup-v1', 32);
const decipher = crypto.createDecipheriv('aes-256-gcm', key, data.subarray(5, 17));
decipher.setAuthTag(data.subarray(17, 33));
let plain;
try {
  plain = Buffer.concat([decipher.update(data.subarray(33)), decipher.final()]);
} catch {
  console.error('Não foi possível decifrar: chave incorreta ou arquivo corrompido.');
  process.exit(1);
}
const output = input.replace(/\.enc$/, '') || `${input}.sqlite`;
fs.writeFileSync(output, plain, { mode: 0o600 });
console.log(`Backup decifrado em: ${output}`);
