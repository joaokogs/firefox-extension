import { useState, useRef, useEffect } from 'preact/hooks';
import { useI18n } from '@shared/i18n';
import { X } from 'lucide-preact';
import { uiFieldClass } from '@shared/ui/classes';

interface NewTabDialogProps {
  open: boolean;
  onSave: (title: string) => void;
  onClose: () => void;
}

export function NewTabDialog({ open, onSave, onClose }: NewTabDialogProps) {
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTitle('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const { t } = useI18n();

  const handleSave = () => {
    const trimmed = title.trim();
    if (trimmed) {
      onSave(trimmed);
    }
  };

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={t('newTab.title')}
    >
      <div className="modal">
        <div className="modal__header">
          <h2>{t('newTab.title')}</h2>
          <button className="dialog__close" onClick={onClose} aria-label={t('newTab.close')}>
            <X size={18} />
          </button>
        </div>

        <div className="dialog__body">
          <label className={uiFieldClass}>
            <span className="dialog__label">{t('newTab.name')}</span>
            <input
              ref={inputRef}
              type="text"
              value={title}
              onChange={(e) => setTitle((e.target as HTMLInputElement).value)}
              className="dialog__input"
              placeholder={t('newTab.namePlaceholder')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') onClose();
              }}
              maxLength={50}
            />
          </label>
        </div>

        <div className="modal__actions">
          <button type="button" className="dialog__button dialog__button--secondary" onClick={onClose}>
            {t('newTab.cancel')}
          </button>
          <button
            type="button"
            className="dialog__button dialog__button--primary"
            onClick={handleSave}
            disabled={!title.trim()}
          >
            {t('newTab.create')}
          </button>
        </div>
      </div>
    </div>
  );
}
