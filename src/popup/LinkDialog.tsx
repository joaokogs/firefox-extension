import { useState } from 'preact/hooks';
import type { LinkItem } from '@shared/types';
import { normalizeUrl } from '@shared/storage';
import { useI18n } from '@shared/i18n';
import { X } from 'lucide-preact';

interface LinkDialogProps {
  link?: LinkItem | null;
  onSave: (title: string, url: string) => void;
  onClose: () => void;
}

export function LinkDialog({ link, onSave, onClose }: LinkDialogProps) {
  const { t } = useI18n();
  const isEdit = !!link;
  const [title, setTitle] = useState(link?.title || '');
  const [url, setUrl] = useState(link?.url || '');

  const handleSave = () => {
    const normalized = normalizeUrl(url);
    if (!normalized) return;
    onSave(title.trim() || t('defaults.newLink'), normalized);
  };

  return (
    <div className="dialog-overlay" onClick={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true">
      <div className="dialog">
        <div className="dialog__header">
          <h2>{isEdit ? t('popupLink.editLink') : t('popupLink.addLink')}</h2>
          <button className="dialog__close" onClick={onClose} aria-label={t('popupLink.close')}>
            <X size={18} />
          </button>
        </div>

        <div className="dialog__body">
          <label className="dialog__field">
            <span>{t('popupLink.title')}</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle((e.target as HTMLInputElement).value)}
              placeholder={t('popupLink.titlePlaceholder')}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
          </label>
          <label className="dialog__field">
            <span>{t('popupLink.url')}</span>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl((e.target as HTMLInputElement).value)}
              placeholder={t('popupLink.urlPlaceholder')}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
          </label>
        </div>

        <div className="dialog__actions">
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            {t('popupLink.cancel')}
          </button>
          <button type="button" className="btn btn--primary" onClick={handleSave} disabled={!url.trim()}>
            {isEdit ? t('popupLink.save') : t('popupLink.add')}
          </button>
        </div>
      </div>
    </div>
  );
}
