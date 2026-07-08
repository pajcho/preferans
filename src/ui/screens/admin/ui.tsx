// Zajednički delovi admin ekrana: shell sa prijavom (token gate), paneli,
// bedževi statusa i formatiranje datuma/trajanja. Stil prati retro sto (Home).
import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { GameStatus } from '@/protocol/messages';
import { AdminAuthError, adminApi, adminToken, clearAdminToken, setAdminToken } from '@net/admin';
import { cn } from '@/lib/utils';

export const btnCls =
  'border border-black/40 bg-white px-3 py-1.5 font-bold shadow-[2px_3px_0_#4d1008] active:translate-y-0.5 active:shadow-[1px_1px_0_#4d1008] disabled:opacity-50';

export const inputCls =
  'border border-black/35 bg-white px-3 py-1.5 font-mono text-sm text-black shadow-[inset_1px_1px_0_rgba(0,0,0,0.08)] outline-none focus:border-black/60';

/** Pozovi kad server vrati 401 — briše token i vraća shell na prijavu. */
const AdminAuthCtx = createContext<() => void>(() => {});

export function useAdminSignOut(): () => void {
  return useContext(AdminAuthCtx);
}

/** Obrada greške iz adminApi poziva: 401 → prijava, ostalo → poruka. */
export function useAdminError(): (e: unknown) => string {
  const signOut = useAdminSignOut();
  return (e: unknown) => {
    if (e instanceof AdminAuthError) {
      signOut();
      return e.message;
    }
    return e instanceof Error ? e.message : 'Nepoznata greška';
  };
}

export function AdminShell({ title, children }: { title: string; children: ReactNode }) {
  const [authed, setAuthed] = useState(() => adminToken() !== null);

  const signOut = () => {
    clearAdminToken();
    setAuthed(false);
  };

  return (
    <div className="min-h-full bg-[#92928f] font-mono text-sm text-black [font-family:Verdana,Geneva,sans-serif]">
      <header className="sticky top-0 z-10 flex h-[34px] items-center justify-between border-b border-[#154780] bg-[linear-gradient(#58a8f7,#1767bd_48%,#0c4f9f)] px-2 text-white shadow-[0_2px_0_rgba(255,255,255,0.35)_inset]">
        <Link to="/" className="font-mono text-[12px] font-bold text-white/85 hover:text-white">
          ← Prefa
        </Link>
        <div className="pointer-events-none absolute inset-x-20 text-center font-mono text-sm font-bold drop-shadow">
          {title}
        </div>
        {authed && (
          <button onClick={signOut} className="font-mono text-[12px] font-bold text-white/85 hover:text-white">
            Odjava
          </button>
        )}
      </header>
      <main className="mx-auto w-full max-w-[1180px] px-3 py-4 sm:px-4">
        {authed ? (
          <AdminAuthCtx.Provider value={signOut}>{children}</AdminAuthCtx.Provider>
        ) : (
          <TokenGate onAuthed={() => setAuthed(true)} />
        )}
      </main>
    </div>
  );
}

function TokenGate({ onAuthed }: { onAuthed: () => void }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const token = value.trim();
    if (!token) return;
    setBusy(true);
    setError(null);
    setAdminToken(token);
    try {
      await adminApi.ping();
      onAuthed();
    } catch (e) {
      clearAdminToken();
      setError(e instanceof AdminAuthError ? 'Pogrešan token.' : e instanceof Error ? e.message : 'Greška');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto mt-16 max-w-[360px]">
      <Panel title="Admin pristup">
        <div className="space-y-3 p-3">
          <p className="text-[12px] leading-5 text-black/60">Interni dashboard, unesi admin token za pristup.</p>
          <input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
            placeholder="admin token"
            autoFocus
            className={cn(inputCls, 'w-full')}
          />
          <button
            onClick={() => void submit()}
            disabled={busy || !value.trim()}
            className={cn(btnCls, 'w-full bg-[#1597ee]')}
          >
            {busy ? 'Provera...' : 'Uđi'}
          </button>
          {error && <p className="text-[12px] font-bold text-[#9f2f2a]">{error}</p>}
        </div>
      </Panel>
    </div>
  );
}

export function Panel({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="border border-[#c9c9c9] bg-[#f6f6f2] shadow-[3px_4px_0_#4d1008]">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 bg-[#ececea] px-3 py-2">
        <span className="font-bold">{title}</span>
        {right}
      </div>
      {children}
    </section>
  );
}

const STATUS_STYLE: Record<GameStatus, { label: string; cls: string }> = {
  lobby: { label: 'lobi', cls: 'bg-[#fff2a8] text-black' },
  active: { label: 'aktivna', cls: 'bg-[#087f45] text-white' },
  finished: { label: 'završena', cls: 'bg-[#1597ee] text-black' },
  abandoned: { label: 'otkazana', cls: 'bg-[#9f2f2a] text-white' },
};

export function StatusBadge({ status }: { status: GameStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={cn('inline-block border border-black/30 px-1.5 py-0.5 text-[11px] font-bold', s.cls)}>
      {s.label}
    </span>
  );
}

// ── formatiranje ──

export function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('sr-Latn-RS', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('sr-Latn-RS', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** „pre 5 min" — za kolone poslednje aktivnosti. */
export function fmtAgo(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'upravo';
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'upravo';
  if (min < 60) return `pre ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `pre ${h} h`;
  const d = Math.floor(h / 24);
  return `pre ${d} d`;
}

export function fmtDuration(fromIso: string | null, toIso: string | null): string {
  if (!fromIso) return '—';
  const ms = (toIso ? new Date(toIso).getTime() : Date.now()) - new Date(fromIso).getTime();
  if (ms < 0) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const min = Math.floor(s / 60);
  if (min < 60) return `${min}m ${s % 60}s`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

/** ISO kod zemlje → emoji zastava (RS → 🇷🇸). */
export function countryFlag(code: string | null): string {
  if (!code || code.length !== 2 || !/^[A-Za-z]{2}$/.test(code)) return '🌐';
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** Skraćeni anonimni userId za prikaz (prvih 8 znakova). */
export function shortId(userId: string | null): string {
  return userId ? userId.slice(0, 8) : '—';
}
