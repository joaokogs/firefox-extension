import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Settings, Menu, Plus, Palette } from 'lucide-preact';
import type { AppData, Widget, WidgetType, TopWidgetConfig, SearchEngine } from '@shared/types';
import { SEARCH_ENGINES } from '@shared/types';
import {
  loadData,
  saveData,
  createBoard,
  addBoard,
  renameBoard,
  reorderBoard,
  deleteBoard,
  addWidget,
  deleteWidget,
  updateWidget,
  addLink,
  createLink,
  deleteLink,
  updateLink,
  moveLink,
  addTodoItem,
  createTodoItem,
  deleteTodoItem,
  updateTodoItem,
  toggleTodoItem,
  moveTodoItem,
  updateSettings,
  getBoardById,
  getInitialBoardId,
  getWidgetsForBoard,
  exportData,
  importData,
  createWidget,
  addRecentSearch,
  removeRecentSearch,
  clearRecentSearches
} from '@shared/storage';
import { BoardTabs } from './components/BoardTabs';
import { WidgetGrid } from './components/WidgetGrid';
import { WidgetEditor } from './components/WidgetEditor';
import { LinkDialog } from './components/LinkDialog';
import { SettingsPanel } from './components/SettingsPanel';
import { BackgroundPanel } from './components/BackgroundPanel';
import { TopInfoWidgets } from './components/TopInfoWidgets';
import { WidgetToolbar } from './components/WidgetToolbar';
import { ConfirmDialog } from './components/ConfirmDialog';
import { NewTabDialog } from './components/NewTabDialog';

import { SearchBar } from './components/SearchBar';
import { useThemeStore, type ThemeState } from './store/useThemeStore';
import { computeThemeVariables } from '@shared/colorExtractor';
import './styles.css';

function looksLikeUrl(str: string): boolean {
  return /^https?:\/\//i.test(str) || /^[a-z0-9][-a-z0-9]*\.[a-z]{2,}(\/|$)/i.test(str);
}

