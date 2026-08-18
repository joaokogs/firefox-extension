import type { ThemeConfig, WallpaperSetting, AppSettings } from './index';

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
