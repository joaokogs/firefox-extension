import { useRef } from 'preact/hooks';
import type { AppSettings } from '@shared/types';
import { Trash2, Download, Upload, Bookmark } from 'lucide-preact';
import { useI18n, type Locale } from '@shared/i18n';
import {
  uiButtonDangerClass,
  uiButtonSecondaryClass,
  uiSelectClass,
  uiSwitchInputClass,
  uiSwitchLabelClass,
  uiSwitchTrackClass
} from '@shared/ui/classes';

interface SettingsPanelProps {
  settings: AppSettings;
  onChange: (settings: Partial<AppSettings>) => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onImportBookmarks: () => void;
  onClearRecentSearches?: () => void;
}

export function SettingsPanel({ settings, onChange, onExport, onImport, onImportBookmarks, onClearRecentSearches }: SettingsPanelProps) {
  const { t, locale, setLocale } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cardClass = 'group flex min-h-44 flex-col justify-between gap-4 rounded-xl border border-panel-border-subtle bg-panel-surface-muted p-4 transition-colors hover:border-panel-border hover:bg-panel-surface sm:p-5';
  const descriptionClass = 'mt-1.5 block text-sm leading-5 text-panel-text-secondary';
  const controlRowClass = 'flex h-10 items-center justify-between gap-4 rounded-lg border border-panel-border-subtle bg-panel-surface px-3.5';
  const cardButtonClass = `${uiButtonSecondaryClass} h-10 text-xs`;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className={cardClass}>
          <div>
            <label className="block text-sm font-semibold tracking-[-0.01em] text-panel-text" htmlFor="settings-language">{t('settings.language')}</label>
            <span className={descriptionClass}>{t('settings.languageDesc')}</span>
          </div>
          <select
            className={`${uiSelectClass} font-medium`}
            id="settings-language"
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

        <div className={cardClass}>
          <div>
            <label className="block text-sm font-semibold tracking-[-0.01em] text-panel-text" htmlFor="settings-edit-mode">{t('settings.editMode')}</label>
            <span className={descriptionClass}>{t('settings.editModeDesc')}</span>
          </div>
          <div className={controlRowClass}>
            <span className="text-xs font-medium text-panel-text-secondary">{t('settings.editMode')}</span>
            <label className={uiSwitchLabelClass}>
              <input
                className={uiSwitchInputClass}
                id="settings-edit-mode"
                type="checkbox"
                checked={settings.editMode !== false}
                onChange={() => onChange({ editMode: settings.editMode === false ? true : false })}
              />
              <span className={uiSwitchTrackClass} />
            </label>
          </div>
        </div>

        <div className={cardClass}>
          <div>
            <label className="block text-sm font-semibold tracking-[-0.01em] text-panel-text" htmlFor="settings-open-in-new-tab">{t('settings.openInNewTab')}</label>
            <span className={descriptionClass}>{t('settings.openInNewTabDesc')}</span>
          </div>
          <div className={controlRowClass}>
            <span className="text-xs font-medium text-panel-text-secondary">{t('settings.openInNewTab')}</span>
            <label className={uiSwitchLabelClass}>
              <input
                className={uiSwitchInputClass}
                id="settings-open-in-new-tab"
                type="checkbox"
                checked={settings.openInNewTab !== false}
                onChange={() => onChange({ openInNewTab: settings.openInNewTab === false ? true : false })}
              />
              <span className={uiSwitchTrackClass} />
            </label>
          </div>
        </div>

        <div className={cardClass}>
          <div>
            <span className="block text-sm font-semibold tracking-[-0.01em] text-panel-text">{t('settings.searchHistory')}</span>
          </div>
          <button className={`${uiButtonDangerClass} h-10 w-full text-xs`} onClick={() => onClearRecentSearches?.()} disabled={!(settings.recentSearches && settings.recentSearches.length > 0)}>
            <Trash2 size={14} strokeWidth={2} /> {t('settings.clearHistory')}
          </button>
        </div>

        <div className={cardClass}>
          <div>
            <span className="block text-sm font-semibold tracking-[-0.01em] text-panel-text">{t('settings.bookmarks')}</span>
          </div>
          <button className={`${cardButtonClass} w-full gap-1.5 px-2.5`} onClick={onImportBookmarks}>
            <Bookmark size={14} strokeWidth={2} aria-hidden="true" /> {t('settings.importBookmarks')}
          </button>
        </div>

        <div className={`${cardClass} min-h-0 sm:col-span-2`}>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <span className="block text-sm font-semibold tracking-[-0.01em] text-panel-text">{t('settings.backup')}</span>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button className={cardButtonClass} onClick={onExport}>
              <Download size={14} strokeWidth={2} /> {t('settings.exportJson')}
            </button>
            <button className={cardButtonClass} onClick={() => fileInputRef.current?.click()}>
              <Upload size={14} strokeWidth={2} /> {t('settings.importJson')}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) onImport(file);
                (e.target as HTMLInputElement).value = '';
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
