import { useRef } from 'preact/hooks';
import type { AppSettings } from '@shared/types';
import { Trash2, Download, Upload } from 'lucide-preact';
import { useI18n, type Locale } from '@shared/i18n';

interface SettingsPanelProps {
  settings: AppSettings;
  onChange: (settings: Partial<AppSettings>) => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onClearRecentSearches?: () => void;
}

export function SettingsPanel({ settings, onChange, onExport, onImport, onClearRecentSearches }: SettingsPanelProps) {
  const { t, locale, setLocale } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="dialog__body">
      <div className="dialog__section settings-panel__section">
        <label className="dialog__section-title">{t('settings.language')}</label>
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

      <div className="dialog__section settings-panel__section">
        <label className="dialog__section-title">{t('settings.editMode')}</label>
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

      <div className="dialog__section settings-panel__section">
        <label className="dialog__section-title">{t('settings.openInNewTab')}</label>
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

      <div className="dialog__section settings-panel__section">
        <label className="dialog__section-title">{t('settings.searchHistory')}</label>
        <div className="backup-actions">
          <button className="btn btn--danger" onClick={() => onClearRecentSearches?.()} disabled={!(settings.recentSearches && settings.recentSearches.length > 0)}>
            <Trash2 size={14} strokeWidth={2} /> {t('settings.clearHistory')}
          </button>
        </div>
      </div>

      <div className="dialog__section settings-panel__section">
        <label className="dialog__section-title">{t('settings.backup')}</label>
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
