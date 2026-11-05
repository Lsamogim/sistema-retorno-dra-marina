import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// O banco e a planilha da pasta data/ do projeto contêm dados reais de pacientes:
// nunca podem ser copiados para outra pasta de dados sem pedido explícito.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'retornos-seed-'));
process.env.DATA_DIR = dir;
process.env.APP_PASSWORD = 'senha-teste-1234';
delete process.env.SEED_FROM_BUNDLE;
const { initDatabase, default: db } = await import('../db.js');
initDatabase();

after(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('pasta de dados nova não recebe cópia do banco nem da planilha do projeto', () => {
  assert.equal(fs.existsSync(path.join(dir, 'relatorio-dra-marina.xlsx')), false);
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM patients').get().c, 0);
});
