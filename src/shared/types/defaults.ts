import type { Board, AppData } from './index';
import { DEFAULT_WALLPAPERS } from './constants';

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
        type: 'links',
        title: 'Prismi',
        colSpan: 1,
        order: 0,
        items: [
          {
            id: generateId('link'),
            title: 'Prismi',
            url: 'https://prismi.vercel.app/',
            icon: 'fa:star'
          },
          {
            id: generateId('link'),
            title: 'Prismi Repository',
            url: 'https://github.com/joaokogs/prismi',
            icon: 'fab:github'
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
            done: false
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
      lastBoardId: 'board-home',
      locale: 'en'
    },
    installedAt: Date.now()
  };
}
