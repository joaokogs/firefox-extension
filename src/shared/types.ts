export type {
  WidgetType,
  LinkItem,
  BaseWidget,
  LinksWidget,
  CalendarWidget,
  ClockWidget,
  WeatherWidget,
  TodoItem,
  TodoWidget,
  Widget,
  Board,
  Workspace,
  ThemeConfig,
  AppSettings,
  UploadedBackground,
  StoredBackground,
  WallpaperSetting,
  TopWidgetType,
  TopWidgetConfig,
  AppData,
  SyncMeta,
} from './types/index';

export {
  DEFAULT_THEME,
  DARK_THEME,
  DEFAULT_WALLPAPERS,
  LOCAL_ONLY_SETTINGS_KEYS,
} from './types/constants';

export {
  generateId,
  generateWorkspaceId,
  INITIAL_SAMPLE_WORKSPACES,
  getDefaultData,
} from './types/defaults';
