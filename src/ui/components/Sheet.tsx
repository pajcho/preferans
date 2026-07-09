// Bottom sheet: na mobilnom PRAVI drawer (vaul) — klizi odozdo i zatvara se
// prevlačenjem nadole (ili klikom na scrim / Escape); na desktopu (≥sm) ista
// komponenta postaje centriran retro dijalog.
import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Drawer } from 'vaul';
import { cn } from '@/lib/utils';

const DESKTOP_MQ = '(min-width: 640px)';

/** Prati sm breakpoint — desktop dobija dijalog umesto drawer-a. */
function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(DESKTOP_MQ);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => window.matchMedia(DESKTOP_MQ).matches,
  );
}

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
  const isDesktop = useIsDesktop();

  // Escape za desktop dijalog (drawer-u to rešava vaul)
  useEffect(() => {
    if (!open || !isDesktop) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [open, isDesktop, onClose]);

  if (isDesktop) {
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
            'absolute left-1/2 top-1/2 max-h-[85dvh] w-full -translate-x-1/2 -translate-y-1/2 overflow-y-auto border border-[#c9c9c9] bg-[#f6f6f2] p-4 font-mono text-sm text-black shadow-[4px_5px_0_#4d1008]',
            wide ? 'max-w-[440px]' : 'max-w-[380px]',
          )}
        >
          {title && <h2 className="mb-3 text-base font-bold">{title}</h2>}
          {children}
        </div>
      </div>,
      document.body,
    );
  }

  return (
    <Drawer.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[100] bg-black/45" />
        <Drawer.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-[101] flex max-h-[85dvh] flex-col rounded-t-[13px] border border-b-0 border-[#8a8577] bg-[#f6f6f2] px-4 pb-[max(env(safe-area-inset-bottom),14px)] pt-2 font-mono text-sm text-black shadow-[0_-3px_0_rgba(77,16,8,0.45)] outline-none"
        >
          <div className="mx-auto mb-2.5 mt-1 h-1 w-9 shrink-0 rounded-full bg-black/30" aria-hidden />
          <Drawer.Title className={title ? 'mb-3 text-base font-bold' : 'sr-only'}>{title ?? 'Meni'}</Drawer.Title>
          <div className="min-h-0 overflow-y-auto">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
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
