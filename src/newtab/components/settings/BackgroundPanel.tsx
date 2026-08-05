import { useState, useRef, useCallback, useEffect } from 'preact/hooks';
import { HexColorPicker } from 'react-colorful';
import type { AppSettings, StoredBackground, UploadedBackground, WallpaperSetting } from '@shared/types';
import { DEFAULT_WALLPAPERS } from '@shared/types/constants';
import { useI18n } from '@shared/i18n';
import { deleteBackground, getBackgroundBlob, saveBackground } from '@shared/storage/backgrounds';
import { useThemeStore } from '../../store/useThemeStore';
import { Sun, Moon, Upload, Trash2 } from 'lucide-preact';

const MAX_UPLOADS = 5;
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

function isUploadedBackground(value: StoredBackground): value is UploadedBackground {
  return typeof value !== 'string';
}

function getWallpaperForBackground(background: StoredBackground): WallpaperSetting {
  return isUploadedBackground(background)
    ? { type: 'asset', value: background.id, mediaType: background.kind }
    : { type: 'url', value: background };
}

async function createPreviewUrl(blob: Blob, isGif: boolean): Promise<string> {
  const sourceUrl = URL.createObjectURL(blob);
  if (!isGif) return sourceUrl;

  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, 320 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) {
      bitmap.close();
      return sourceUrl;
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const preview = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.78));
    if (!preview) return sourceUrl;
    URL.revokeObjectURL(sourceUrl);
    return URL.createObjectURL(preview);
  } catch {
    return sourceUrl;
  }
}

async function optimizeImage(file: File): Promise<Blob> {
  if (file.type === 'image/gif') return file;

  try {
    const bitmap = await createImageBitmap(file);
    const maxDimension = 1920;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) {
      bitmap.close();
      return file;
    }
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const compressed = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.82);
    });
    return compressed ?? file;
  } catch {
    return file;
  }
}

interface BackgroundPanelProps {
  settings: AppSettings;
  onChange: (settings: Partial<AppSettings>) => void;
}

