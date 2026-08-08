import type { ThemeConfig, WallpaperSetting, SearchEngine, AppSettings } from './index';

export const LOCAL_ONLY_SETTINGS_KEYS: (keyof AppSettings)[] = [
  'wallpaper',
  'uploadedBackgrounds',
  'lastBoardId',
  'openInNewTab',
  'recentSearches',
  'editMode',
  'locale',
];

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

export const SEARCH_ENGINES: { id: SearchEngine; name: string; url: string; icon: string; autocomplete: string }[] = [
  { id: 'google', name: 'Google', url: 'https://www.google.com/search?q=', icon: 'https://www.google.com/favicon.ico', autocomplete: 'https://suggestqueries.google.com/complete/search?client=firefox&q=' },
  { id: 'yahoo', name: 'Yahoo', url: 'https://search.yahoo.com/search?p=', icon: 'https://s.yimg.com/rz/l/favicon.ico', autocomplete: 'https://suggestqueries.google.com/complete/search?client=firefox&q=' },
  { id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q=', icon: 'https://www.bing.com/favicon.ico', autocomplete: 'https://api.bing.com/osjson.aspx?query=' },
  { id: 'duckduckgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=', icon: 'https://duckduckgo.com/favicon.ico', autocomplete: 'https://duckduckgo.com/ac/?q=' }
];

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
