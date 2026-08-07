import { useRef } from 'preact/hooks';
import type { AppSettings } from '@shared/types';
import { Trash2, Download, Upload, Bookmark } from 'lucide-preact';
import { useI18n, type Locale } from '@shared/i18n';

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
  const buttonClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-panel-accent-text disabled:cursor-not-allowed disabled:opacity-50';
  const secondaryButtonClass = `${buttonClass} border-panel-border bg-panel-surface-muted text-panel-text-secondary hover:border-panel-border hover:bg-panel-surface-raised hover:text-panel-text`;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="mb-3 rounded-2xl border border-panel-border-subtle bg-panel-surface-muted p-4 sm:p-5">
        <label className="block text-sm font-semibold tracking-[-0.01em] text-panel-text" htmlFor="settings-language">{t('settings.language')}</label>
        <div className="mt-3 flex items-center justify-between gap-4 rounded-xl border border-panel-border-subtle bg-panel-surface p-3.5">
          <span className="max-w-[28rem] text-sm leading-5 text-panel-text-secondary">{t('settings.languageDesc')}</span>
          <select
            className="min-h-10 rounded-xl border border-panel-border bg-panel-background px-3 text-sm font-medium text-panel-text outline-none transition-colors hover:border-panel-accent-text/70 focus:border-panel-accent-text focus:ring-2 focus:ring-panel-accent-text/20"
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
      </div>

      <div className="mb-3 rounded-2xl border border-panel-border-subtle bg-panel-surface-muted p-4 sm:p-5">
        <label className="block text-sm font-semibold tracking-[-0.01em] text-panel-text" htmlFor="settings-edit-mode">{t('settings.editMode')}</label>
        <div className="mt-3 flex items-center justify-between gap-4 rounded-xl border border-panel-border-subtle bg-panel-surface p-3.5">
          <span className="max-w-[28rem] text-sm leading-5 text-panel-text-secondary">{t('settings.editModeDesc')}</span>
          <label className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center">
            <input
              className="peer sr-only"
              id="settings-edit-mode"
              type="checkbox"
              checked={settings.editMode !== false}
              onChange={() => onChange({ editMode: settings.editMode === false ? true : false })}
            />
            <span className="absolute inset-0 rounded-full bg-panel-toggle-off transition-colors peer-checked:bg-panel-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-panel-accent-text peer-disabled:opacity-50 after:absolute after:left-1 after:top-1 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-5" />
          </label>
        </div>
      </div>

      <div className="mb-3 rounded-2xl border border-panel-border-subtle bg-panel-surface-muted p-4 sm:p-5">
        <label className="block text-sm font-semibold tracking-[-0.01em] text-panel-text" htmlFor="settings-open-in-new-tab">{t('settings.openInNewTab')}</label>
        <div className="mt-3 flex items-center justify-between gap-4 rounded-xl border border-panel-border-subtle bg-panel-surface p-3.5">
          <span className="max-w-[28rem] text-sm leading-5 text-panel-text-secondary">{t('settings.openInNewTabDesc')}</span>
          <label className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center">
            <input
              className="peer sr-only"
              id="settings-open-in-new-tab"
              type="checkbox"
              checked={settings.openInNewTab !== false}
              onChange={() => onChange({ openInNewTab: settings.openInNewTab === false ? true : false })}
            />
            <span className="absolute inset-0 rounded-full bg-panel-toggle-off transition-colors peer-checked:bg-panel-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-panel-accent-text peer-disabled:opacity-50 after:absolute after:left-1 after:top-1 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-5" />
          </label>
        </div>
      </div>

      <div className="mb-3 rounded-2xl border border-panel-border-subtle bg-panel-surface-muted p-4 sm:p-5">
        <span className="block text-sm font-semibold tracking-[-0.01em] text-panel-text">{t('settings.searchHistory')}</span>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className={`${buttonClass} border-red-500/25 bg-red-500/10 text-panel-danger hover:border-red-500/40 hover:bg-red-500/15`} onClick={() => onClearRecentSearches?.()} disabled={!(settings.recentSearches && settings.recentSearches.length > 0)}>
            <Trash2 size={14} strokeWidth={2} /> {t('settings.clearHistory')}
          </button>
        </div>
      </div>

      <div className="mb-3 rounded-2xl border border-panel-border-subtle bg-panel-surface-muted p-4 sm:p-5">
        <span className="block text-sm font-semibold tracking-[-0.01em] text-panel-text">{t('settings.bookmarks')}</span>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className={secondaryButtonClass} onClick={onImportBookmarks}>
            <Bookmark size={14} strokeWidth={2} aria-hidden="true" /> {t('settings.importBookmarks')}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-panel-border-subtle bg-panel-surface-muted p-4 sm:p-5">
        <span className="block text-sm font-semibold tracking-[-0.01em] text-panel-text">{t('settings.backup')}</span>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className={secondaryButtonClass} onClick={onExport}>
            <Download size={14} strokeWidth={2} /> {t('settings.exportJson')}
          </button>
          <button className={secondaryButtonClass} onClick={() => fileInputRef.current?.click()}>
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
  );
}
