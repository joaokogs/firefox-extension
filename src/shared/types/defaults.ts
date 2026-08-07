import type { Workspace, AppData } from './index';
import { DEFAULT_WALLPAPERS, DEFAULT_THEME } from './constants';

export function generateId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function generateWorkspaceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.random() * 16 | 0;
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export const INITIAL_SAMPLE_WORKSPACES: Workspace[] = [
  {
    id: generateWorkspaceId(),
    title: 'Home',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    widgets: [
      {
        id: generateId('widget'),
        type: 'links',
        title: 'Prismi',
        colSpan: 1,
        order: 0,
        items: [
          {
            id: generateId('link'),
            title: 'Prismi',
            url: 'https://prismi.vercel.app/',
            icon: 'fa:star',
            createdAt: Date.now(),
            updatedAt: Date.now()
          },
          {
            id: generateId('link'),
            title: 'Prismi Repository',
            url: 'https://github.com/joaokogs/prismi',
            icon: 'fab:github',
            createdAt: Date.now(),
            updatedAt: Date.now()
          }
        ],
        col: 0,
        height: 163
      },
      {
        id: generateId('widget'),
        type: 'todo',
        title: 'Todo',
        colSpan: 1,
        order: 0,
        items: [
          {
            id: generateId('todo'),
            text: 'A reminder to star the repository 🌟',
            done: false,
            createdAt: Date.now(),
            updatedAt: Date.now()
          }
        ],
        height: 406,
        col: 3
      },
      {
        id: generateId('widget'),
        type: 'calendar',
        title: 'Calendar',
        colSpan: 1,
        order: 0,
        col: 4
      }
    ]
  }
];

export function getDefaultData(): AppData {
  return {
    workspaces: INITIAL_SAMPLE_WORKSPACES,
    settings: {
      theme: 'light',
      wallpaper: DEFAULT_WALLPAPERS[0],
      topWidgets: [
        { type: 'weather', city: 'New York' },
        { type: 'clock' },
        { type: 'search' }
      ],
      themeConfig: {
        primaryColor: DEFAULT_THEME.primaryColor,
        boardColor: DEFAULT_THEME.boardColor,
        boardOpacity: DEFAULT_THEME.boardOpacity,
        boardBlur: DEFAULT_THEME.boardBlur,
      },
      editMode: true,
      openInNewTab: true,
      lastBoardId: INITIAL_SAMPLE_WORKSPACES[0].id,
      locale: 'en'
    },
    installedAt: Date.now()
  };
}
