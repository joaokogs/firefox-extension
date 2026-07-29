import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ThemeConfig, WallpaperSetting } from '@shared/types';
import { DEFAULT_THEME } from '@shared/types/constants';
import { extractColorsFromWallpaper } from '@shared/theme';

export interface ThemeState {
  themeMode: 'light' | 'dark' | 'system';
  themeConfig: ThemeConfig;
  setThemeMode: (mode: 'light' | 'dark' | 'system') => void;
  updateThemeConfig: (config: Partial<ThemeConfig>) => void;
  updateColors: (primaryColor: string, boardColor: string) => void;
  applyFromWallpaper: (wallpaper: WallpaperSetting, isDark: boolean) => Promise<void>;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      themeMode: 'system',
      themeConfig: { ...DEFAULT_THEME },

      setThemeMode: (themeMode) => set({ themeMode }),

      updateThemeConfig: (partial) =>
        set((state) => ({
          themeConfig: { ...state.themeConfig, ...partial, derivedFromWallpaper: false }
        })),

      updateColors: (primaryColor, boardColor) =>
        set((state) => ({
          themeConfig: {
            ...state.themeConfig,
            primaryColor,
            boardColor,
            derivedFromWallpaper: false
          }
        })),

      applyFromWallpaper: async (wallpaper, isDark) => {
        const { primaryColor, boardColor } = await extractColorsFromWallpaper(wallpaper, isDark);
        set((state) => ({
          themeConfig: {
            ...state.themeConfig,
            primaryColor,
            boardColor,
            derivedFromWallpaper: true
          }
        }));
      }
    }),
    {
      name: 'luma-theme'
    }
  )
);
