import type { AppData, LinkItem } from '@shared/types';
import { generateId } from '@shared/types/defaults';
import { t } from '@shared/i18n';
import { normalizeUrl } from '@shared/utils/url';
import { updateWidgetInBoard } from './index';

export function createLink(title: string, url: string, icon?: string | null): LinkItem {
  const now = Date.now();
  return {
    id: generateId('link'),
    title: title.trim() || t('defaults.newLink'),
    url: normalizeUrl(url),
    icon: icon || undefined,
    createdAt: now,
    updatedAt: now
  };
}

export function addLink(data: AppData, boardId: string, widgetId: string, link: LinkItem): AppData {
  return updateWidgetInBoard(
    data,
    boardId,
    widgetId,
    (w) => w.type === 'links' ? { ...w, items: [...w.items, link] } : w,
    false,
  );
}

export function deleteLink(data: AppData, boardId: string, widgetId: string, linkId: string): AppData {
  const now = Date.now();
  const tombstoneKey = `${boardId}/${widgetId}/${linkId}`;
  return {
    ...updateWidgetInBoard(
      data,
      boardId,
      widgetId,
      (w) => w.type === 'links' ? { ...w, items: w.items.filter((l) => l.id !== linkId) } : w,
      false,
    ),
    _tombstones: {
      ...data._tombstones,
      deletedBoards: { ...data._tombstones?.deletedBoards },
      deletedWidgets: { ...data._tombstones?.deletedWidgets },
      deletedLinks: { ...data._tombstones?.deletedLinks, [tombstoneKey]: now },
      deletedTodos: { ...data._tombstones?.deletedTodos },
    }
  };
}

export function updateLink(
  data: AppData,
  boardId: string,
  widgetId: string,
  linkId: string,
  updates: Partial<LinkItem>
): AppData {
  return updateWidgetInBoard(
    data,
    boardId,
    widgetId,
    (w) => w.type === 'links'
      ? { ...w, items: w.items.map((l) => (l.id === linkId ? { ...l, ...updates, updatedAt: Date.now() } : l)) }
      : w,
    false,
  );
}

export function searchLinks(data: AppData, query: string): LinkItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const matches: LinkItem[] = [];
  for (const board of data.boards) {
    for (const widget of board.widgets) {
      if (widget.type !== 'links') continue;
      for (const item of widget.items) {
        if (item.title.toLowerCase().includes(q) || item.url.toLowerCase().includes(q)) {
          matches.push(item);
        }
      }
    }
  }
  return matches;
}

export function moveLink(
  data: AppData,
  boardId: string,
  fromWidgetId: string,
  toWidgetId: string,
  linkId: string,
  toIndex: number
): AppData {
  const now = Date.now();
  let moved = false;
  const next = {
    ...data,
    boards: data.boards.map((b) => {
      if (b.id !== boardId) return b;

      let movedLink: LinkItem | undefined;
      let originalIndex = -1;
      let widgets = b.widgets.map((w) => {
        if (w.id === fromWidgetId && w.type === 'links') {
          const idx = w.items.findIndex((l) => l.id === linkId);
          if (idx !== -1) {
            originalIndex = idx;
            movedLink = { ...w.items[idx], updatedAt: now };
            return { ...w, items: w.items.filter((l) => l.id !== linkId) };
          }
        }
        return w;
      });

      if (movedLink) {
        let adjustedIndex = toIndex;
        if (fromWidgetId === toWidgetId && originalIndex < toIndex) {
          adjustedIndex = toIndex - 1;
        }
        widgets = widgets.map((w) => {
          if (w.id === toWidgetId && w.type === 'links') {
            const items = [...w.items];
            const clampedIndex = Math.min(adjustedIndex, items.length);
            items.splice(clampedIndex, 0, movedLink!);
            moved = true;
            return { ...w, items };
          }
          return w;
        });
      }

      return { ...b, widgets, updatedAt: Date.now() };
    })
  };

  if (!moved) return data;
  if (fromWidgetId === toWidgetId) return next;

  return {
    ...next,
    _tombstones: {
      ...data._tombstones,
      deletedBoards: { ...data._tombstones?.deletedBoards },
      deletedWidgets: { ...data._tombstones?.deletedWidgets },
      deletedLinks: {
        ...data._tombstones?.deletedLinks,
        [`${boardId}/${fromWidgetId}/${linkId}`]: now,
      },
      deletedTodos: { ...data._tombstones?.deletedTodos },
    },
  };
}
