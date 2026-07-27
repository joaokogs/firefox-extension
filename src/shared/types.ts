/**
 * Shared type definitions for the Luma extension.
 * Keep this file dependency-free so it can be imported anywhere.
 */

export type WidgetType = 'links' | 'calendar' | 'clock' | 'weather' | 'todo';

export interface LinkItem {
  id: string;
  title: string;
  url: string;
  icon?: string;
  favicon?: string;
}

export interface BaseWidget {
  id: string;
  type: WidgetType;
  title: string;
  colSpan: number; // 1 or 2 grid columns
  order: number;
  height?: number; // fixed height in pixels; if omitted, auto
  col?: number; // target column index (0-based); if omitted, falls back to column 0
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

export interface ThemeConfig {
  primaryColor: string;
  boardColor: string;
  boardOpacity: number;
  boardBlur: number;
  derivedFromWallpaper: boolean;
}

export const DEFAULT_THEME: ThemeConfig = {
  primaryColor: '#4a90e2',
  boardColor: '#eef6fb',
  boardOpacity: 0.78,
  boardBlur: 16,
  derivedFromWallpaper: true
};

export const DARK_THEME: ThemeConfig = {
  primaryColor: '#818cf8',
  boardColor: '#1e293b',
  boardOpacity: 0.72,
  boardBlur: 16,
  derivedFromWallpaper: true
};

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  wallpaper: WallpaperSetting;
  lastBoardId?: string;
  topWidgets?: TopWidgetConfig[];
  editMode?: boolean;
  openInNewTab?: boolean;
  recentSearches?: string[];
  uploadedBackgrounds?: string[];
}

export interface WallpaperSetting {
  type: 'gradient' | 'url' | 'solid';
  value: string;
}

export type TopWidgetType = 'clock' | 'weather' | 'search';

export type SearchEngine = 'google' | 'yahoo' | 'bing' | 'duckduckgo';

export const SEARCH_ENGINES: { id: SearchEngine; name: string; url: string; icon: string; autocomplete: string }[] = [
  { id: 'google', name: 'Google', url: 'https://www.google.com/search?q=', icon: 'https://www.google.com/favicon.ico', autocomplete: 'https://suggestqueries.google.com/complete/search?client=firefox&q=' },
  { id: 'yahoo', name: 'Yahoo', url: 'https://search.yahoo.com/search?p=', icon: 'https://s.yimg.com/rz/l/favicon.ico', autocomplete: 'https://suggestqueries.google.com/complete/search?client=firefox&q=' },
  { id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q=', icon: 'https://www.bing.com/favicon.ico', autocomplete: 'https://api.bing.com/osjson.aspx?query=' },
  { id: 'duckduckgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=', icon: 'https://duckduckgo.com/favicon.ico', autocomplete: 'https://duckduckgo.com/ac/?q=' }
];

export interface TopWidgetConfig {
  type: TopWidgetType;
  city?: string;
  timezone?: string;
  label?: string;
  searchEngine?: SearchEngine;
}

export interface AppData {
  boards: Board[];
  settings: AppSettings;
  installedAt: number;
}

export const DEFAULT_WALLPAPERS: WallpaperSetting[] = [
  { type: 'gradient', value: 'linear-gradient(160deg, #4a90e2 0%, #7bb7f0 40%, #a8d5f0 70%, #d4e9f7 100%)' },
  { type: 'gradient', value: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
  { type: 'gradient', value: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
  { type: 'gradient', value: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' },
  { type: 'gradient', value: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' },
  { type: 'gradient', value: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)' },
  { type: 'gradient', value: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)' },
  { type: 'gradient', value: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' },
  { type: 'solid', value: '#f8fafc' },
  { type: 'solid', value: '#0f172a' }
];

export function generateId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export const INITIAL_SAMPLE_BOARDS: Board[] = [
  {
    id: 'board-home',
    title: 'Home',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    widgets: [
      {
        id: generateId('widget'),
        type: 'todo',
        title: 'Bloco de Notas',
        colSpan: 1,
        order: 0,
        items: [],
        height: 381,
        col: 2
      },
      {
        id: generateId('widget'),
        type: 'calendar',
        title: 'Calendar',
        colSpan: 1,
        order: 0,
        col: 3
      },
      {
        id: generateId('widget'),
        type: 'links',
        title: 'Luma',
        colSpan: 1,
        order: 1,
        items: [
          {
            id: generateId('link'),
            title: 'Luma',
            url: 'https://luma-page-sooty.vercel.app/',
            icon: 'fa:heart'
          },
          {
            id: generateId('link'),
            title: 'Luma Repository',
            url: 'https://github.com/joaokogs/luma-extension',
            icon: 'fab:github'
          }
        ],
        col: 0,
        height: 163
      }
    ]
  }
];

export function getDefaultData(): AppData {
  return {
    boards: INITIAL_SAMPLE_BOARDS,
    settings: {
      theme: 'light',
      wallpaper: DEFAULT_WALLPAPERS[0],
      topWidgets: [
        { type: 'weather', city: 'New York' },
        { type: 'clock' },
        { type: 'search' }
      ],
      editMode: true,
      openInNewTab: true,
      lastBoardId: 'board-home'
    },
    installedAt: Date.now()
  };
}
