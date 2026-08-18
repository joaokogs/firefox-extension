export type WidgetType = 'links' | 'calendar' | 'clock' | 'weather' | 'todo';

export interface LinkItem {
  id: string;
  title: string;
  url: string;
  icon?: string;
  favicon?: string;
  createdAt: number;
  updatedAt: number;
}

export interface BaseWidget {
  id: string;
  type: WidgetType;
  title: string;
  colSpan: number;
  order: number;
  height?: number;
  col?: number;
  layoutColumns?: number;
  updatedAt?: number;
}

export interface LinksWidget extends BaseWidget {
  type: 'links';
  items: LinkItem[];
}

export interface CalendarWidget extends BaseWidget {
  type: 'calendar';
}

export interface ClockWidget extends BaseWidget {
  type: 'clock';
  timezone?: string;
  label?: string;
}

export interface WeatherWidget extends BaseWidget {
  type: 'weather';
  city?: string;
}

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface TodoWidget extends BaseWidget {
  type: 'todo';
  items: TodoItem[];
}

export type Widget = LinksWidget | CalendarWidget | ClockWidget | WeatherWidget | TodoWidget;

export interface Board {
  id: string;
  title: string;
  widgets: Widget[];
  createdAt: number;
  updatedAt: number;
}

export interface Workspace extends Board {
  position?: number;
  deletedAt?: number;
}

export interface ThemeConfig {
  primaryColor: string;
  boardColor: string;
  boardOpacity: number;
  boardBlur: number;
  derivedFromWallpaper: boolean;
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  wallpaper: WallpaperSetting;
  themeConfig?: Omit<ThemeConfig, 'derivedFromWallpaper'>;
  lastBoardId?: string;
  topWidgets?: TopWidgetConfig[];
  editMode?: boolean;
  openInNewTab?: boolean;
  recentSearches?: string[];
  uploadedBackgrounds?: StoredBackground[];
  locale?: string;
}

export interface UploadedBackground {
  id: string;
  kind: 'image' | 'video';
  mimeType: string;
  name: string;
}

export type StoredBackground = UploadedBackground | string;

export interface WallpaperSetting {
  type: 'gradient' | 'url' | 'solid' | 'asset';
  value: string;
  mediaType?: 'image' | 'video';
}

export type TopWidgetType = 'clock' | 'weather' | 'search';

export interface TopWidgetConfig {
  type: TopWidgetType;
  city?: string;
  timezone?: string;
  label?: string;
}

export interface AppData {
  workspaces: Workspace[];
  settings: AppSettings;
  installedAt: number;
}

export interface SyncMeta {
  owner?: string;
  lastSyncAt?: number;
  settingsUpdatedAt?: number;
  workspaceRevisions: Record<string, number>;
}