function ensureProtocol(str: string): string {
  if (/^https?:\/\//i.test(str)) return str;
  return `https://${str}`;
}

interface ConfirmState {
  title: string;
  message: string;
  danger?: boolean;
  confirmLabel?: string;
  onConfirm: () => void;
}

export function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [activeBoardId, setActiveBoardId] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showBackground, setShowBackground] = useState(false);
  const [showWidgetToolbar, setShowWidgetToolbar] = useState(false);
  const [isAddingWidget, setIsAddingWidget] = useState(false);
  const [editingWidget, setEditingWidget] = useState<Widget | null>(null);
  const [addingLinkWidget, setAddingLinkWidget] = useState<Widget | null>(null);
  const [editingLink, setEditingLink] = useState<{ widgetId: string; linkId: string } | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [showNewTabDialog, setShowNewTabDialog] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchEngine, setSearchEngine] = useState<SearchEngine>('google');

  useEffect(() => {
    let mounted = true;
    loadData().then((loaded) => {
      if (!mounted) return;
      setData(loaded);
      setActiveBoardId(getInitialBoardId(loaded));
    });
    return () => {
      mounted = false;
    };
  }, []);

  const saveDebounceRef = useRef<number | null>(null);
  const latestDataRef = useRef<AppData | null>(null);

  useEffect(() => {
    latestDataRef.current = data;
    if (data) {
      if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
      saveDebounceRef.current = window.setTimeout(() => {
        saveDebounceRef.current = null;
        if (latestDataRef.current) saveData(latestDataRef.current);
      }, 500);
    }
    return () => {
      if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    };
  }, [data]);

  useEffect(() => {
    const flush = () => {
      if (saveDebounceRef.current) {
        clearTimeout(saveDebounceRef.current);
        saveDebounceRef.current = null;
      }
      if (latestDataRef.current) saveData(latestDataRef.current);
    };
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, []);

  useEffect(() => {
    if (data && activeBoardId && data.settings.lastBoardId !== activeBoardId) {
      setData((prev) => (prev ? updateSettings(prev, { lastBoardId: activeBoardId }) : prev));
    }
  }, [activeBoardId]);

  const themeConfig = useThemeStore((s: ThemeState) => s.themeConfig);
  const themeMode = useThemeStore((s: ThemeState) => s.themeMode);
  const setThemeMode = useThemeStore((s: ThemeState) => s.setThemeMode);

  useEffect(() => {
    if (data?.settings.theme && data.settings.theme !== themeMode) {
      setThemeMode(data.settings.theme);
    }
  }, [data?.settings.theme]);

  useEffect(() => {
    const theme = themeMode === 'system' ? (data?.settings.theme ?? 'system') : themeMode;
    const root = document.documentElement;
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = theme === 'dark' || (theme === 'system' && systemDark);
    root.classList.toggle('theme-dark', isDark);
    root.classList.toggle('theme-light', !isDark);

    const vars = computeThemeVariables(themeConfig, isDark);
    Object.entries(vars).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
  }, [themeConfig, themeMode, data?.settings.theme]);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      const bar = document.querySelector('.app-fab-bar');
      if (bar && !bar.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  useEffect(() => {
    const searchWidget = data?.settings.topWidgets?.find((w) => w.type === 'search');
    if (searchWidget?.searchEngine) {
      setSearchEngine(searchWidget.searchEngine);
    }
  }, [data?.settings.topWidgets]);

  const handleEngineChange = (engine: SearchEngine) => {
    setSearchEngine(engine);
    const currentTopWidgets = data?.settings.topWidgets || [];
    const next = currentTopWidgets.map((w) =>
      w.type === 'search' ? { ...w, searchEngine: engine } : w
    );
    if (!next.some((w) => w.type === 'search')) {
      next.push({ type: 'search', searchEngine: engine });
    }
    handleSettingsChange({ topWidgets: next });
  };

  const activeBoard = useMemo(
    () => (data && activeBoardId ? getBoardById(data, activeBoardId) : undefined),
    [data, activeBoardId]
  );

  const widgets = useMemo(
    () => (data && activeBoardId ? getWidgetsForBoard(data, activeBoardId) : []),
    [data, activeBoardId]
  );

  if (!data || !activeBoard) {
    return <div className="app-loading" aria-label="Carregando Boards" />;
  }

  const editModeEnabled = data.settings.editMode !== false;

  const handleAddBoard = () => {
    setShowNewTabDialog(true);
  };

  const handleCreateBoard = (title: string) => {
    const board = createBoard(title);
    setData((prev) => (prev ? addBoard(prev, board) : prev));
    setActiveBoardId(board.id);
    setShowNewTabDialog(false);
  };

  const handleRenameBoard = (id: string, title: string) => {
    setData((prev) => (prev ? renameBoard(prev, id, title) : prev));
  };

  const handleReorderBoard = (id: string, toIndex: number) => {
    setData((prev) => (prev ? reorderBoard(prev, id, toIndex) : prev));
  };

  const handleDeleteBoard = (id: string, boardTitle: string) => {
    setConfirmState({
      title: 'Excluir aba',
      message: `Tem certeza que deseja excluir a aba "${boardTitle}"? Todos os widgets e links serão perdidos.`,
      danger: true,
      confirmLabel: 'Excluir',
      onConfirm: () => {
        setData((prev) => {
          if (!prev) return prev;
          const next = deleteBoard(prev, id);
          setActiveBoardId(getInitialBoardId(next));
          return next;
        });
        setConfirmState(null);
      }
    });
  };

  const handleAddWidget = (widget: Widget) => {
    if (!activeBoardId) return;
    setData((prev) => (prev && activeBoardId ? addWidget(prev, activeBoardId, widget) : prev));
    setIsAddingWidget(false);
  };

  const handleStartAddWidget = () => {
    setIsAddingWidget(true);
  };

  const handleUpdateWidget = (widget: Widget) => {
    if (!activeBoardId) return;
    setData((prev) =>
      prev && activeBoardId
        ? updateWidget(prev, activeBoardId, widget.id, widget as Partial<Widget>)
        : prev
    );
    setEditingWidget(null);
  };

  const handleDeleteWidget = (widgetId: string) => {
    setConfirmState({
      title: 'Excluir widget',
      message: 'Tem certeza que deseja excluir este widget?',
      danger: true,
      confirmLabel: 'Excluir',
      onConfirm: () => {
        if (activeBoardId) {
          setData((prev) => (prev && activeBoardId ? deleteWidget(prev, activeBoardId, widgetId) : prev));
        }
        setConfirmState(null);
      }
    });
  };

  const handleReorder = (nextWidgets: Widget[]) => {
    if (!activeBoardId) return;
    setData((prev) => {
      if (!prev || !activeBoardId) return prev;
      const board = prev.boards.find((b) => b.id === activeBoardId);
      if (!board) return prev;
      return {
        ...prev,
        boards: prev.boards.map((b) =>
          b.id === activeBoardId ? { ...b, widgets: nextWidgets, updatedAt: Date.now() } : b
        )
      };
    });
  };

  const handleResizeWidget = (widgetId: string, height: number) => {
    if (!activeBoardId) return;
    setData((prev) =>
      prev && activeBoardId
        ? updateWidget(prev, activeBoardId, widgetId, { height })
        : prev
    );
  };

  const handleMoveLink = (fromWidgetId: string, toWidgetId: string, linkId: string, toIndex: number) => {
    if (!activeBoardId) return;
    setData((prev) => (prev && activeBoardId ? moveLink(prev, activeBoardId, fromWidgetId, toWidgetId, linkId, toIndex) : prev));
  };

  const handleDeleteLink = (widgetId: string, linkId: string) => {
    if (!activeBoardId) return;
    setData((prev) => (prev && activeBoardId ? deleteLink(prev, activeBoardId, widgetId, linkId) : prev));
  };

  const handleAddLink = (widgetId: string, title: string, url: string, icon?: string) => {
    if (!activeBoardId) return;
    const link = createLink(title, url, icon);
    setData((prev) => (prev && activeBoardId ? addLink(prev, activeBoardId, widgetId, link) : prev));
    setAddingLinkWidget(null);
  };

  const handleEditLink = (widgetId: string, linkId: string) => {
    setEditingLink({ widgetId, linkId });
  };

  const handleUpdateLink = (widgetId: string, linkId: string, title: string, url: string, icon?: string) => {
    if (!activeBoardId) return;
    setData((prev) =>
      prev && activeBoardId
        ? updateLink(prev, activeBoardId, widgetId, linkId, {
            title: title.trim() || 'Link sem título',
            url,
            icon: icon || undefined
          })
        : prev
    );
    setEditingLink(null);
  };

  const handleAddTodo = (widgetId: string, text: string) => {
    if (!activeBoardId) return;
    const todo = createTodoItem(text);
    setData((prev) => (prev && activeBoardId ? addTodoItem(prev, activeBoardId, widgetId, todo) : prev));
  };

  const handleToggleTodo = (widgetId: string, todoId: string) => {
    if (!activeBoardId) return;
    setData((prev) => (prev && activeBoardId ? toggleTodoItem(prev, activeBoardId, widgetId, todoId) : prev));
  };

  const handleUpdateTodo = (widgetId: string, todoId: string, text: string) => {
    if (!activeBoardId) return;
    setData((prev) =>
      prev && activeBoardId
        ? updateTodoItem(prev, activeBoardId, widgetId, todoId, { text: text.trim() })
        : prev
    );
  };

  const handleDeleteTodo = (widgetId: string, todoId: string) => {
    if (!activeBoardId) return;
    setData((prev) => (prev && activeBoardId ? deleteTodoItem(prev, activeBoardId, widgetId, todoId) : prev));
  };

  const handleMoveTodo = (fromWidgetId: string, toWidgetId: string, todoId: string, toIndex: number) => {
    if (!activeBoardId) return;
    setData((prev) => (prev && activeBoardId ? moveTodoItem(prev, activeBoardId, fromWidgetId, toWidgetId, todoId, toIndex) : prev));
  };

  const editingLinkData = useMemo(() => {
    if (!editingLink || !data || !activeBoardId) return null;
    const widget = data.boards
      .find((b) => b.id === activeBoardId)
      ?.widgets.find((w) => w.id === editingLink.widgetId);
    if (!widget || widget.type !== 'links') return null;
    const link = widget.items.find((l) => l.id === editingLink.linkId);
    if (!link) return null;
    return { widgetTitle: widget.title, widgetId: editingLink.widgetId, link };
  }, [editingLink, data, activeBoardId]);

  const handleSettingsChange = (settings: Partial<AppData['settings']>) => {
    setData((prev) => (prev ? updateSettings(prev, settings) : prev));
  };

  const handleToggleWidget = (type: WidgetType) => {
    const currentTopWidgets = data?.settings.topWidgets || [];
    const exists = currentTopWidgets.find((w) => w.type === type);
    
    if (exists) {
      // Remove widget
      const next = currentTopWidgets.filter((w) => w.type !== type);
      handleSettingsChange({ topWidgets: next });
    } else {
      // Add widget with defaults
      const newWidget: TopWidgetConfig = { type: type as any };
      if (type === 'weather') newWidget.city = 'New York';
      handleSettingsChange({ topWidgets: [...currentTopWidgets, newWidget] });
    }
  };

  const handleAddWidgetFromToolbar = (type: WidgetType) => {
    if (!activeBoardId) return;
    const widget = createWidget(type, '');
    setData((prev) => (prev && activeBoardId ? addWidget(prev, activeBoardId, widget) : prev));
  };

  const handleToolbarCityChange = (city: string) => {
    const currentTopWidgets = data?.settings.topWidgets || [];
    const next = currentTopWidgets.map((w) => 
      w.type === 'weather' ? { ...w, city } : w
    );
    handleSettingsChange({ topWidgets: next });
  };

  const handleExport = () => {
    if (data) exportData(data);
  };

  const handleImport = async (file: File) => {
    try {
      const imported = await importData(file);
      setData(imported);
      saveData(imported);
      setActiveBoardId(getInitialBoardId(imported));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao importar');
    }
  };

  const linkSuggestions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];

    return widgets
      .filter((widget) => widget.type === 'links')
      .flatMap((widget) => widget.items)
      .filter((link) => link.title.toLowerCase().includes(query) || link.url.toLowerCase().includes(query))
      .slice(0, 3);
  }, [widgets, searchQuery]);

  const handleRemoveRecentSearch = (query: string) => {
    setData((prev) => (prev ? removeRecentSearch(prev, query) : prev));
  };

  const handleClearRecentSearches = () => {
    setConfirmState({
      title: 'Limpar histórico',
      message: 'Tem certeza que deseja limpar todo o histórico de buscas recentes?',
      danger: true,
      confirmLabel: 'Limpar',
      onConfirm: () => {
        setData((prev) => (prev ? clearRecentSearches(prev) : prev));
        setConfirmState(null);
      }
    });
  };

  const handleSearch = (query: string) => {
    const q = query.trim();
    if (!q) return;
    const target = data?.settings.openInNewTab !== false ? '_blank' : '_self';
    if (looksLikeUrl(q)) {
      window.open(ensureProtocol(q), target);
    } else {
      const engineUrl = SEARCH_ENGINES.find((e) => e.id === searchEngine)?.url || SEARCH_ENGINES[0].url;
      window.open(`${engineUrl}${encodeURIComponent(q)}`, target);
    }
    setData((prev) => (prev ? addRecentSearch(prev, q) : prev));
  };

  return (
    <div
      className="app"
      style={{
        background:
          data.settings.wallpaper.type === 'url'
            ? `url(${data.settings.wallpaper.value}) center/cover no-repeat fixed`
            : data.settings.wallpaper.value
      }}
    >
      <header className="app-header">
        <BoardTabs
          boards={data.boards}
          activeId={activeBoardId}
          onSelect={setActiveBoardId}
          onAdd={handleAddBoard}
          onRename={handleRenameBoard}
          onDelete={(id, title) => handleDeleteBoard(id, title)}
          onReorder={handleReorderBoard}
        />

        {data.settings.topWidgets?.some((w) => w.type === 'search') && (
          <SearchBar
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            searchEngine={searchEngine}
            onEngineChange={handleEngineChange}
            onSearch={handleSearch}
            onOpenLink={(url) => {
              const target = data?.settings.openInNewTab !== false ? '_blank' : '_self';
              window.open(ensureProtocol(url), target);
            }}
            recentSearches={data.settings.recentSearches || []}
            linkSuggestions={linkSuggestions}
            onRemoveRecentSearch={handleRemoveRecentSearch}
          />
        )}

        <TopInfoWidgets
          configs={data.settings.topWidgets?.filter((w) => w.type !== 'search') || []}
        />

      </header>

      <div className="app-fab-bar">
        <button
          className={`app-fab-bar__btn app-fab-bar__btn--menu ${menuOpen ? 'app-fab-bar__btn--active' : ''}`}
          onClick={() => setMenuOpen((s) => !s)}
          aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
          title={menuOpen ? 'Fechar menu' : 'Menu'}
        >
          <Menu size={22} strokeWidth={2} />
        </button>

        <div className={`app-fab-menu ${menuOpen ? 'app-fab-menu--open' : ''}`}>
            <button
              className="app-fab-menu__item"
              onClick={() => { setShowWidgetToolbar(true); setMenuOpen(false); }}
              aria-label="Adicionar widgets"
              title="Adicionar widgets"
            >
              <Plus size={18} strokeWidth={2} />
              <span>Widgets</span>
            </button>
          <button
            className="app-fab-menu__item"
            onClick={() => { setShowBackground(true); setMenuOpen(false); }}
            aria-label="Personalizar aparência"
            title="Personalizar aparência"
          >
            <Palette size={18} strokeWidth={2} />
            <span>Aparência</span>
          </button>
          <button
            className="app-fab-menu__item"
            onClick={() => { setShowSettings(true); setMenuOpen(false); }}
            aria-label="Configurações"
            title="Configurações"
          >
            <Settings size={18} strokeWidth={2} aria-hidden="true" />
            <span>Configurações</span>
          </button>
        </div>
      </div>

      <main className="app-content">
        {!searchQuery.trim() && (
          <WidgetGrid
            widgets={widgets}
            openInNewTab={data.settings.openInNewTab !== false}
            onReorder={handleReorder}
            onEditWidget={setEditingWidget}
            onDeleteWidget={handleDeleteWidget}
            onDeleteLink={handleDeleteLink}
            onEditLink={handleEditLink}
            onAddLink={setAddingLinkWidget}
            onResizeWidget={handleResizeWidget}
            onAddWidget={handleStartAddWidget}
            onMoveLink={handleMoveLink}
            onAddTodo={handleAddTodo}
            onToggleTodo={handleToggleTodo}
            onUpdateTodo={handleUpdateTodo}
            onDeleteTodo={handleDeleteTodo}
            onMoveTodo={handleMoveTodo}
            isEditing={editModeEnabled && !searchQuery.trim()}
          />
        )}
      </main>

      {isAddingWidget && (
        <WidgetEditor
          linksOnly
          onSave={handleAddWidget}
          onClose={() => setIsAddingWidget(false)}
        />
      )}

      {editingWidget && (
        <WidgetEditor
          widget={editingWidget}
          onSave={handleUpdateWidget}
          onClose={() => setEditingWidget(null)}
        />
      )}

      {addingLinkWidget && (
        <LinkDialog
          widgetTitle={addingLinkWidget.title}
          onSave={(title, url, icon) => handleAddLink(addingLinkWidget.id, title, url, icon)}
          onClose={() => setAddingLinkWidget(null)}
        />
      )}

      {editingLinkData && (
        <LinkDialog
          widgetTitle={editingLinkData.widgetTitle}
          link={editingLinkData.link}
          onSave={(title, url, icon) => handleUpdateLink(editingLinkData.widgetId, editingLinkData.link.id, title, url, icon)}
          onClose={() => setEditingLink(null)}
        />
      )}

      {showBackground && (
        <BackgroundPanel
          settings={data.settings}
          onChange={handleSettingsChange}
          onClose={() => setShowBackground(false)}
        />
      )}

      {showSettings && (
        <SettingsPanel
          settings={data.settings}
          onChange={handleSettingsChange}
          onClose={() => setShowSettings(false)}
          onExport={handleExport}
          onImport={handleImport}
          onClearRecentSearches={handleClearRecentSearches}
        />
      )}

      {showWidgetToolbar && (
        <WidgetToolbar
          topWidgets={data.settings.topWidgets || []}
          onToggleWidget={handleToggleWidget}
          onAddWidget={handleAddWidgetFromToolbar}
          onCityChange={handleToolbarCityChange}
          onClose={() => setShowWidgetToolbar(false)}
        />
      )}

      <NewTabDialog
        open={showNewTabDialog}
        onSave={handleCreateBoard}
        onClose={() => setShowNewTabDialog(false)}
      />

      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title || ''}
        message={confirmState?.message || ''}
        danger={confirmState?.danger}
        confirmLabel={confirmState?.confirmLabel}
        onConfirm={confirmState?.onConfirm || (() => {})}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
