import { createComponent, render as renderSolid } from 'solid-js/web';
import toast, { Toaster } from 'solid-toast';

const TOAST_ROOT_ID = 'solid-toast-root';

export function mountSolidToast(): void {
  if (document.getElementById(TOAST_ROOT_ID)) return;

  const host = document.createElement('div');
  host.id = TOAST_ROOT_ID;
  document.body.appendChild(host);

  renderSolid(
    () => createComponent(Toaster, {
      position: 'bottom-center',
      gutter: 8,
      toastOptions: {
        duration: 3000,
        ariaProps: {
          role: 'status',
          'aria-live': 'polite',
        },
        style: {
          'background-color': 'var(--bg-surface-solid)',
          border: '1px solid var(--border)',
          'border-radius': '999px',
          'box-shadow': 'var(--shadow-md)',
          color: 'var(--text-primary)',
          'font-family': 'var(--font-sans)',
          'font-size': '14px',
        },
      },
    }),
    host,
  );
}

export function showSyncToast(message: string): void {
  toast.success(message, {
    duration: 3000,
    ariaProps: {
      role: 'status',
      'aria-live': 'polite',
    },
  });
}
