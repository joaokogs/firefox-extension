import { useEffect, useState, useMemo } from 'preact/hooks';
import type { AppData, LinksWidget, LinkItem } from '@shared/types';
import {
  loadData,
  saveData,
  getInitialBoardId,
  getBoards,
  onStorageFailure,
} from '@shared/storage';
import { createWidget, addWidget, updateWidget, deleteWidget, getWidgetsForBoard } from '@shared/storage/widgets';
import { createLink, addLink, updateLink, deleteLink } from '@shared/storage/links';
import { getFaviconUrl } from '@shared/utils/url';
import { openUrl, queryActiveTab } from '@shared/browser';
import { useI18n } from '@shared/i18n';
import { Menu, Settings, Plus, ExternalLink, Pencil, Trash2 } from 'lucide-preact';
import { LinkDialog } from './components/LinkDialog';
import { WidgetDialog } from './components/WidgetDialog';
import { recordOperation, setOutboxOwner } from '@shared/sync/outbox';
import { notifyLocalMutation } from '@shared/sync';
import { getSession, subscribeAuthState } from '@shared/auth/auth';
import { uiButtonPrimaryClass, uiButtonSecondaryClass, uiIconButtonClass, uiSelectClass } from '@shared/ui/classes';

type DialogMode = 'add-link' | { edit: string } | 'widget';

