import { useI18n } from '@shared/i18n';
import { Trash2 } from 'lucide-preact';
import { uiButtonDangerClass, uiButtonPrimaryClass, uiButtonSecondaryClass } from '@shared/ui/classes';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel: confirmLabelProp,
  cancelLabel: cancelLabelProp,
  danger = false,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  const { t } = useI18n();
  const confirmLabel = confirmLabelProp ?? t('confirm.confirm');
  const cancelLabel = cancelLabelProp ?? t('confirm.cancel');

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="modal confirm-dialog">
        <div className="confirm-dialog__body">
          {danger && (
            <div className="confirm-dialog__icon">
              <Trash2 size={24} strokeWidth={2} />
            </div>
          )}
          <h3 className="confirm-dialog__title">{title}</h3>
          <p className="confirm-dialog__message">{message}</p>
        </div>
        <div className="modal__actions">
          <button type="button" className={uiButtonSecondaryClass} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? uiButtonDangerClass : uiButtonPrimaryClass}
            onClick={onConfirm}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
