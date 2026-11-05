import crypto from 'node:crypto';
import db, { hashPasswordAsync, verifyPasswordAsync } from './db.js';
import { audit, listAudit } from './audit.js';

// ---------------------------------------------------------------------------
// Sessões no servidor
// O cookie leva um token aleatório de 32 bytes; o banco guarda apenas o SHA-256 dele.
// Assim cada sessão pode ser revogada individualmente (logout, troca de senha,
// usuário desativado) e um backup do banco não permite forjar login.
// ---------------------------------------------------------------------------

export const SESSION_COOKIE_NAME = 'dra_marina_session';
const SESSION_ABSOLUTE_MS = 7 * 24 * 60 * 60 * 1000; // validade máxima: 7 dias
const SESSION_IDLE_MS = Number(process.env.SESSION_IDLE_HOURS || 12) * 60 * 60 * 1000; // inatividade
const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 10;
const LEGACY_DEFAULT_PASSWORD = 'clinica2026';
const USERNAME_RE = /^[a-z0-9._-]{3,40}$/i;
const ROLES = new Set(['admin', 'recepcao']);

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

function buildSessionCookie(req, token, maxAgeSec) {
  const isSecure =
    req.secure ||
    Boolean(process.env.RAILWAY_PUBLIC_DOMAIN) ||
    process.env.NODE_ENV === 'production';
  const secureFlag = isSecure ? '; Secure' : '';
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAgeSec}; HttpOnly; SameSite=Lax${secureFlag}`;
}

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

function createSession(req, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  db.prepare(`
    INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at, expires_at, ip, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    hashToken(token),
    userId,
    new Date(now).toISOString(),
    new Date(now).toISOString(),
    new Date(now + SESSION_ABSOLUTE_MS).toISOString(),
    req.ip || null,
    String(req.headers['user-agent'] || '').slice(0, 200)
  );
  return token;
}

function getSession(req) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE_NAME];
  if (!token) return null;
  const tokenHash = hashToken(token);
  const row = db
    .prepare(`
      SELECT s.token_hash, s.last_seen_at, s.expires_at,
             u.id, u.username, u.display_name, u.role, u.active, u.must_change_password
      FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?
    `)
    .get(tokenHash);
  if (!row) return null;

  const now = Date.now();
  const expired =
    !row.active ||
    now > Date.parse(row.expires_at) ||
    now - Date.parse(row.last_seen_at) > SESSION_IDLE_MS;
  if (expired) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    return null;
  }
  if (now - Date.parse(row.last_seen_at) > SESSION_TOUCH_INTERVAL_MS) {
    db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?').run(
      new Date(now).toISOString(),
      tokenHash
    );
  }
  return {
    sessionHash: tokenHash,
    id: row.id,
    username: row.username,
    displayName: row.display_name || row.username,
    role: row.role,
    mustChangePassword: Boolean(row.must_change_password),
  };
}

export function purgeExpiredSessions() {
  const idleCutoff = new Date(Date.now() - SESSION_IDLE_MS).toISOString();
  db.prepare('DELETE FROM sessions WHERE expires_at < ? OR last_seen_at < ?').run(
    new Date().toISOString(),
    idleCutoff
  );
}

const publicUser = (u) => ({
  id: u.id,
  username: u.username,
  displayName: u.displayName ?? u.display_name ?? u.username,
  role: u.role,
  mustChangePassword: Boolean(u.mustChangePassword ?? u.must_change_password),
});

// ---------------------------------------------------------------------------
// Proteção contra força bruta: por IP e por conta (em memória, com limite de tamanho)
// ---------------------------------------------------------------------------

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS_PER_IP = 10;
const MAX_FAILS_PER_ACCOUNT = 5;
const MAX_TRACKED_KEYS = 5000;
const failsByIp = new Map();
const failsByAccount = new Map();