export function Popup() {
  const [data, setData] = useState<AppData | null>(null);
  const [activeBoardId, setActiveBoardId] = useState<string | undefined>(undefined);
  const [tabInfo, setTabInfo] = useState<{ title: string; url: string; favicon?: string } | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [dialog, setDialog] = useState<DialogMode | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [storageFailure, setStorageFailure] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    loadData().then(async (loaded) => {
      setData(loaded);
      setActiveBoardId(getInitialBoardId(loaded));
      try {
        const session = await getSession();
        setOutboxOwner(session?.user?.id);
      } catch { /* supabase not configured */ }
    });
    queryActiveTab().then(setTabInfo);
  }, []);

  useEffect(() => {
    try {
      return subscribeAuthState((session, event) => {
        if (event === 'SIGNED_OUT') {
          setOutboxOwner(undefined);
        } else if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
          setOutboxOwner(session.user.id);
        } else if (event === 'INITIAL_SESSION') {
          setOutboxOwner(undefined);
        }
      });
    } catch {
      setOutboxOwner(undefined);
      return undefined;
    }
  }, []);

  useEffect(() => {
    return onStorageFailure(() => {
      setStorageFailure(true);
    });
  }, []);

  const activeBoard = data ? getBoards(data).find((b) => b.id === activeBoardId) : undefined;

  const linkWidgets = useMemo(() => {
    if (!data || !activeBoardId) return [];
    return getWidgetsForBoard(data, activeBoardId).filter((w): w is LinksWidget => w.type === 'links');
  }, [data, activeBoardId]);

  const [selectedWidgetId, setSelectedWidgetId] = useState<string | undefined>(undefined);

  useEffect(() => {
    setSelectedWidgetId(linkWidgets[0]?.id);
  }, [linkWidgets]);

  const selectedWidget = useMemo(() => {
    if (!selectedWidgetId) return undefined;
    return linkWidgets.find((w) => w.id === selectedWidgetId);
  }, [linkWidgets, selectedWidgetId]);

  const handleSave = async () => {
    if (!tabInfo?.url || !activeBoardId || !data) return;

    try {
      const session = await getSession();
      setOutboxOwner(session?.user?.id);
    } catch { /* supabase not configured */ }

    setStatus('saving');

    try {
      let next = data;
      let widgetId = selectedWidgetId;

      if (!widgetId) {
        const widget = createWidget('links', activeBoard?.title || 'Links');
        next = addWidget(next, activeBoardId, widget);
        widgetId = widget.id;
        const inserted = next.workspaces.find((w) => w.id === activeBoardId)?.widgets.find((widget) => widget.id === widgetId);
        if (inserted) await recordOperation('widget', `${activeBoardId}/${widgetId}`, 'put', inserted);
      }

      const link = createLink(tabInfo.title, tabInfo.url);
      if (tabInfo.favicon) link.favicon = tabInfo.favicon;
      next = addLink(next, activeBoardId, widgetId, link);
      await recordOperation('link', `${activeBoardId}/${widgetId}/${link.id}`, 'put', link);

      const saveResult = await saveData(next);
      if (!saveResult.ok) {
        setStorageFailure(true);
        setStatus('idle');
        return;
      }
      setData(next);
      setStatus('saved');
      notifyLocalMutation();
      setTimeout(() => window.close(), 900);
    } catch (err) {
      console.error('[Popup] save failed:', err instanceof Error ? err.message : String(err));
      setStorageFailure(true);
      setStatus('idle');
    }
  };

  const handleAddLink = async (title: string, url: string) => {
    if (!data || !activeBoardId) return;

    try {
      const session = await getSession();
      setOutboxOwner(session?.user?.id);
    } catch { /* supabase not configured */ }

    try {
      let next = data;
      let widgetId = selectedWidgetId;

      if (!widgetId) {
        const widget = createWidget('links', 'Links');
        next = addWidget(next, activeBoardId, widget);
        widgetId = widget.id;
        setSelectedWidgetId(widgetId);
        const inserted = next.workspaces.find((w) => w.id === activeBoardId)?.widgets.find((widget) => widget.id === widgetId);
        if (inserted) await recordOperation('widget', `${activeBoardId}/${widgetId}`, 'put', inserted);
      }

      const link = createLink(title, url);
      next = addLink(next, activeBoardId, widgetId, link);
      await recordOperation('link', `${activeBoardId}/${widgetId}/${link.id}`, 'put', link);

      const saveResult = await saveData(next);
      if (!saveResult.ok) {
        setStorageFailure(true);
        return;
      }
      setData(next);
      notifyLocalMutation();
      setDialog(null);
    } catch (err) {
      console.error('[Popup] addLink failed:', err instanceof Error ? err.message : String(err));
      setStorageFailure(true);
    }
  };

  const handleEditLink = async (linkId: string, title: string, url: string) => {
    if (!data || !activeBoardId || !selectedWidgetId) return;

    try {
      const next = updateLink(data, activeBoardId, selectedWidgetId, linkId, { title, url });
      await recordOperation('link', `${activeBoardId}/${selectedWidgetId}/${linkId}`, 'patch', { title, url });
      const saveResult = await saveData(next);
      if (!saveResult.ok) {
        setStorageFailure(true);
        return;
      }
      setData(next);
      notifyLocalMutation();
      setDialog(null);
    } catch (err) {
      console.error('[Popup] editLink failed:', err instanceof Error ? err.message : String(err));
      setStorageFailure(true);
    }
  };

  const handleDeleteLink = async (linkId: string) => {
    if (!data || !activeBoardId || !selectedWidgetId) return;

    try {
      const next = deleteLink(data, activeBoardId, selectedWidgetId, linkId);
      await recordOperation('link', `${activeBoardId}/${selectedWidgetId}/${linkId}`, 'delete', null);
      const saveResult = await saveData(next);
      if (!saveResult.ok) {
        setStorageFailure(true);
        return;
      }
      setData(next);
      notifyLocalMutation();
    } catch (err) {
      console.error('[Popup] deleteLink failed:', err instanceof Error ? err.message : String(err));
      setStorageFailure(true);
    }
  };

  const handleWidgetSave = async (title: string) => {
    if (!data || !activeBoardId || !selectedWidgetId) return;

    try {
      const next = updateWidget(data, activeBoardId, selectedWidgetId, { title });
      await recordOperation('widget', `${activeBoardId}/${selectedWidgetId}`, 'patch', { title });
      const saveResult = await saveData(next);
      if (!saveResult.ok) {
        setStorageFailure(true);
        return;
      }
      setData(next);
      notifyLocalMutation();
      setDialog(null);
    } catch (err) {
      console.error('[Popup] widgetSave failed:', err instanceof Error ? err.message : String(err));
      setStorageFailure(true);
    }
  };

  const handleWidgetDelete = async () => {
    if (!data || !activeBoardId || !selectedWidgetId) return;

    try {
      let next = deleteWidget(data, activeBoardId, selectedWidgetId);
      await recordOperation('widget', `${activeBoardId}/${selectedWidgetId}`, 'delete', null);
      const remaining = getWidgetsForBoard(next, activeBoardId).filter((w): w is LinksWidget => w.type === 'links');
      setSelectedWidgetId(remaining[0]?.id);
      const saveResult = await saveData(next);
      if (!saveResult.ok) {
        setStorageFailure(true);
        return;
      }
      setData(next);
      notifyLocalMutation();
      setDialog(null);
    } catch (err) {
      console.error('[Popup] widgetDelete failed:', err instanceof Error ? err.message : String(err));
      setStorageFailure(true);
    }
  };

  const editingLink = useMemo(() => {
    if (!dialog || typeof dialog !== 'object' || !('edit' in dialog)) return null;
    return selectedWidget?.items.find((l) => l.id === dialog.edit) || null;
  }, [dialog, selectedWidget]);

  if (!data) {
    return <div className="popup popup--loading">{t('popup.loading')}</div>;
  }

  const editModeEnabled = data.settings.editMode !== false;

  if (!tabInfo) {
    return (
      <div className="popup">
        <div className="popup__header">
          <h1>{t('popup.board')}</h1>
        </div>
        <p className="popup__hint">{t('popup.couldNotReadTab')}</p>
      </div>
    );
  }

  return (
    <div className="popup">
      {storageFailure && (
        <div className="popup__storage-warning" role="alert">
          <span>{t('popup.storageFailure')}</span>
          <button
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-inherit opacity-70 transition-opacity hover:bg-black/10 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
            onClick={() => setStorageFailure(false)}
            aria-label={t('popup.dismiss')}
          >
            x
          </button>
        </div>
      )}

      <div className="popup__header">
        <button
          className={`${uiIconButtonClass} ${menuOpen ? 'border-ui-accent/40 text-ui-accent' : ''}`}
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? t('popup.closeMenu') : t('popup.openMenu')}
          title={menuOpen ? t('popup.closeMenu') : t('popup.openMenu')}
        >
          <Menu size={22} strokeWidth={2} />
        </button>
      </div>

      <div className={`popup__menu-content ${menuOpen ? 'popup__menu-content--open' : ''}`}>
        <div className="popup__preview">
          <strong>{tabInfo.title}</strong>
          <span>{cleanUrl(tabInfo.url)}</span>
        </div>

        <label className="popup__field">
          <span>{t('popup.board')}</span>
          <select
            className={uiSelectClass}
            value={activeBoardId}
            onChange={(e) => setActiveBoardId((e.target as HTMLSelectElement).value)}
            aria-label={t('popup.selectBoard')}
          >
            {getBoards(data).map((board) => (
              <option key={board.id} value={board.id}>
                {board.title}
              </option>
            ))}
          </select>
        </label>

        <label className="popup__field">
          <span>{t('popup.linkWidget')}</span>
          <select
            className={uiSelectClass}
            value={selectedWidgetId}
            onChange={(e) => setSelectedWidgetId((e.target as HTMLSelectElement).value)}
            aria-label={t('popup.selectWidget')}
          >
            {linkWidgets.length === 0 && <option value="">{t('popup.newWidget')}</option>}
            {linkWidgets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.title}
              </option>
            ))}
          </select>
        </label>

        {selectedWidget && (
          <div className="popup__links-header">
            <div className="popup__links-header-left">
              <span className="popup__links-title">{selectedWidget.title}</span>
              {editModeEnabled && (
                <button
                  className={`${uiIconButtonClass} h-7 w-7`}
                  onClick={() => setDialog('widget')}
                  aria-label={t('popup.editBlock')}
                  title={t('popup.editBlock')}
                >
                  <Settings size={14} strokeWidth={2} />
                </button>
              )}
            </div>
          </div>
        )}

        {editModeEnabled && (
          <div className="popup__links-plus">
            <button
              className={`${uiButtonSecondaryClass} w-full justify-start border-dashed text-ui-accent hover:text-ui-accent`}
              onClick={() => setDialog('add-link')}
              aria-label={t('popup.addLink')}
              title={t('popup.addLink')}
            >
              <Plus size={18} strokeWidth={2} />
              {t('popup.addLink')}
            </button>
          </div>
        )}

        {selectedWidget && selectedWidget.items.length > 0 && (
          <ul className="popup__links">
            {selectedWidget.items.map((link) => (
              <LinkRow
                key={link.id}
                link={link}
                data={data}
                onEdit={editModeEnabled ? () => setDialog({ edit: link.id }) : undefined}
                onDelete={editModeEnabled ? () => handleDeleteLink(link.id) : undefined}
              />
            ))}
          </ul>
        )}

        {selectedWidget && selectedWidget.items.length === 0 && (
          <p className="popup__empty">{t('popup.noLinksYet')}</p>
        )}

        {!selectedWidget && (
          <p className="popup__empty">{t('popup.noLinkBlocks')}</p>
        )}

        <div className="popup__divider" />

        {editModeEnabled && (
          <button
            className={`${uiButtonPrimaryClass} w-full ${status === 'saved' ? 'border-emerald-600 bg-emerald-600 hover:bg-emerald-600' : ''}`}
            onClick={handleSave}
            disabled={status === 'saving' || status === 'saved'}
            aria-live="polite"
          >
            {status === 'saved' ? t('popup.saved') : status === 'saving' ? t('popup.saving') : t('popup.saveTabIn', { board: activeBoard?.title ?? '' })}
          </button>
        )}

        <p className="popup__hint">{t('popup.openNewTab')}</p>
      </div>

      {dialog === 'add-link' && (
        <LinkDialog
          onSave={handleAddLink}
          onClose={() => setDialog(null)}
        />
      )}

      {typeof dialog === 'object' && dialog !== null && 'edit' in dialog && (
        <LinkDialog
          link={editingLink}
          onSave={(title, url) => handleEditLink(dialog.edit, title, url)}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog === 'widget' && selectedWidget && (
        <WidgetDialog
          widget={selectedWidget}
          onSave={handleWidgetSave}
          onDelete={handleWidgetDelete}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

function LinkRow({
  link,
  data,
  onEdit,
  onDelete
}: {
  link: LinkItem;
  data?: AppData | null;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const { t } = useI18n();
  const [imageError, setImageError] = useState(false);
  const favicon = link.favicon && !imageError ? link.favicon : getFaviconUrl(link.url);
  const handleOpen = (e: MouseEvent) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    void openUrl(link.url, data?.settings.openInNewTab !== false).catch(() => undefined);
  };

  return (
    <li className="popup__link-row">
      <span className="popup__link-icon">
        {favicon ? (
          <img
            src={favicon}
            alt=""
            width="16"
            height="16"
            loading="lazy"
            decoding="async"
            onError={() => setImageError(true)}
          />
        ) : (
          <ExternalLink size={14} strokeWidth={2} />
        )}
      </span>
      <a
        href={link.url}
        target={data?.settings.openInNewTab !== false ? '_blank' : '_self'}
        rel="noopener noreferrer"
        className="popup__link-text"
        title={link.title}
        onClick={handleOpen}
      >
        {link.title}
      </a>
      <span className="popup__link-url">{cleanUrl(link.url)}</span>
      {(onEdit || onDelete) && (
        <div className="popup__link-actions">
          {onEdit && (
            <button
              className={`${uiIconButtonClass} h-7 w-7 text-ui-accent hover:text-ui-accent`}
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              aria-label={t('popup.editItem', { title: link.title })}
              title={t('popup.edit')}
            >
              <Pencil size={15} strokeWidth={2} />
            </button>
          )}
          {onDelete && (
            <button
              className={`${uiIconButtonClass} h-7 w-7 border-ui-danger/20 text-ui-danger hover:border-ui-danger/30 hover:bg-ui-danger/10 hover:text-ui-danger-hover`}
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              aria-label={t('popup.deleteItem', { title: link.title })}
              title={t('popup.delete')}
            >
              <Trash2 size={15} strokeWidth={2} />
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function cleanUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
