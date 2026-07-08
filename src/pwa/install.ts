// PWA instalacija: hvatanje `beforeinstallprompt` (Chromium/Android) i detekcija
// standalone/iOS moda. iOS Safari NE emituje beforeinstallprompt — tamo se nudi
// ručno „Podeli → Dodaj na početni ekran" uputstvo.
import { useEffect, useState } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let deferred: BeforeInstallPromptEvent | null = null;

/** Poziva se jednom, što ranije (main.tsx), da uhvati prompt pre nego što korisnik dođe do Podešavanja. */
export function initInstallCapture(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    window.dispatchEvent(new Event('prefa:installable'));
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    window.dispatchEvent(new Event('prefa:installed'));
  });
}

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferred) return 'unavailable';
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  window.dispatchEvent(new Event('prefa:installed'));
  return outcome;
}

export interface InstallState {
  /** Chromium je ponudio instalaciju (imamo deferred prompt). */
  canInstall: boolean;
  /** Već pokrenuto kao instaliran PWA. */
  installed: boolean;
  /** iOS (nema beforeinstallprompt-a — treba ručno uputstvo). */
  ios: boolean;
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
}

export function useInstall(): InstallState {
  const [canInstall, setCanInstall] = useState(deferred !== null);
  const [installed, setInstalled] = useState(isStandalone());

  useEffect(() => {
    const onInstallable = () => setCanInstall(true);
    const onInstalled = () => {
      setCanInstall(false);
      setInstalled(true);
    };
    window.addEventListener('prefa:installable', onInstallable);
    window.addEventListener('prefa:installed', onInstalled);
    return () => {
      window.removeEventListener('prefa:installable', onInstallable);
      window.removeEventListener('prefa:installed', onInstalled);
    };
  }, []);

  return { canInstall, installed, ios: isIos(), promptInstall };
}
