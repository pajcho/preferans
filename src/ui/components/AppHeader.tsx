// Plavi header — SAMO desktop (≥sm). Na mobilnom navigaciju nosi donji TabBar,
// pa tab ekrani nemaju gornju traku. Drži brend, linkove i nalog (dropdown).
import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '@state/authStore';
import { hasOnlineEnv } from '@net/config';
import { cn } from '@/lib/utils';
import { HeaderMenu } from './HeaderMenu';

const NAV = [
  { to: '/partije', label: 'Partije' },
  { to: '/history', label: 'Istorija' },
];

export function AppHeader() {
  const { pathname } = useLocation();
  const me = useAuthStore((s) => s.me);
  const logout = useAuthStore((s) => s.logout);
  const online = hasOnlineEnv();

  return (
    <header className="relative z-30 hidden h-[34px] shrink-0 items-center justify-between border-b border-[#154780] bg-[linear-gradient(#58a8f7,#1767bd_48%,#0c4f9f)] px-3 text-white shadow-[0_2px_0_rgba(255,255,255,0.35)_inset] sm:flex">
      <div className="flex items-center gap-4">
        <Link to="/" className="font-mono text-sm font-bold text-[#f3de33] drop-shadow">
          Prefa
        </Link>
        <nav className="flex items-center gap-3 font-mono text-[12px] font-bold">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                'text-white/85 underline-offset-2 hover:text-white hover:underline',
                pathname.startsWith(item.to) && 'text-white underline',
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-2.5 font-mono text-[12px] font-bold">
        {online && me?.registered ? (
          <HeaderMenu
            label={me.displayName}
            items={[
              { label: 'Nalog', to: '/profil' },
              { label: 'Notifikacije', to: '/podesavanja' },
              { label: 'Odjava', danger: true, onClick: logout },
            ]}
          />
        ) : (
          <>
            {online && (
              <Link to="/profil" className="text-white/95 underline-offset-2 hover:underline">
                Prijava
              </Link>
            )}
            <HeaderMenu items={[{ label: 'Podešavanja', to: '/podesavanja' }]} />
          </>
        )}
      </div>
    </header>
  );
}
