import db from './db.js';

// Trilha de auditoria (LGPD art. 37): registra quem fez o quê e quando.
// Nunca grava conteúdo clínico, telefones, observações ou senhas: só o tipo de ação,
// o alvo (ex.: id do paciente) e nomes de campos alterados.

let insertStmt = null;

function getInsertStmt() {
  if (!insertStmt) {
    insertStmt = db.prepare(`
      INSERT INTO audit_log (at, user_id, username, action, target_type, target_id, details_json, ip)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
  }
  return insertStmt;
}

export function audit(req, action, { targetType = null, targetId = null, details = null, user = null } = {}) {
  const actor = user || req?.authUser || null;
  try {
    getInsertStmt().run(
      new Date().toISOString(),
      actor?.id ?? null,
      actor?.username ?? null,
      action,
      targetType,
      targetId == null ? null : String(targetId),
      details ? JSON.stringify(details) : null,
      req?.ip || null
    );
  } catch (err) {
    // A auditoria nunca deve derrubar a operação principal.
    console.error('[Audit] Falha ao registrar ação:', action, err.message);
  }
}

export function listAudit({ limit = 100, beforeId = null } = {}) {
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100));
  const rows = beforeId
    ? db
        .prepare('SELECT * FROM audit_log WHERE id < ? ORDER BY id DESC LIMIT ?')
        .all(Number(beforeId), safeLimit)
    : db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').all(safeLimit);
  return rows.map((r) => ({
    id: r.id,
    at: r.at,
    userId: r.user_id,
    username: r.username,
    action: r.action,
    targetType: r.target_type,
    targetId: r.target_id,
    details: r.details_json ? JSON.parse(r.details_json) : null,
    ip: r.ip,
  }));
}
