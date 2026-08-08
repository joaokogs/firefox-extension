import { useEffect, useState } from 'preact/hooks';
import { useI18n } from '@shared/i18n';
import { uiButtonPrimaryClass, uiButtonSecondaryClass, uiFieldClass, uiLabelClass, uiSelectClass } from '@shared/ui/classes';

export interface BookmarkFolder {
  id: string;
  title: string;
  depth: number;
}

interface BookmarkFolderPickerProps {
  folders: BookmarkFolder[];
  onImport: (folder: BookmarkFolder) => void;
  onClose: () => void;
}

export function BookmarkFolderPicker({ folders, onImport, onClose }: BookmarkFolderPickerProps) {
  const { t } = useI18n();
  const [folderId, setFolderId] = useState(folders[0]?.id || '');

  useEffect(() => {
    setFolderId(folders[0]?.id || '');
  }, [folders]);

  const selectedFolder = folders.find((folder) => folder.id === folderId);

  return (
    <div className="dialog__body">
      <div className="dialog__section settings-panel__section">
        <p className="settings-panel__toggle-desc">{t('bookmarks.description')}</p>
        <label className={uiFieldClass} htmlFor="bookmark-folder-select">
          <span className={uiLabelClass}>{t('bookmarks.folder')}</span>
          <select
            id="bookmark-folder-select"
            className={`${uiSelectClass} mt-2`}
            value={folderId}
            onChange={(event) => setFolderId((event.target as HTMLSelectElement).value)}
          >
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {`${'-- '.repeat(folder.depth)}${folder.title}`}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="modal__actions">
        <button type="button" className={uiButtonSecondaryClass} onClick={onClose}>
          {t('bookmarks.cancel')}
        </button>
        <button
          type="button"
          className={uiButtonPrimaryClass}
          disabled={!selectedFolder}
          onClick={() => selectedFolder && onImport(selectedFolder)}
        >
          {t('bookmarks.import')}
        </button>
      </div>
    </div>
  );
}
