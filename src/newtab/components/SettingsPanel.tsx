import { useRef, useEffect } from 'preact/hooks';
import type { AppSettings } from '@shared/types';
import { X, Trash2, Download, Upload } from 'lucide-preact';
import { useI18n, type Locale } from '@shared/i18n';

interface SettingsPanelProps {
  settings: AppSettings;
  onChange: (settings: Partial<AppSettings>) => void;
  onClose: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onClearRecentSearches?: () => void;
}

export function SettingsPanel({ settings, onChange, onClose, onExport, onImport, onClearRecentSearches }: SettingsPanelProps) {
  const { t, locale, setLocale } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  return (
    <div className="settings-panel" ref={panelRef} role="dialog" aria-label={t('settings.title')}>
      <div className="settings-panel__header">
        <h3>{t('settings.title')}</h3>
        <button className="settings-panel__close" onClick={onClose} aria-label={t('settings.close')}>
          <X size={18} />
        </button>
      </div>

      <div className="settings-panel__section">
        <label className="settings-panel__label">{t('settings.language')}</label>
        <div className="settings-panel__toggle-row">
          <span className="settings-panel__toggle-desc">{t('settings.languageDesc')}</span>
          <select
            className="settings-panel__select"
            value={locale}
            onChange={(e) => {
              const newLocale = (e.target as HTMLSelectElement).value as Locale;
              setLocale(newLocale);
              onChange({ locale: newLocale });
            }}
            aria-label={t('settings.language')}
          >
            <option value="en">{t('lang.en')}</option>
            <option value="pt-BR">{t('lang.pt-BR')}</option>
          </select>
        </div>
      </div>

      <div className="settings-panel__section">
        <label className="settings-panel__label">{t('settings.editMode')}</label>
        <div className="settings-panel__toggle-row">
          <span className="settings-panel__toggle-desc">{t('settings.editModeDesc')}</span>
          <label className="widget-toolbar__toggle">
            <input
              type="checkbox"
              checked={settings.editMode !== false}
              onChange={() => onChange({ editMode: settings.editMode === false ? true : false })}
            />
            <span className="widget-toolbar__toggle-slider" />
          </label>
        </div>
      </div>

      <div className="settings-panel__section">
        <label className="settings-panel__label">{t('settings.openInNewTab')}</label>
        <div className="settings-panel__toggle-row">
          <span className="settings-panel__toggle-desc">{t('settings.openInNewTabDesc')}</span>
          <label className="widget-toolbar__toggle">
            <input
              type="checkbox"
              checked={settings.openInNewTab !== false}
              onChange={() => onChange({ openInNewTab: settings.openInNewTab === false ? true : false })}
            />
            <span className="widget-toolbar__toggle-slider" />
          </label>
        </div>
      </div>

      <div className="settings-panel__section">
        <label className="settings-panel__label">{t('settings.searchHistory')}</label>
        <div className="backup-actions">
          <button className="btn btn--danger" onClick={() => onClearRecentSearches?.()} disabled={!(settings.recentSearches && settings.recentSearches.length > 0)}>
            <Trash2 size={14} strokeWidth={2} /> {t('settings.clearHistory')}
          </button>
        </div>
      </div>

      <div className="settings-panel__section">
        <label className="settings-panel__label">{t('settings.backup')}</label>
        <div className="backup-actions">
          <button className="btn btn--secondary" onClick={onExport}>
            <Download size={14} strokeWidth={2} /> {t('settings.exportJson')}
          </button>
          <button className="btn btn--secondary" onClick={() => fileInputRef.current?.click()}>
            <Upload size={14} strokeWidth={2} /> {t('settings.importJson')}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (file) onImport(file);
              (e.target as HTMLInputElement).value = '';
            }}
          />
        </div>
      </div>
    </div>
  );
}
