import type { ThemeConfig, WallpaperSetting } from '@shared/types';
import { getBackgroundBlob } from '@shared/storage/backgrounds';

function parseHex(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return [r, g, b];
  }
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return [r, g, b];
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToRgb(hex: string): string {
  const [r, g, b] = parseHex(hex);
  return `${r}, ${g}, ${b}`;
}

function adjustLightness(hex: string, factor: number): string {
  const [r, g, b] = parseHex(hex);
  const newR = Math.min(255, Math.max(0, r + (255 - r) * factor));
  const newG = Math.min(255, Math.max(0, g + (255 - g) * factor));
  const newB = Math.min(255, Math.max(0, b + (255 - b) * factor));
  return rgbToHex(newR, newG, newB);
}

function extractColorsFromGradient(gradient: string): { primaryColor: string; boardColor: string } {
  const colorRegex = /#(?:[0-9a-fA-F]{3}){1,2}\b|rgba?\([^)]+\)/g;
  const matches = gradient.match(colorRegex);
  if (!matches || matches.length === 0) {
    return { primaryColor: '#4f46e5', boardColor: '#ffffff' };
  }
  const primaryColor = matches[0];
  const last = matches[matches.length - 1];
  const boardColor = adjustLightness(last, 0.6);
  return { primaryColor, boardColor };
}

function extractColorsFromSolid(solid: string): { primaryColor: string; boardColor: string } {
  const primaryColor = solid;
  const isDark = isDarkColor(primaryColor);
  const boardColor = isDark ? adjustLightness(primaryColor, 0.3) : adjustLightness(primaryColor, 0.85);
  return { primaryColor, boardColor };
}

export function isDarkColor(hex: string): boolean {
  const [r, g, b] = parseHex(hex);
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance < 128;
}

export function getRgbString(hex: string): string {
  return hexToRgb(hex);
}

export function getContrastText(hex: string): string {
  return isDarkColor(hex) ? '#f8fafc' : '#1e293b';
}

function extractDominantColorFromImage(imageUrl: string): Promise<{ primaryColor: string; boardColor: string }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const SIZE = 64;
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({ primaryColor: '#4f46e5', boardColor: '#ffffff' });
        return;
      }
      ctx.drawImage(img, 0, 0, SIZE, SIZE);
      const imageData = ctx.getImageData(0, 0, SIZE, SIZE);
      const data = imageData.data;

      const colorCounts: Record<string, number> = {};
      let maxCount = 0;
      let dominantColor = '#4f46e5';

      for (let i = 0; i < data.length; i += 16) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];
        if (a < 128) continue;
        const hex = rgbToHex(
          Math.round(r / 32) * 32,
          Math.round(g / 32) * 32,
          Math.round(b / 32) * 32
        );
        colorCounts[hex] = (colorCounts[hex] || 0) + 1;
        if (colorCounts[hex] > maxCount) {
          maxCount = colorCounts[hex];
          dominantColor = hex;
        }
      }

      const isDark = isDarkColor(dominantColor);
      const boardColor = isDark
        ? adjustLightness(dominantColor, 0.4)
        : adjustLightness(dominantColor, 0.85);

      resolve({ primaryColor: dominantColor, boardColor });
    };
    img.onerror = () => {
      resolve({ primaryColor: '#4f46e5', boardColor: '#ffffff' });
    };
    img.src = imageUrl;
  });
}

export async function extractColorsFromWallpaper(
  wallpaper: WallpaperSetting,
  isDark: boolean
): Promise<{ primaryColor: string; boardColor: string }> {
  const { type, value } = wallpaper;

  if (type === 'gradient') {
    return extractColorsFromGradient(value);
  }

  if (type === 'solid') {
    return extractColorsFromSolid(value);
  }

  if (type === 'url') {
    try {
      return await extractDominantColorFromImage(value);
    } catch {
      return { primaryColor: isDark ? '#818cf8' : '#4f46e5', boardColor: isDark ? '#1e293b' : '#ffffff' };
    }
  }

  if (type === 'asset') {
    if (wallpaper.mediaType === 'video') {
      return { primaryColor: isDark ? '#818cf8' : '#4f46e5', boardColor: isDark ? '#1e293b' : '#ffffff' };
    }

    try {
      const blob = await getBackgroundBlob(value);
      if (!blob) throw new Error('Background asset not found');
      const objectUrl = URL.createObjectURL(blob);
      try {
        return await extractDominantColorFromImage(objectUrl);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    } catch {
      return { primaryColor: isDark ? '#818cf8' : '#4f46e5', boardColor: isDark ? '#1e293b' : '#ffffff' };
    }
  }

  return { primaryColor: isDark ? '#818cf8' : '#4f46e5', boardColor: isDark ? '#1e293b' : '#ffffff' };
}

export function computeThemeVariables(theme: ThemeConfig, isDark: boolean): Record<string, string> {
  const primaryRgb = getRgbString(theme.primaryColor);
  const accentHover = isDarkColor(theme.primaryColor)
    ? adjustLightness(theme.primaryColor, 0.2)
    : adjustLightness(theme.primaryColor, -0.1);

  const boardRgb = getRgbString(theme.boardColor);
  const boardSolid = theme.boardColor;
  const useLightText = isDark || isDarkColor(boardSolid);

  return {
    '--accent': theme.primaryColor,
    '--accent-rgb': primaryRgb,
    '--accent-hover': accentHover,
    '--bg-surface': `rgba(${boardRgb}, ${theme.boardOpacity})`,
    '--bg-surface-solid': boardSolid,
    '--bg-surface-hover': `rgba(${boardRgb}, ${Math.min(1, theme.boardOpacity + 0.12)})`,
    '--bg-hover': `rgba(${boardRgb}, ${isDark ? 0.08 : 0.12})`,
    '--bg-active': `rgba(${boardRgb}, ${isDark ? 0.12 : 0.18})`,
    '--border': `rgba(${boardRgb}, ${isDark ? 0.12 : 0.2})`,
    '--surface-blur': `${theme.boardBlur}px`,
    '--shadow-accent': `rgba(${primaryRgb}, 0.15)`,
    '--text-primary': useLightText ? '#f8fafc' : '#1e293b',
    '--text-secondary': useLightText ? '#cbd5e1' : '#475569',
    '--text-muted': useLightText ? '#94a3b8' : '#64748b'
  };
}
