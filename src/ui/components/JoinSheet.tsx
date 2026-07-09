// Priključivanje kodom — OTP-stil unosa: 6 kućica, auto-uppercase, paste celog
// koda odjednom. Vodi na /o/KOD; sedanje/ime/čekaonicu rešava lobi (OnlineTable).
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Sheet } from './Sheet';

const CODE_LEN = 6;

function cleanCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, CODE_LEN);
}

export function JoinSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState('');

  useEffect(() => {
    if (open) {
      setCode('');
      // fokus posle animacije sheet-a (otvara tastaturu na telefonu)
      const t = window.setTimeout(() => inputRef.current?.focus(), 80);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  const ready = code.length === CODE_LEN;

  function submit() {
    if (!ready) return;
    onClose();
    navigate(`/o/${code}`);
  }

  return (
    <Sheet open={open} onClose={onClose} title="Priključi se partiji">
      <div className="relative" onClick={() => inputRef.current?.focus()}>
        <input
          ref={inputRef}
          value={code}
          onChange={(e) => setCode(cleanCode(e.target.value))}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          aria-label="Kod partije"
          className="absolute inset-0 z-10 w-full cursor-pointer opacity-0"
        />
        <div className="flex justify-center gap-2" aria-hidden>
          {Array.from({ length: CODE_LEN }).map((_, i) => (
            <span
              key={i}
              className={cn(
                'grid h-12 w-9 place-items-center border bg-white font-mono text-lg font-bold text-black shadow-[inset_1px_1px_0_rgba(0,0,0,0.08)]',
                i === code.length ? 'border-2 border-[#1597ee]' : 'border-black/40',
              )}
            >
              {code[i] ?? ''}
            </span>
          ))}
        </div>
      </div>
      <p className="mt-2.5 text-center text-[11px] leading-4 text-black/50">
        Kod dobijaš od drugara ili iz podeljenog linka.
      </p>
      <button
        onClick={submit}
        disabled={!ready}
        className="mt-4 w-full border border-black/40 bg-[#1597ee] px-4 py-3 font-mono font-bold text-black shadow-[3px_4px_0_#4d1008] active:translate-y-0.5 active:shadow-[1px_1px_0_#4d1008] disabled:opacity-50"
      >
        Uđi u partiju
      </button>
    </Sheet>
  );
}
