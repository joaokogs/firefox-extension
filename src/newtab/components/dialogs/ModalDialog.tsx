import { useRef, useEffect, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { X } from 'lucide-preact';
import { useI18n } from '@shared/i18n';

interface ModalDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ComponentChildren;
  wide?: boolean;
  ariaLabel?: string;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selector =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return Array.from(container.querySelectorAll<HTMLElement>(selector));
}

export function ModalDialog({ open, onClose, title, children, wide, ariaLabel }: ModalDialogProps) {
  const { t } = useI18n();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const [titleId] = useState(() => `modal-title-${Math.random().toString(36).slice(2, 9)}`);

  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement as HTMLElement;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = getFocusableElements(dialogRef.current);
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    const timer = setTimeout(() => {
      if (dialogRef.current) {
        const focusable = getFocusableElements(dialogRef.current);
        if (focusable.length > 0) {
          focusable[0].focus();
        } else {
          dialogRef.current.focus();
        }
      }
    }, 50);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
      if (previousFocusRef.current) {
        previousFocusRef.current.focus();
      }
    };
  }, [open]);

  if (!open) return null;

  const handleOverlayMouseDown = (e: MouseEvent) => {
    if (e.target === overlayRef.current) {
      onCloseRef.current();
    }
  };

  return (
    <div
      className="panel-modal-overlay fixed inset-0 z-[1000] flex animate-[overlayIn_0.2s_ease] items-end justify-center bg-slate-950/45 p-0 backdrop-blur-[3px] sm:items-center sm:p-6"
      ref={overlayRef}
      onMouseDown={handleOverlayMouseDown}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel || undefined}
      aria-labelledby={!ariaLabel ? titleId : undefined}
    >
      <div
            className={`panel-modal relative flex animate-[modalIn_0.25s_cubic-bezier(0.16,1,0.3,1)] max-h-[min(760px,calc(100dvh-24px))] w-full flex-col overflow-hidden rounded-t-lg border border-panel-border bg-panel-surface font-panel text-panel-text shadow-[0_24px_80px_rgba(15,23,42,0.22)] sm:max-h-[min(760px,calc(100dvh-48px))] sm:rounded-lg ${wide ? 'max-w-[760px]' : 'max-w-[560px]'}`}
        ref={dialogRef}
        tabIndex={-1}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-panel-border-subtle px-5 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <span className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-panel-accent-text">Prismi</span>
            <h2 id={titleId} className="truncate text-lg font-semibold tracking-[-0.02em] text-panel-text sm:text-xl">{title}</h2>
          </div>
          <button
              className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-panel-border-subtle bg-panel-surface-muted text-panel-text-muted transition-colors hover:border-panel-border hover:bg-panel-surface-raised hover:text-panel-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-panel-accent-text"
            onClick={() => onCloseRef.current()}
            aria-label={t('dialog.close')}
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
