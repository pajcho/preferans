// Anonimni identitet: worker izdaje { userId, HMAC potpisan token },
// klijent ga trajno čuva u localStorage (bez registracije — kao ranije anonimna sesija).
import type { AuthResponse } from '@/protocol/messages';
import { apiBaseUrl } from './config';

const STORAGE_KEY = 'prefa-auth-v1';

let cached: AuthResponse | null = null;
let inflight: Promise<AuthResponse> | null = null;

function readStored(): AuthResponse | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuthResponse>;
    if (typeof parsed.userId === 'string' && typeof parsed.token === 'string') {
      return { userId: parsed.userId, token: parsed.token };
    }
  } catch {
    /* pokvaren zapis — tretiraj kao da ga nema */
  }
  return null;
}

/** Sinhrono: userId ako je identitet već izdat (za „Moje partije" bez mrežnog poziva). */
export function currentUserId(): string | null {
  cached ??= readStored();
  return cached?.userId ?? null;
}

/**
 * Vrati postojeći identitet ili tiho zatraži novi od servera.
 * Paralelni pozivi (React StrictMode duplira efekte) dele ISTI zahtev —
 * inače bi dva identiteta pregazila jedan drugog u localStorage.
 */
export async function ensureAuth(): Promise<AuthResponse> {
  cached ??= readStored();
  if (cached) return cached;
  inflight ??= requestIdentity().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function requestIdentity(): Promise<AuthResponse> {
  const base = apiBaseUrl();
  if (!base) throw new Error('Online igra nije podešena (nedostaje VITE_API_URL)');
  const res = await fetch(`${base}/api/auth/anon`, { method: 'POST' });
  if (!res.ok) throw new Error(`Prijava nije uspela (${res.status})`);
  const auth = (await res.json()) as AuthResponse;
  setIdentity(auth);
  return auth;
}

/** Zameni identitet uređaja (posle prijave na nalog). */
export function setIdentity(auth: AuthResponse): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
  cached = auth;
}

/** Odjava: obriši identitet — sledeći ensureAuth tiho pravi nov anoniman. */
export function clearIdentity(): void {
  localStorage.removeItem(STORAGE_KEY);
  cached = null;
}