function pruneMap(map, now) {
  if (map.size < MAX_TRACKED_KEYS) return;
  for (const [k, v] of map) if (now >= v.resetAt) map.delete(k);
  if (map.size >= MAX_TRACKED_KEYS) map.clear(); // proteção contra crescimento ilimitado
}

function isBlocked(map, key, max, now) {
  const entry = map.get(key);
  if (!entry) return 0;
  if (now >= entry.resetAt) {
    map.delete(key);
    return 0;
  }
  return entry.count >= max ? Math.ceil((entry.resetAt - now) / 1000) : 0;
}

function bump(map, key, now) {
  pruneMap(map, now);
  const entry = map.get(key);
  if (!entry || now >= entry.resetAt) map.set(key, { count: 1, resetAt: now + WINDOW_MS });
  else entry.count += 1;
}

function tooManyAttempts(res, retryAfterSec) {
  res.setHeader('Retry-After', String(retryAfterSec));
  return res.status(429).json({
    error: {
      code: 'TOO_MANY_ATTEMPTS',
      message: `Muitas tentativas de acesso. Aguarde ${Math.ceil(retryAfterSec / 60)} minuto(s) e tente novamente.`,
    },
  });
}

function validateNewPassword(newPassword, username) {
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  if (newPassword.length > 200) return 'Senha longa demais.';
  if (newPassword === LEGACY_DEFAULT_PASSWORD) return 'Essa senha é pública e não pode ser usada.';
  if (username && newPassword.toLowerCase().includes(username.toLowerCase())) {
    return 'A senha não pode conter o nome de usuário.';
  }
  return null;
}

const badRequest = (res, code, message) => res.status(400).json({ error: { code, message } });

// Hash fixo para igualar o tempo de resposta quando o usuário não existe.
let dummyHashPromise = null;
const getDummyHash = () => (dummyHashPromise ||= hashPasswordAsync(crypto.randomBytes(16).toString('hex')));

// ---------------------------------------------------------------------------
// Middlewares
// ---------------------------------------------------------------------------

const PUBLIC_API_PATHS = new Set(['/health', '/auth/session', '/auth/login', '/auth/logout']);
const ALLOWED_WHILE_PASSWORD_CHANGE = new Set(['/auth/session', '/auth/logout', '/auth/password']);

/** CSRF (validação de Origin) + autenticação para todas as rotas /api. */
export function apiGuard(req, res, next) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const origin = req.headers.origin;
    const host = req.headers.host;
    if (origin && host) {
      let originHost = null;
      try {
        originHost = new URL(origin).host;
      } catch {
        // inválido
      }
      if (originHost !== host) {
        return res.status(403).json({
          error: { code: 'CSRF_ORIGIN_MISMATCH', message: 'Origem da requisição não autorizada.' },
        });
      }
    }
  }

  const session = getSession(req);
  if (session) req.authUser = session;
  if (PUBLIC_API_PATHS.has(req.path)) return next();

  if (!session) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Sessão expirada ou não autenticada. Faça login para acessar os dados.',
      },
    });
  }
  if (session.mustChangePassword && !ALLOWED_WHILE_PASSWORD_CHANGE.has(req.path)) {
    return res.status(403).json({
      error: {
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'Defina uma nova senha antes de continuar.',
      },
    });
  }
  next();
}

export function requireAdmin(req, res, next) {
  if (req.authUser?.role !== 'admin') {
    return res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'Apenas administradoras podem fazer isso.' },
    });
  }
  next();
}

// ---------------------------------------------------------------------------
// Rotas
// ---------------------------------------------------------------------------

