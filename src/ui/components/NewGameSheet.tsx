// Unificiran tok „Nova partija": jedini pravi izbor je protiv koga igraš.
// Kompjuteri → težina + trenutni start (sto sa 2 bota); Drugari → napravi sto
// pa podešavanje u lobiju. Oba idu kroz isti online tok (onlineStore).
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Difficulty } from '@engine';
import { useOnlineStore } from '@state/onlineStore';
import { useAuthStore } from '@state/authStore';
import { cn } from '@/lib/utils';
import { Sheet } from './Sheet';

const DIFFS: { key: Difficulty; label: string }[] = [
  { key: 'easy', label: 'Lako' },
  { key: 'medium', label: 'Srednje' },
  { key: 'hard', label: 'Teško' },
];

const segCls = (active: boolean) =>
  cn(
    'flex-1 border border-black/35 px-2 py-2.5 text-center font-mono text-[13px] font-bold shadow-[2px_3px_0_#4d1008] active:translate-y-0.5 active:shadow-[1px_1px_0_#4d1008]',
    active ? 'bg-[#f3de33] text-black' : 'bg-white text-black/60',
  );

const labelCls = 'mb-1.5 mt-3.5 text-[11px] font-bold uppercase tracking-wide text-black/50';
const inputCls =
  'w-full border border-black/35 bg-white px-3 py-2 font-mono text-sm text-black shadow-[inset_1px_1px_0_rgba(0,0,0,0.08)] outline-none focus:border-black/60';

export function NewGameSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const displayName = useOnlineStore((s) => s.displayName);
  const setDisplayName = useOnlineStore((s) => s.setDisplayName);
  const startVsCpu = useOnlineStore((s) => s.startVsCpu);
  const createGame = useOnlineStore((s) => s.createGame);
  const me = useAuthStore((s) => s.me);

  const [mode, setMode] = useState<'cpu' | 'friends'>('cpu');
  const [diff, setDiff] = useState<Difficulty>('medium');
  const [name, setName] = useState(displayName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ime sa naloga (login/loadMe) stiže posle mount-a — prati ga u polju
  useEffect(() => {
    setName(displayName);
  }, [displayName]);

  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      if (mode === 'friends') {
        const trimmed = name.trim();
        if (!me?.registered && !trimmed) {
          setError('Unesi ime za online igru');
          return;
        }
        if (trimmed) setDisplayName(trimmed);
        const { code } = await createGame();
        onClose();
        navigate(`/o/${code}`);
      } else {
        const { code } = await startVsCpu(diff);
        onClose();
        navigate(`/o/${code}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Pokretanje nije uspelo');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Nova partija">
      <div className={cn(labelCls, 'mt-0')}>Protivnici</div>
      <div className="flex gap-2" role="radiogroup" aria-label="Protivnici">
        <button
          role="radio"
          aria-checked={mode === 'cpu'}
          onClick={() => setMode('cpu')}
          className={segCls(mode === 'cpu')}
        >
          Kompjuteri
        </button>
        <button
          role="radio"
          aria-checked={mode === 'friends'}
          onClick={() => setMode('friends')}
          className={segCls(mode === 'friends')}
        >
          Drugari
        </button>
      </div>

      {mode === 'cpu' ? (
        <>
          <div className={labelCls}>Težina</div>
          <div className="flex gap-2">
            {DIFFS.map((d) => (
              <button
                key={d.key}
                onClick={() => setDiff(d.key)}
                aria-pressed={diff === d.key}
                className={segCls(diff === d.key)}
              >
                {d.label}
              </button>
            ))}
          </div>
        </>
      ) : (
        !me?.registered && (
          <>
            <div className={labelCls}>Tvoje ime</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
              placeholder="npr. Nikola"
              className={inputCls}
            />
          </>
        )
      )}

      <button
        onClick={() => void submit()}
        disabled={busy}
        className="mt-5 w-full border border-black/40 bg-[#1597ee] px-4 py-3 font-mono font-bold text-black shadow-[3px_4px_0_#4d1008] active:translate-y-0.5 active:shadow-[1px_1px_0_#4d1008] disabled:opacity-50"
      >
        {busy
          ? mode === 'cpu'
            ? 'Pravim partiju...'
            : 'Pravim sto...'
          : mode === 'cpu'
            ? 'Počni odmah'
            : 'Napravi sto'}
      </button>
      <p className="mt-2.5 text-[11px] leading-4 text-black/50">
        {mode === 'cpu'
          ? 'Sedaš za sto sa dva kompjutera — partija odmah kreće.'
          : 'Dobijaš kod i link za deljenje. Mesta (igrač ili kompjuter) i pravila podešavaš u lobiju — partija kreće kad klikneš start.'}
      </p>
      {error && <p className="mt-2 text-[12px] font-bold text-[#9f2f2a]">{error}</p>}
    </Sheet>
  );
}
