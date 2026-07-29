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

  const handleOverlayClick = (e: Event) => {
    if (e.target === overlayRef.current) {
      onCloseRef.current();
    }
  };

  return (
    <div
      className="modal-overlay modal-overlay--dialog"
      ref={overlayRef}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel || undefined}
      aria-labelledby={!ariaLabel ? titleId : undefined}
    >
      <div
        className={`modal dialog ${wide ? 'modal--wide' : ''}`}
        ref={dialogRef}
        tabIndex={-1}
      >
        <div className="dialog__header">
          <h2 id={titleId}>{title}</h2>
          <button className="modal__close" onClick={() => onCloseRef.current()} aria-label={t('dialog.close')}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