export function registerAuthRoutes(app) {
  app.get('/api/auth/session', (req, res) => {
    if (!req.authUser) return res.json({ authenticated: false });
    res.json({ authenticated: true, username: req.authUser.username, user: publicUser(req.authUser) });
  });

  app.post('/api/auth/login', async (req, res, next) => {
    try {
      const now = Date.now();
      const ip = req.ip || 'unknown';
      const username = String(req.body?.username || '').trim().toLowerCase().slice(0, 60);
      const password = String(req.body?.password || '').slice(0, 200);

      const ipWait = isBlocked(failsByIp, ip, MAX_FAILS_PER_IP, now);
      if (ipWait) return tooManyAttempts(res, ipWait);
      const accountWait = username && isBlocked(failsByAccount, username, MAX_FAILS_PER_ACCOUNT, now);
      if (accountWait) return tooManyAttempts(res, accountWait);

      const user = username
        ? db.prepare('SELECT * FROM users WHERE username = ?').get(username)
        : null;
      const passwordOk = user
        ? await verifyPasswordAsync(password, user.password_hash)
        : (await verifyPasswordAsync(password, await getDummyHash()), false);

      if (!user || !user.active || !passwordOk) {
        bump(failsByIp, ip, now);
        if (username) bump(failsByAccount, username, now);
        audit(req, 'login_failed', { details: { username: username || null } });
        return res.status(401).json({
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Usuário ou senha incorretos. Verifique e tente novamente.',
          },
        });
      }

      failsByIp.delete(ip);
      failsByAccount.delete(username);
      const token = createSession(req, user.id);
      db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(new Date().toISOString(), user.id);
      res.setHeader('Set-Cookie', buildSessionCookie(req, token, SESSION_ABSOLUTE_MS / 1000));
      audit(req, 'login', { user });
      res.json({ ok: true, username: user.username, user: publicUser(user) });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    if (req.authUser) {
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(req.authUser.sessionHash);
      audit(req, 'logout');
    }
    res.setHeader('Set-Cookie', buildSessionCookie(req, '', 0));
    res.json({ ok: true });
  });

  // Troca da própria senha (também usada no primeiro acesso com senha temporária)
  app.put('/api/auth/password', async (req, res, next) => {
    try {
      const me = req.authUser;
      const currentPassword = String(req.body?.currentPassword || '');
      const newPassword = String(req.body?.newPassword || '');
      const row = db.prepare('SELECT * FROM users WHERE id = ?').get(me.id);

      const now = Date.now();
      const wait = isBlocked(failsByAccount, me.username.toLowerCase(), MAX_FAILS_PER_ACCOUNT, now);
      if (wait) return tooManyAttempts(res, wait);
      if (!(await verifyPasswordAsync(currentPassword, row.password_hash))) {
        bump(failsByAccount, me.username.toLowerCase(), now);
        audit(req, 'password_change_failed');
        return badRequest(res, 'WRONG_CURRENT_PASSWORD', 'A senha atual informada está incorreta.');
      }
      const problem = validateNewPassword(newPassword, me.username);
      if (problem) return badRequest(res, 'WEAK_PASSWORD', problem);
      if (newPassword === currentPassword) {
        return badRequest(res, 'SAME_PASSWORD', 'A nova senha deve ser diferente da atual.');
      }

      db.prepare(`
        UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?
      `).run(await hashPasswordAsync(newPassword), new Date().toISOString(), me.id);
      // Encerra as outras sessões dessa pessoa (outros aparelhos), mantém a atual.
      db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').run(me.id, me.sessionHash);
      audit(req, 'password_changed');
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // ---- Administração de usuários (somente admin) ----

  app.get('/api/admin/users', requireAdmin, (_req, res) => {
    const users = db
      .prepare(`
        SELECT id, username, display_name, role, active, must_change_password, created_at, last_login_at
        FROM users ORDER BY active DESC, username COLLATE NOCASE
      `)
      .all()
      .map((u) => ({
        id: u.id,
        username: u.username,
        displayName: u.display_name || u.username,
        role: u.role,
        active: Boolean(u.active),
        mustChangePassword: Boolean(u.must_change_password),
        createdAt: u.created_at,
        lastLoginAt: u.last_login_at,
      }));
    res.json({ users });
  });

  app.post('/api/admin/users', requireAdmin, async (req, res, next) => {
    try {
      const username = String(req.body?.username || '').trim().toLowerCase();
      const displayName = String(req.body?.displayName || '').trim().slice(0, 80) || username;
      const role = String(req.body?.role || 'recepcao');
      const temporaryPassword = String(req.body?.temporaryPassword || '');

      if (!USERNAME_RE.test(username)) {
        return badRequest(
          res,
          'INVALID_USERNAME',
          'Usuário deve ter de 3 a 40 caracteres: letras, números, ponto, hífen ou sublinhado.'
        );
      }
      if (!ROLES.has(role)) return badRequest(res, 'INVALID_ROLE', 'Perfil inválido.');
      const problem = validateNewPassword(temporaryPassword, username);
      if (problem) return badRequest(res, 'WEAK_PASSWORD', problem);
      if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) {
        return res.status(409).json({ error: { code: 'USERNAME_TAKEN', message: 'Esse usuário já existe.' } });
      }

      const nowIso = new Date().toISOString();
      const result = db
        .prepare(`
          INSERT INTO users (username, display_name, password_hash, role, must_change_password, created_at, updated_at)
          VALUES (?, ?, ?, ?, 1, ?, ?)
        `)
        .run(username, displayName, await hashPasswordAsync(temporaryPassword), role, nowIso, nowIso);
      audit(req, 'user_created', {
        targetType: 'user',
        targetId: Number(result.lastInsertRowid),
        details: { username, role },
      });
      res.status(201).json({ ok: true, id: Number(result.lastInsertRowid) });
    } catch (err) {
      next(err);
    }
  });

  app.patch('/api/admin/users/:id', requireAdmin, async (req, res, next) => {
    try {
      const userId = Number(req.params.id);
      const target = Number.isInteger(userId) ? db.prepare('SELECT * FROM users WHERE id = ?').get(userId) : null;
      if (!target) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Usuário não encontrado.' } });
      }
      const isSelf = target.id === req.authUser.id;
      const changes = [];
      const sets = [];
      const params = [];

      if (req.body?.displayName !== undefined) {
        const displayName = String(req.body.displayName || '').trim().slice(0, 80) || target.username;
        sets.push('display_name = ?');
        params.push(displayName);
        changes.push('displayName');
      }
      if (req.body?.role !== undefined && req.body.role !== target.role) {
        if (!ROLES.has(req.body.role)) return badRequest(res, 'INVALID_ROLE', 'Perfil inválido.');
        if (isSelf) return badRequest(res, 'SELF_CHANGE', 'Você não pode alterar o seu próprio perfil.');
        sets.push('role = ?');
        params.push(req.body.role);
        changes.push('role');
      }
      if (req.body?.active !== undefined && Boolean(req.body.active) !== Boolean(target.active)) {
        if (isSelf) return badRequest(res, 'SELF_CHANGE', 'Você não pode desativar a sua própria conta.');
        sets.push('active = ?');
        params.push(req.body.active ? 1 : 0);
        changes.push(req.body.active ? 'activated' : 'deactivated');
      }
      if (req.body?.temporaryPassword) {
        const temporaryPassword = String(req.body.temporaryPassword);
        const problem = validateNewPassword(temporaryPassword, target.username);
        if (problem) return badRequest(res, 'WEAK_PASSWORD', problem);
        sets.push('password_hash = ?', 'must_change_password = 1');
        params.push(await hashPasswordAsync(temporaryPassword));
        changes.push('passwordReset');
      }
      if (!sets.length) return res.json({ ok: true });

      sets.push('updated_at = ?');
      params.push(new Date().toISOString(), target.id);
      db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...params);

      // Desativação, troca de perfil ou senha redefinida: encerra as sessões dessa pessoa.
      if (changes.some((c) => ['role', 'deactivated', 'passwordReset'].includes(c))) {
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id);
      }
      audit(req, 'user_updated', {
        targetType: 'user',
        targetId: target.id,
        details: { username: target.username, changes, role: req.body?.role },
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/admin/audit', requireAdmin, (req, res) => {
    res.json({ entries: listAudit({ limit: req.query.limit, beforeId: req.query.before }) });
  });
}
