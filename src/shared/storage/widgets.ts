import type { AppData, Widget, WidgetType } from '@shared/types';
import { generateId } from '@shared/types/defaults';
import { t } from '@shared/i18n';
import { updateBoard, updateWidgetInBoard } from './index';

export function createWidget(type: WidgetType, title: string): Widget {
  const base = {
    id: generateId('widget'),
    type,
    title: title.trim() || defaultWidgetTitle(type),
    colSpan: 1,
    order: 0
  };

  switch (type) {
    case 'links':
      return { ...base, type: 'links', items: [] };
    case 'calendar':
      return { ...base, type: 'calendar' };
    case 'clock':
      return { ...base, type: 'clock' };
    case 'weather':
      return { ...base, type: 'weather', city: 'New York' };
    case 'todo':
      return { ...base, type: 'todo', items: [] };
  }
}

export function defaultWidgetTitle(type: WidgetType): string {
  switch (type) {
    case 'links':
      return t('defaults.linksWidget');
    case 'calendar':
      return t('defaults.calendarWidget');
    case 'clock':
      return t('defaults.clockWidget');
    case 'weather':
      return t('defaults.weatherWidget');
    case 'todo':
      return t('defaults.todoWidget');
  }
}

export function addWidget(data: AppData, boardId: string, widget: Widget): AppData {
  return updateBoard(data, boardId, (board) => {
    const maxOrder = board.widgets.reduce((max, w) => Math.max(max, w.order), -1);
    return { ...board, widgets: [...board.widgets, { ...widget, order: maxOrder + 1 }], updatedAt: Date.now() };
  });
}

export function deleteWidget(data: AppData, boardId: string, widgetId: string): AppData {
  return updateBoard(data, boardId, (board) => ({
    ...board,
    widgets: board.widgets.filter((w) => w.id !== widgetId),
    updatedAt: Date.now()
  }));
}

export function updateWidget(data: AppData, boardId: string, widgetId: string, updates: Partial<Omit<Widget, 'id' | 'type'>> & { title?: string; colSpan?: number; order?: number; height?: number; col?: number }): AppData {
  return updateWidgetInBoard(data, boardId, widgetId, (w) => ({ ...w, ...updates }));
}

export function moveWidgetOrder(data: AppData, boardId: string, fromIndex: number, toIndex: number): AppData {
  return {
    ...data,
    boards: data.boards.map((b) => {
      if (b.id !== boardId) return b;
      const sorted = [...b.widgets].sort((a, c) => a.order - c.order);
      const [moved] = sorted.splice(fromIndex, 1);
      sorted.splice(toIndex, 0, moved);
      const reordered = sorted.map((w, i) => ({ ...w, order: i }));
      return { ...b, widgets: reordered, updatedAt: Date.now() };
    })
  };
}

export function reorderWidgets(data: AppData, boardId: string, widgetIds: string[]): AppData {
  return {
    ...data,
    boards: data.boards.map((b) => {
      if (b.id !== boardId) return b;
      const map = new Map(b.widgets.map((w) => [w.id, w]));
      const reordered = widgetIds.map((id, i) => {
        const w = map.get(id);
        return w ? { ...w, order: i } : undefined;
      }).filter((w): w is Widget => !!w);
      return { ...b, widgets: reordered, updatedAt: Date.now() };
    })
  };
}

export function getWidgetById(data: AppData, boardId: string, widgetId: string): Widget | undefined {
  return data.boards.find((b) => b.id === boardId)?.widgets.find((w) => w.id === widgetId);
}

export function getWidgetsForBoard(data: AppData, boardId: string): Widget[] {
  const board = data.boards.find((b) => b.id === boardId);
  if (!board) return [];
  return [...board.widgets].sort((a, b) => a.order - b.order);
}
