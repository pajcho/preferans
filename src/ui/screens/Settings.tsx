// ─────────────────────────────────────────────────────────────
// Podešavanja (/podesavanja): push obaveštenja (odobri/isključi + probno)
// i instalacija aplikacije (PWA). Sve po uređaju.
// ─────────────────────────────────────────────────────────────
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { hasOnlineEnv } from '@net/config';
import { useNotifications } from '@/pwa/useNotifications';
import { useInstall } from '@/pwa/install';
import { cn } from '@/lib/utils';

const panelCls = 'border border-[#c9c9c9] bg-[#f6f6f2] font-mono text-sm shadow-[3px_4px_0_#4d1008]';
const btnLight =
  'border border-black/35 bg-[#f7f7f2] px-4 py-2 font-bold text-black shadow-[2px_3px_0_#4d1008] active:translate-y-0.5 active:shadow-[1px_1px_0_#4d1008] disabled:opacity-50';
const noteCls = 'text-[11px] leading-4 text-black/50';

/** Retro toggle (nema shadcn-a u projektu — ručno crtan prekidač). */
function Switch({ on, disabled, onClick }: { on: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'relative h-7 w-12 shrink-0 border border-black/40 shadow-[inset_1px_1px_0_rgba(0,0,0,0.15)] transition-colors disabled:opacity-40',
        on ? 'bg-[#1aa15a]' : 'bg-[#c9c9c4]',
      )}
    >
      <span
        className={cn(
          'absolute top-[4px] h-5 w-5 border border-black/40 bg-white shadow-[1px_1px_0_#4d1008] transition-all',
          on ? 'left-[24px]' : 'left-[4px]',
        )}
      />
    </button>
  );
}

function NotificationsCard() {
  const online = hasOnlineEnv();
  const n = useNotifications();

  return (
    <section className={panelCls}>
      <div className="bg-[#ececea] px-3 py-2 font-bold">Obaveštenja</div>
      <div className="space-y-3 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-bold">Push obaveštenja</div>
            <div className={noteCls}>Javi mi kad sam na potezu — i kad aplikacija nije otvorena.</div>
          </div>
          <Switch
            on={n.isSubscribed}
            disabled={!n.supported || n.pending}
            onClick={() => void (n.isSubscribed ? n.unsubscribe() : n.subscribe())}
          />
        </div>

        {!online ? (
          <p className={cn(noteCls, 'font-bold text-[#9f6a12]')}>
            Server (online igra) nije podešen za ovaj build — push nije dostupan.
          </p>
        ) : !n.supported ? (
          <p className={cn(noteCls, 'font-bold text-[#9f6a12]')}>
            Ovaj browser ne podržava push. Na iPhone-u prvo dodaj Prefu na početni ekran (dole), pa je otvori odatle.
          </p>
        ) : n.isSubscribed ? (
          <p className={cn(noteCls, 'font-bold text-[#087f45]')}>Uključeno na ovom uređaju ✓</p>
        ) : n.pending ? (
          <p className={noteCls}>Tražim dozvolu…</p>
        ) : (
          <p className={noteCls}>Uključi da bi te Prefa zvala kad te saigrači čekaju na potezu.</p>
        )}

        {/* blokirano / greška — prominentna, akciona poruka */}
        {online && n.supported && n.permission === 'denied' ? (
          <div className="border border-[#cc8f8f] bg-[#fbeaea] p-2 text-[11px] font-bold leading-4 text-[#9f2f2a]">
            Obaveštenja su <b>blokirana za ovaj sajt</b> u browseru — Prefa ne može sama da ih uključi. Klikni na 🔒
            (ili ⓘ) levo od adrese → „Obaveštenja / Notifications" → „Dozvoli / Allow", pa osveži stranicu.
          </div>
        ) : n.error ? (
          <div className="border border-[#cc8f8f] bg-[#fbeaea] p-2 text-[11px] font-bold leading-4 text-[#9f2f2a]">
            {n.error}
          </div>
        ) : null}

        {n.isSubscribed && (
          <button onClick={() => void n.sendLocalTest()} className={btnLight}>
            Pošalji probno obaveštenje
          </button>
        )}
      </div>
    </section>
  );
}

function InstallCard() {
  const { canInstall, installed, ios, promptInstall } = useInstall();

  return (
    <section className={panelCls}>
      <div className="bg-[#ececea] px-3 py-2 font-bold">Instaliraj aplikaciju</div>
      <div className="space-y-3 p-3">
        {installed ? (
          <p className={cn(noteCls, 'font-bold text-[#087f45]')}>Prefa je instalirana na ovom uređaju ✓</p>
        ) : canInstall ? (
          <>
            <p className={noteCls}>Dodaj Prefu na početni ekran — puni ekran, brže pokretanje, radi i offline.</p>
            <button onClick={() => void promptInstall()} className={btnLight}>
              Instaliraj Prefu
            </button>
          </>
        ) : ios ? (
          <p className={noteCls}>
            iPhone / iPad: dodirni <b>Podeli</b> (kvadrat sa strelicom nagore), pa <b>„Dodaj na početni ekran"</b>. Tek
            iz instalirane aplikacije rade i obaveštenja.
          </p>
        ) : (
          <p className={noteCls}>
            Otvori meni browsera pa izaberi <b>„Instaliraj aplikaciju"</b> ili <b>„Dodaj na početni ekran"</b>.
          </p>
        )}
      </div>
    </section>
  );
}

export default function Settings() {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = 'Prefa — Podešavanja';
  }, []);

  return (
    <div className="min-h-full bg-[#92928f] text-black [font-family:Verdana,Geneva,sans-serif]">
      <header className="relative flex h-[34px] items-center border-b border-[#154780] bg-[linear-gradient(#58a8f7,#1767bd_48%,#0c4f9f)] px-2 text-white shadow-[0_2px_0_rgba(255,255,255,0.35)_inset]">
        <button onClick={() => navigate('/')} className="relative z-10 font-mono text-sm font-bold text-white/95">
          ← Početna
        </button>
        <div className="pointer-events-none absolute inset-x-12 text-center font-mono text-sm font-bold drop-shadow">
          Podešavanja
        </div>
      </header>

      <main className="mx-auto w-full max-w-[560px] space-y-4 px-4 py-6">
        <NotificationsCard />
        <InstallCard />
      </main>
    </div>
  );
}
