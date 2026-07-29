import type { AppData } from '@shared/types';
import { t } from '@shared/i18n';

export function exportData(data: AppData): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = t('storage.backupFilename', { date: new Date().toISOString().slice(0, 10) });
  a.click();
  URL.revokeObjectURL(url);
}

export function importData(file: File): Promise<AppData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        if (!parsed.boards || !Array.isArray(parsed.boards) || !parsed.settings) {
          reject(new Error(t('storage.invalidFileFormat')));
          return;
        }
        resolve(parsed as AppData);
      } catch {
        reject(new Error(t('storage.invalidFileParse')));
      }
    };
    reader.onerror = () => reject(new Error(t('storage.errorReadingFile')));
    reader.readAsText(file);
  });
}
