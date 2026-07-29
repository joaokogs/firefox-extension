import { useState } from 'preact/hooks';
import type { LinksWidget } from '@shared/types';
import { useI18n } from '@shared/i18n';
import { X, Trash2 } from 'lucide-preact';

interface WidgetDialogProps {
  widget: LinksWidget;
  onSave: (title: string) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function WidgetDialog({ widget, onSave, onDelete, onClose }: WidgetDialogProps) {
  const { t } = useI18n();
  const [title, setTitle] = useState(widget.title);

  const handleSave = () => {
    onSave(title.trim() || widget.title);
  };

  return (
    <div className="dialog-overlay" onClick={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true">
      <div className="dialog">
        <div className="dialog__header">
          <h2>{t('popupWidget.editBlock')}</h2>
          <button className="dialog__close" onClick={onClose} aria-label={t('popupWidget.close')}>
            <X size={18} />
          </button>
        </div>

        <div className="dialog__body">
          <label className="dialog__field">
            <span>{t('popupWidget.title')}</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle((e.target as HTMLInputElement).value)}
              placeholder={t('popupWidget.titlePlaceholder')}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
          </label>
        </div>

        <div className="dialog__actions">
          <button type="button" className="btn btn--danger" onClick={onDelete}>
            <Trash2 size={14} strokeWidth={2} />
            {t('popupWidget.deleteBlock')}
          </button>
          <div style={{ flex: 1 }} />
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            {t('popupWidget.cancel')}
          </button>
          <button type="button" className="btn btn--primary" onClick={handleSave}>
            {t('popupWidget.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
