// Tipizirani REST pozivi ka Cloudflare Worker-u (create/join/mine/view/cancel).
// Za tok partije se ne koristi REST nego WebSocket (vidi socket.ts).
import type {
  AbandonDecision,
  AbandonResponse,
  AccountResponse,
  ApiError,
  ConfigureGameRequest,
  CreateGameRequest,
  CreateGameResponse,
  GameReplayResponse,
  HistoryGameItem,
  JoinGameRequest,
  JoinGameResponse,
  LoginRequest,
  MeResponse,
  MyGame,
  RegisterRequest,
  UpdateProfileRequest,
  ViewResponse,
} from '@/protocol/messages';
import type { GameHistoryHand } from '@/history/types';
import { ensureAuth } from './auth';
import { apiBaseUrl } from './config';

async function request<T>(
  path: string,
  opts: { method?: 'GET' | 'POST'; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const base = apiBaseUrl();
  if (!base) throw new Error('Online igra nije podešena (nedostaje VITE_API_URL)');
  const token = opts.auth === false ? null : (await ensureAuth()).token;

  const res = await fetch(`${base}${path}`, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    let message = `Greška servera (${res.status})`;
    try {
      const payload = (await res.json()) as ApiError;
      if (payload.error) message = payload.error;
    } catch {
      /* nije JSON — ostaje generička poruka */
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export const api = {
  createGame: (req: CreateGameRequest) => request<CreateGameResponse>('/api/games', { body: req }),
  joinGame: (req: JoinGameRequest) => request<JoinGameResponse>('/api/games/join', { body: req }),
  /** Jednokratni pogled (ulazak na sto pre nego što se WS otvori). */
  getView: (code: string) => request<ViewResponse>(`/api/games/${code}/view`),
  /** Podešavanje lobija (samo kreator): mesta igrač/bot, bule, refe. */
  configureGame: (code: string, patch: ConfigureGameRequest) =>
    request<null>(`/api/games/${code}/config`, { body: patch }),
  /** Start partije (samo kreator, sva mesta popunjena). */
  startGame: (code: string) => request<null>(`/api/games/${code}/start`, { method: 'POST' }),
  /** Izlazak iz čekaonice ili ustajanje sa mesta — samo dok je partija u lobiju. */
  leaveLobby: (code: string) => request<null>(`/api/games/${code}/leave`, { method: 'POST' }),
  cancelGame: (code: string) => request<{ ok: true }>(`/api/games/${code}/cancel`, { method: 'POST' }),
  /** Prekid aktivne partije uz saglasnost (propose/agree/reject/withdraw; botovi se uvek slažu). */
  abandonGame: (code: string, decision: AbandonDecision) =>
    request<AbandonResponse>(`/api/games/${code}/abandon`, { body: { decision } }),
  /** Moje nezavršene partije (server filtrira po identitetu). */
  myGames: () => request<MyGame[]>('/api/games/mine'),
  /** Istorija: moje ZAVRŠENE partije (server-backed zamena za lokalnu istoriju). */
  historyGames: () => request<HistoryGameItem[]>('/api/games/history'),
  /** Pun log završene partije za rekonstrukciju replay-a (karte + štihovi). */
  gameReplay: (code: string) => request<GameReplayResponse>(`/api/games/${code}/replay`),
  /** Završene ruke (server rekonstruiše iz loga) — puni „Prethodne ruke" i posle reload-a. */
  gameHands: (code: string) => request<{ hands: GameHistoryHand[] }>(`/api/games/${code}/hands`),

  // ── nalog (opciona nadogradnja anonimnog identiteta) ──
  /** Registracija veže email+lozinku za TRENUTNI identitet — istorija partija ostaje. */
  register: (req: RegisterRequest) => request<AccountResponse>('/api/auth/register', { body: req }),
  /** Prijava na postojeći nalog (bez Bearer-a — vraća identitet naloga). */
  login: (req: LoginRequest) => request<AccountResponse>('/api/auth/login', { body: req, auth: false }),
  /** Status naloga za trenutni identitet. */
  me: () => request<MeResponse>('/api/auth/me'),
  /** Izmena profila: ime / email / lozinka (newPassword traži currentPassword). */
  updateProfile: (req: UpdateProfileRequest) => request<MeResponse>('/api/auth/profile', { body: req }),
};
