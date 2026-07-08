// ─────────────────────────────────────────────────────────────
// Nalozi: opciona nadogradnja anonimnog identiteta (email + lozinka).
// Registracija NE menja userId — samo veže email/lozinku za postojeći
// identitet, pa sve dotadašnje partije automatski ostaju u istoriji.
// Prijava na drugom uređaju vraća isti userId + (deterministički) token.
// Nema email potvrde — samo provera da email nije već zauzet.
// ─────────────────────────────────────────────────────────────
import type {
  AccountResponse,
  LoginRequest,
  MeResponse,
  RegisterRequest,
  UpdateProfileRequest,
} from '../../src/protocol/messages.ts';
import { signToken } from './auth.ts';
import { HttpError, cleanName, json } from './http.ts';
import { hashPassword, verifyPassword } from './password.ts';

interface PlayerRow {
  user_id: string;
  display_name: string;
  email: string | null;
  password_hash: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanEmail(raw: unknown): string {
  const email = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    throw new HttpError(400, 'Unesi ispravan email');
  }
  return email;
}

function cleanPassword(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length < 8) {
    throw new HttpError(400, 'Lozinka mora imati bar 8 znakova');
  }
  if (raw.length > 100) throw new HttpError(400, 'Lozinka je predugačka (max 100)');
  return raw;
}

function getPlayer(env: Env, userId: string): Promise<PlayerRow | null> {
  return env.DB.prepare('SELECT user_id, display_name, email, password_hash FROM players WHERE user_id = ?')
    .bind(userId)
    .first<PlayerRow>();
}

async function emailTaken(env: Env, email: string, exceptUserId: string): Promise<boolean> {
  const row = await env.DB.prepare('SELECT user_id FROM players WHERE email = ?')
    .bind(email)
    .first<{ user_id: string }>();
  return row !== null && row.user_id !== exceptUserId;
}

/** UNIQUE constraint na players.email → 409 (sudar paralelnih registracija). */
function conflictAsHttp(e: unknown): never {
  if (e instanceof Error && e.message.includes('UNIQUE')) {
    throw new HttpError(409, 'Email je već registrovan');
  }
  throw e;
}

/** POST /api/auth/register — Bearer anonimni identitet + { email, password, displayName? }. */
export async function register(request: Request, env: Env, userId: string, body: RegisterRequest): Promise<Response> {
  const email = cleanEmail(body.email);
  const password = cleanPassword(body.password);

  const existing = await getPlayer(env, userId);
  if (existing?.email) throw new HttpError(409, 'Već imaš nalog na ovom identitetu');
  if (await emailTaken(env, email, userId)) throw new HttpError(409, 'Email je već registrovan');

  // ime: iz zahteva, pa postojeći profil, pa deo emaila pre @ (players.display_name je NOT NULL)
  const displayName =
    typeof body.displayName === 'string' && body.displayName.trim()
      ? cleanName(body.displayName)
      : (existing?.display_name ?? cleanName(email.split('@')[0].slice(0, 20)));

  const passwordHash = await hashPassword(password);
  const cf = request.cf;
  const now = new Date().toISOString();
  try {
    await env.DB.prepare(
      `INSERT INTO players (user_id, display_name, country, city, first_seen, last_seen, email, password_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         display_name = excluded.display_name,
         email = excluded.email,
         password_hash = excluded.password_hash,
         last_seen = excluded.last_seen`,
    )
      .bind(
        userId,
        displayName,
        typeof cf?.country === 'string' ? cf.country : null,
        typeof cf?.city === 'string' ? cf.city : null,
        now,
        now,
        email,
        passwordHash,
      )
      .run();
  } catch (e) {
    conflictAsHttp(e);
  }

  const res: AccountResponse = { userId, token: await signToken(env.AUTH_SECRET, userId), email, displayName };
  return json(res);
}

/** POST /api/auth/login — bez Bearer-a; email + lozinka → identitet naloga. */
export async function login(env: Env, body: LoginRequest): Promise<Response> {
  const email = cleanEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';

  const row = await env.DB.prepare('SELECT user_id, display_name, email, password_hash FROM players WHERE email = ?')
    .bind(email)
    .first<PlayerRow>();
  if (!row?.password_hash || !(await verifyPassword(password, row.password_hash))) {
    throw new HttpError(401, 'Pogrešan email ili lozinka');
  }

  const res: AccountResponse = {
    userId: row.user_id,
    token: await signToken(env.AUTH_SECRET, row.user_id),
    email,
    displayName: row.display_name,
  };
  return json(res);
}

/** GET /api/auth/me — status naloga za trenutni identitet. */
export async function me(env: Env, userId: string): Promise<Response> {
  const row = await getPlayer(env, userId);
  const res: MeResponse = {
    userId,
    registered: !!row?.email,
    email: row?.email ?? null,
    displayName: row?.display_name ?? null,
  };
  return json(res);
}

/** POST /api/auth/profile — promena imena / emaila / lozinke (svako polje opciono). */
export async function updateProfile(env: Env, userId: string, body: UpdateProfileRequest): Promise<Response> {
  const row = await getPlayer(env, userId);

  const wantsEmail = body.email !== undefined;
  const wantsPassword = body.newPassword !== undefined;
  const wantsName = body.displayName !== undefined;
  if (!wantsEmail && !wantsPassword && !wantsName) throw new HttpError(400, 'Prazna izmena');

  // email/lozinka imaju smisla samo za registrovan nalog
  if ((wantsEmail || wantsPassword) && !row?.email) throw new HttpError(403, 'Prvo napravi nalog');

  const sets: string[] = [];
  const binds: unknown[] = [];

  if (wantsName) {
    sets.push('display_name = ?');
    binds.push(cleanName(body.displayName));
  }
  if (wantsEmail) {
    const email = cleanEmail(body.email);
    if (email !== row?.email && (await emailTaken(env, email, userId))) {
      throw new HttpError(409, 'Email je već registrovan');
    }
    sets.push('email = ?');
    binds.push(email);
  }
  if (wantsPassword) {
    const newPassword = cleanPassword(body.newPassword);
    const current = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const currentHash = row?.password_hash;
    if (!currentHash || !(await verifyPassword(current, currentHash))) {
      throw new HttpError(403, 'Pogrešna trenutna lozinka');
    }
    sets.push('password_hash = ?');
    binds.push(await hashPassword(newPassword));
  }

  if (!row) {
    // anoniman korisnik bez ijedne partije menja samo ime — napravi profil red
    const now = new Date().toISOString();
    await env.DB.prepare('INSERT INTO players (user_id, display_name, first_seen, last_seen) VALUES (?, ?, ?, ?)')
      .bind(userId, cleanName(body.displayName), now, now)
      .run();
  } else {
    try {
      await env.DB.prepare(`UPDATE players SET ${sets.join(', ')} WHERE user_id = ?`)
        .bind(...binds, userId)
        .run();
    } catch (e) {
      conflictAsHttp(e);
    }
  }

  return me(env, userId);
}
