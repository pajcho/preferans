// Segmentirani tabovi na vrhu profila: Profil (/profil) · Obaveštenja (/podesavanja).
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

const tabCls = (active: boolean) =>
  cn(
    'flex-1 border border-black/35 px-2 py-2 text-center font-mono text-[13px] font-bold shadow-[2px_3px_0_#4d1008] active:translate-y-0.5 active:shadow-[1px_1px_0_#4d1008]',
    active ? 'bg-[#f3de33] text-black' : 'bg-white text-black/60',
  );

export function ProfileTabs({ active }: { active: 'profil' | 'obavestenja' }) {
  return (
    <nav className="flex gap-2" aria-label="Sekcije profila">
      <Link
        to="/profil"
        className={tabCls(active === 'profil')}
        aria-current={active === 'profil' ? 'page' : undefined}
      >
        Profil
      </Link>
      <Link
        to="/podesavanja"
        className={tabCls(active === 'obavestenja')}
        aria-current={active === 'obavestenja' ? 'page' : undefined}
      >
        Obaveštenja
      </Link>
    </nav>
  );
}
