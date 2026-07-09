// „Nova verzija dostupna" prompt (registerType: 'prompt'). Registruje SW preko
// vite-plugin-pwa virtuelnog modula i periodično proverava update (iOS drži
// instaliran PWA otvorenim danima pa inače nikad ne bi video novi SW).
import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

const UPDATE_INTERVAL_MS = 30 * 60 * 1000;

export default function PwaUpdateBanner() {
  const regRef = useRef<ServiceWorkerRegistration | null>(null);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, reg) {
      regRef.current = reg ?? null;
    },
    onRegisterError(err) {
      console.error('[pwa] registracija service worker-a nije uspela', err);
    },
  });

  useEffect(() => {
    const check = () => {
      void regRef.current?.update().catch(() => {});
    };
    const interval = window.setInterval(check, UPDATE_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', check);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', check);
    };
  }, []);

  if (!needRefresh) return null;

  return (
    // mobilni: na vrhu, u toku strane (gura sadržaj, ne prekriva ga; dno drži TabBar);
    // desktop: fiksiran na dnu kao do sada
    <div className="sticky top-0 z-[999] flex items-center justify-between gap-3 border-b-2 border-[#154780] bg-[linear-gradient(#58a8f7,#1767bd_48%,#0c4f9f)] px-4 pb-2 pt-[max(env(safe-area-inset-top),0.5rem)] font-mono text-[12px] font-bold text-white shadow-[0_2px_10px_rgba(0,0,0,0.35)] sm:fixed sm:inset-x-0 sm:bottom-0 sm:top-auto sm:border-b-0 sm:border-t-2 sm:pt-2 sm:shadow-[0_-2px_10px_rgba(0,0,0,0.35)]">
      <span>Nova verzija Prefe je dostupna.</span>
      <div className="flex shrink-0 gap-2">
        <button
          onClick={() => void updateServiceWorker(true)}
          className="border border-black/40 bg-[#f3de33] px-3 py-1 text-black shadow-[2px_2px_0_#08351f] active:translate-y-0.5 active:shadow-[1px_1px_0_#08351f]"
        >
          Osveži
        </button>
        <button
          onClick={() => setNeedRefresh(false)}
          className="border border-white/45 px-3 py-1 text-white/90 hover:bg-white/10"
        >
          Kasnije
        </button>
      </div>
    </div>
  );
}
