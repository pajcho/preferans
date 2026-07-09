// Donja navigacija (native obrazac, samo mobilni <sm): Početna · Partije ·
// ＋ Nova (centralna akcija) · Istorija · Profil. Desktop navigaciju nosi AppHeader.
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { IconCards, IconClock, IconHome, IconPlus, IconUser } from './icons';
import { NewGameSheet } from './NewGameSheet';

const TABS: {
  to: string;
  label: string;
  icon: (props: { size?: number }) => React.ReactNode;
  match: (path: string) => boolean;
}[] = [
  { to: '/', label: 'Početna', icon: IconHome, match: (p) => p === '/' },
  { to: '/partije', label: 'Partije', icon: IconCards, match: (p) => p.startsWith('/partije') },
  { to: '/history', label: 'Istorija', icon: IconClock, match: (p) => p.startsWith('/history') },
  {
    to: '/profil',
    label: 'Profil',
    icon: IconUser,
    match: (p) => p.startsWith('/profil') || p.startsWith('/podesavanja'),
  },
];

export function TabBar() {
  const { pathname } = useLocation();
  const [newOpen, setNewOpen] = useState(false);

  const tab = ({ to, label, icon: Icon, match }: (typeof TABS)[number]) => {
    const active = match(pathname);
    return (
      <Link
        key={to}
        to={to}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex flex-1 flex-col items-center gap-0.5 pt-1 font-mono text-[10px] font-bold',
          active ? 'text-black' : 'text-black/45',
        )}
      >
        <span
          className={cn(
            'grid h-[22px] w-[26px] place-items-center',
            active && 'border border-black/35 bg-[#f3de33] shadow-[1px_2px_0_rgba(77,16,8,0.7)]',
          )}
        >
          <Icon size={17} />
        </span>
        {label}
      </Link>
    );
  };

  return (
    <>
      <nav
        aria-label="Glavna navigacija"
        className="sticky bottom-0 z-40 border-t border-black/35 bg-[#f6f6f2] px-1 pb-[max(env(safe-area-inset-bottom),6px)] pt-1.5 sm:hidden"
      >
        <div className="mx-auto flex max-w-[440px] items-start">
          {TABS.slice(0, 2).map(tab)}
          <button
            onClick={() => setNewOpen(true)}
            className="-mt-4 flex flex-1 flex-col items-center gap-0.5 font-mono text-[10px] font-bold text-black"
            aria-haspopup="dialog"
          >
            <span className="grid h-11 w-11 place-items-center border border-black/45 bg-[#1597ee] shadow-[2px_3px_0_#4d1008] active:translate-y-0.5 active:shadow-[1px_1px_0_#4d1008]">
              <IconPlus size={22} />
            </span>
            Nova
          </button>
          {TABS.slice(2).map(tab)}
        </div>
      </nav>
      <NewGameSheet open={newOpen} onClose={() => setNewOpen(false)} />
    </>
  );
}