export function BackgroundPanel({ settings, onChange }: BackgroundPanelProps) {
  const { t } = useI18n();
  const [applying, setApplying] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const themeConfig = useThemeStore((s) => s.themeConfig);
  const updateThemeConfig = useThemeStore((s) => s.updateThemeConfig);
  const applyFromWallpaper = useThemeStore((s) => s.applyFromWallpaper);

  const uploadedBackgrounds = settings.uploadedBackgrounds || [];
  const assetIds = uploadedBackgrounds.filter(isUploadedBackground).map((background) => background.id).join('|');

  useEffect(() => {
    let active = true;
    const urls: Record<string, string> = {};
    const assets = uploadedBackgrounds.filter(isUploadedBackground);

    Promise.all(assets.map(async (asset) => {
      try {
        const blob = await getBackgroundBlob(asset.id);
        if (blob) urls[asset.id] = await createPreviewUrl(blob, asset.mimeType === 'image/gif');
      } catch {
        // A missing asset can still be removed from the list.
      }
    })).then(() => {
      if (!active) {
        Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
        return;
      }
      setAssetUrls((previous) => {
        Object.values(previous).forEach((url) => URL.revokeObjectURL(url));
        return urls;
      });
    });

    return () => {
      active = false;
      Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [assetIds]);

  const handleWallpaperSelect = useCallback(async (wp: WallpaperSetting) => {
    onChange({ wallpaper: wp });
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const actualDark = settings.theme === 'dark' || (settings.theme === 'system' && prefersDark);
    setApplying(true);
    await applyFromWallpaper(wp, actualDark);
    setApplying(false);
  }, [onChange, applyFromWallpaper, settings.theme]);

  const handleResetFromWallpaper = useCallback(async () => {
    setApplying(true);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const actualDark = settings.theme === 'dark' || (settings.theme === 'system' && prefersDark);
    await applyFromWallpaper(settings.wallpaper, actualDark);
    setApplying(false);
  }, [settings.wallpaper, settings.theme, applyFromWallpaper]);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (fileArray.length === 0) return;

    const current = settings.uploadedBackgrounds || [];
    const available = MAX_UPLOADS - current.length;
    if (available <= 0) return;

    setUploadError(null);
    setUploading(true);
    const results: UploadedBackground[] = [];

    for (const file of fileArray.slice(0, available)) {
      if (file.size > MAX_UPLOAD_BYTES) {
        setUploadError(t('background.fileTooLarge'));
        continue;
      }

      try {
        const kind = 'image' as const;
        const blob = await optimizeImage(file);
        if (blob.size > MAX_UPLOAD_BYTES) {
          setUploadError(t('background.fileTooLarge'));
          continue;
        }
        results.push(await saveBackground(blob, file, kind));
      } catch {
        setUploadError(t('background.uploadError'));
      }
    }

    if (results.length > 0) onChange({ uploadedBackgrounds: [...current, ...results] });
    setUploading(false);
  }, [settings.uploadedBackgrounds, onChange, t]);

  const handleFileInput = useCallback((e: Event) => {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      handleFiles(input.files);
      input.value = '';
    }
  }, [handleFiles]);

  const handleDeleteUploaded = useCallback(async (index: number) => {
    const current = settings.uploadedBackgrounds || [];
    const updated = current.filter((_, i) => i !== index);
    onChange({ uploadedBackgrounds: updated });

    const deleted = current[index];
    if (isUploadedBackground(deleted)) {
      await deleteBackground(deleted.id).catch(() => undefined);
    }
    if (deleted) {
      const deletedWallpaper = getWallpaperForBackground(deleted);
      if (settings.wallpaper.type === deletedWallpaper.type && settings.wallpaper.value === deletedWallpaper.value) {
        onChange({ wallpaper: DEFAULT_WALLPAPERS[0] });
      }
    }
  }, [settings.uploadedBackgrounds, settings.wallpaper, onChange]);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer?.files) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const isSelected = (wp: WallpaperSetting) =>
    settings.wallpaper.type === wp.type && settings.wallpaper.value === wp.value;

  const canUpload = uploadedBackgrounds.length < MAX_UPLOADS;

  return (
    <div className="dialog__body">
      <div className="dialog__section settings-panel__section">
        <label className="dialog__section-title">{t('background.theme')}</label>
        <div className="theme-toggle">
          <button
            className={settings.theme === 'light' ? 'active' : ''}
            onClick={() => onChange({ theme: 'light' })}
            aria-label={t('background.lightLabel')}
          >
            <Sun size={16} strokeWidth={2} />
            <span>{t('background.light')}</span>
          </button>
          <button
            className={settings.theme === 'dark' ? 'active' : ''}
            onClick={() => onChange({ theme: 'dark' })}
            aria-label={t('background.darkLabel')}
          >
            <Moon size={16} strokeWidth={2} />
            <span>{t('background.dark')}</span>
          </button>
          <button
            className={settings.theme === 'system' ? 'active' : ''}
            onClick={() => onChange({ theme: 'system' })}
            aria-label={t('background.systemLabel')}
          >
            <span>{t('background.system')}</span>
          </button>
        </div>
      </div>

      <div className="dialog__section settings-panel__section">
        <label className="dialog__section-title">{t('background.wallpaper')}</label>
        <div className="wallpaper-grid">
          {DEFAULT_WALLPAPERS.map((wp, index) => (
            <button
              key={index}
              className={`wallpaper-thumb ${isSelected(wp) ? 'wallpaper-thumb--active' : ''}`}
              style={{ background: wp.value }}
              onClick={() => handleWallpaperSelect(wp)}
              disabled={applying}
              aria-label={t('background.selectWallpaper', { n: index + 1 })}
              title={t('background.wallpaperN', { n: index + 1 })}
            />
          ))}
          {uploadedBackgrounds.map((background, index) => {
            const wallpaper = getWallpaperForBackground(background);
            const mediaUrl = isUploadedBackground(background) ? assetUrls[background.id] : background;

            return (
              <div key={`uploaded-${index}`} className="wallpaper-thumb-wrapper">
                <button
                  className={`wallpaper-thumb ${isSelected(wallpaper) ? 'wallpaper-thumb--active' : ''}`}
                  style={mediaUrl ? { backgroundImage: `url("${mediaUrl}")`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' } : undefined}
                  onClick={() => handleWallpaperSelect(wallpaper)}
                  disabled={applying || uploading}
                  aria-label={t('background.selectImage', { n: index + 1 })}
                  title={t('background.imageN', { n: index + 1 })}
                />
                <button
                  className="wallpaper-thumb__delete"
                  onClick={(e) => { e.stopPropagation(); void handleDeleteUploaded(index); }}
                  aria-label={t('background.deleteImage', { n: index + 1 })}
                  title={t('background.delete')}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            );
          })}
          {canUpload && (
            <button
              className="wallpaper-upload"
              onClick={() => fileInputRef.current?.click()}
              aria-label={t('background.uploadImageLabel')}
              title={t('background.uploadImage')}
              disabled={uploading}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <Upload size={20} />
              <span>{t('background.upload')}</span>
            </button>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={handleFileInput}
        />

        {canUpload && (
          <div
            className={`wallpaper-dropzone ${dragOver ? 'wallpaper-dropzone--drag-over' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            role="button"
            tabIndex={0}
            aria-label={t('background.dragOrClick')}
            onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
          >
            <Upload size={18} />
            <span>{uploading ? t('background.uploading') : t('background.dragOrClick')}</span>
            <span className="wallpaper-dropzone__hint">
              {t('background.usedSlots', { used: uploadedBackgrounds.length, total: MAX_UPLOADS })}
            </span>
          </div>
        )}
        {uploadError && <div className="wallpaper-upload-error" role="status">{uploadError}</div>}

      </div>

      <div className="dialog__section settings-panel__section">
        <label className="dialog__section-title">{t('background.primaryColor')}</label>
        <div className="theme-color-picker">
          <HexColorPicker
            color={themeConfig.primaryColor}
            onChange={(color: string) => updateThemeConfig({ primaryColor: color })}
          />
          <div className="theme-color-input-row">
            <span
              className="theme-color-swatch"
            >
              <span style={{ background: themeConfig.primaryColor }} />
            </span>
            <input
              type="text"
              value={themeConfig.primaryColor}
              onChange={(e) => {
                const val = (e.target as HTMLInputElement).value;
                if (/^#[0-9a-fA-F]{6}$/.test(val)) {
                  updateThemeConfig({ primaryColor: val });
                }
              }}
              className="theme-color-input"
              aria-label={t('background.primaryColorHex')}
            />
          </div>
        </div>
      </div>

      <div className="dialog__section settings-panel__section">
        <label className="dialog__section-title">{t('background.boardColor')}</label>
        <div className="theme-color-picker">
          <HexColorPicker
            color={themeConfig.boardColor}
            onChange={(color: string) => updateThemeConfig({ boardColor: color })}
          />
          <div className="theme-color-input-row">
            <span
              className="theme-color-swatch"
            >
              <span style={{ background: themeConfig.boardColor }} />
            </span>
            <input
              type="text"
              value={themeConfig.boardColor}
              onChange={(e) => {
                const val = (e.target as HTMLInputElement).value;
                if (/^#[0-9a-fA-F]{6}$/.test(val)) {
                  updateThemeConfig({ boardColor: val });
                }
              }}
              className="theme-color-input"
              aria-label={t('background.boardColorHex')}
            />
          </div>
        </div>
      </div>

      <div className="dialog__section settings-panel__section">
        <label className="dialog__section-title">
          {t('background.opacity', { value: Math.round(themeConfig.boardOpacity * 100) })}
        </label>
        <input
          type="range"
          min="0"
          max="100"
          value={Math.round(themeConfig.boardOpacity * 100)}
          onChange={(e) => {
            const val = parseInt((e.target as HTMLInputElement).value, 10);
            updateThemeConfig({ boardOpacity: val / 100 });
          }}
          className="theme-slider"
          aria-label={t('background.boardOpacity')}
        />
      </div>

      <div className="dialog__section settings-panel__section">
        <label className="dialog__section-title">
          {t('background.blur', { value: themeConfig.boardBlur })}
        </label>
        <input
          type="range"
          min="0"
          max="32"
          value={themeConfig.boardBlur}
          onChange={(e) => {
            const val = parseInt((e.target as HTMLInputElement).value, 10);
            updateThemeConfig({ boardBlur: val });
          }}
          className="theme-slider"
          aria-label={t('background.boardBlur')}
        />
      </div>

      <div className="dialog__section settings-panel__section">
        <button
          className="btn btn--primary"
          style={{ width: '100%' }}
          onClick={handleResetFromWallpaper}
          disabled={applying}
        >
          {applying ? t('background.extractingColors') : t('background.resetColors')}
        </button>
      </div>
    </div>
  );
}
