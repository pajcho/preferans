// Bottom sheet: na mobilnom klizi odozdo (native obrazac), na desktopu (≥sm)
// ista komponenta postaje centriran retro dijalog. Zatvara se klikom na scrim
// ili Escape-om. Renderuje se kroz portal preko cele strane.
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

export function Sheet({
  open,
  onClose,
  title,
  wide = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** širi desktop dijalog (liste, npr. potezi) */
  wide?: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100]" onClick={onClose} role="presentation">
      <div className="absolute inset-0 bg-black/45" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'animate-sheet-up absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-[13px] border border-b-0 border-[#8a8577] bg-[#f6f6f2] px-4 pb-[max(env(safe-area-inset-bottom),14px)] pt-2 font-mono text-sm text-black shadow-[0_-3px_0_rgba(77,16,8,0.45)]',
          'sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:-translate-x-1/2 sm:-translate-y-1/2 sm:animate-none sm:rounded-none sm:border sm:border-[#c9c9c9] sm:p-4 sm:shadow-[4px_5px_0_#4d1008]',
          wide ? 'sm:max-w-[440px]' : 'sm:max-w-[380px]',
        )}
      >
        <div className="mx-auto mb-2.5 mt-1 h-1 w-9 rounded-full bg-black/30 sm:hidden" aria-hidden />
        {title && <h2 className="mb-3 text-base font-bold">{title}</h2>}
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Red menija u sheet-u (ikona + tekst + opcioni detalj desno). */
export function SheetRow({
  onClick,
  icon,
  trailing,
  danger,
  children,
}: {
  onClick: () => void;
  icon?: ReactNode;
  trailing?: ReactNode;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 border-t border-black/10 px-1 py-3 text-left text-[13px] font-bold first:border-t-0 active:bg-[#ffe89a]',
        danger && 'text-[#9f2f2a]',
      )}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing && <span className="shrink-0 text-[12px] font-normal text-black/50">{trailing}</span>}
    </button>
  );
}
