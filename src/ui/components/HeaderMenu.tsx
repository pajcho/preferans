// Dropdown meni u header-u (nalog / podešavanja / odjava). Bez shadcn-a — lagani
// dropdown u retro stilu; otvoren renderuje full-screen scrim (kao in-game ☰ meni)
// preko portala, pa se zatvara klikom van menija ili Escape.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

export interface HeaderMenuItem {
  label: string;
  to?: string;
  onClick?: () => void;
  danger?: boolean;
}

const itemCls = (danger?: boolean) =>
  cn(
    'block w-full px-3 py-2 text-left font-mono text-[13px] font-bold text-black hover:bg-[#1597ee]',
    danger && 'text-[#9f2f2a]',
  );

export function HeaderMenu({ label, items }: { label?: string | null; items: HeaderMenuItem[] }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label ? undefined : 'Meni'}
        className="flex items-center gap-1.5 font-mono text-[12px] font-bold leading-none text-white/95 hover:text-white"
      >
        {label && <span className="max-w-[120px] truncate">{label}</span>}
        <span aria-hidden className="-translate-y-px text-[15px] leading-none">
          ☰
        </span>
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-[100]" onClick={() => setOpen(false)}>
            <div className="absolute inset-0 bg-black/40" aria-hidden />
            <div
              role="menu"
              onClick={(e) => e.stopPropagation()}
              className="absolute right-2 top-[40px] min-w-[168px] overflow-hidden border border-[#8a8577] bg-[#f6f6f2] py-1 shadow-[3px_4px_0_#4d1008]"
            >
              {items.map((item) =>
                item.to ? (
                  <Link
                    key={item.label}
                    to={item.to}
                    role="menuitem"
                    className={itemCls(item.danger)}
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </Link>
                ) : (
                  <button
                    key={item.label}
                    type="button"
                    role="menuitem"
                    className={itemCls(item.danger)}
                    onClick={() => {
                      setOpen(false);
                      item.onClick?.();
                    }}
                  >
                    {item.label}
                  </button>
                ),
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
