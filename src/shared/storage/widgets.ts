import type { AppData, Widget, WidgetType, LinksWidget, CalendarWidget, ClockWidget, WeatherWidget, TodoWidget } from '@shared/types';
import { generateId } from '@shared/types/defaults';
import { t } from '@shared/i18n';
import { getWorkspaceById, updateWorkspace, updateWidgetInWorkspace } from './index';

export function createWidget(type: 'links', title: string): LinksWidget;
export function createWidget(type: 'calendar', title: string): CalendarWidget;
export function createWidget(type: 'clock', title: string): ClockWidget;
export function createWidget(type: 'weather', title: string): WeatherWidget;
export function createWidget(type: 'todo', title: string): TodoWidget;
export function createWidget(type: WidgetType, title: string): Widget;
export function createWidget(type: WidgetType, title: string): Widget {
  const base = {
    id: generateId('widget'),
    type,
    title: title.trim() || defaultWidgetTitle(type),
    colSpan: 1,
    order: 0,
    updatedAt: Date.now()
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
  return updateWorkspace(data, boardId, (workspace) => {
    const maxOrder = workspace.widgets.reduce((max, w) => Math.max(max, w.order), -1);
    return { ...workspace, widgets: [...workspace.widgets, { ...widget, order: maxOrder + 1 }], updatedAt: Date.now() };
  });
}

export function deleteWidget(data: AppData, boardId: string, widgetId: string): AppData {
  return updateWorkspace(data, boardId, (workspace) => ({
    ...workspace,
    widgets: workspace.widgets.filter((w) => w.id !== widgetId),
    updatedAt: Date.now()
  }));
}

export function updateWidget(data: AppData, boardId: string, widgetId: string, updates: Partial<Omit<Widget, 'id' | 'type'>> & { title?: string; colSpan?: number; order?: number; height?: number; col?: number }): AppData {
  return updateWidgetInWorkspace(data, boardId, widgetId, (w) => ({ ...w, ...updates, updatedAt: Date.now() }));
}

export function moveWidgetOrder(data: AppData, boardId: string, fromIndex: number, toIndex: number): AppData {
  const workspace = getWorkspaceById(data, boardId);
  if (!workspace || workspace.deletedAt) return data;
  const sorted = [...workspace.widgets].sort((a, c) => a.order - c.order);
  const [moved] = sorted.splice(fromIndex, 1);
  sorted.splice(toIndex, 0, moved);
  const reordered = sorted.map((w, i) => ({ ...w, order: i, updatedAt: Date.now() }));
  return updateWorkspace(data, boardId, (w) => ({ ...w, widgets: reordered, updatedAt: Date.now() }));
}

export function reorderWidgets(data: AppData, boardId: string, widgetIds: string[]): AppData {
  const workspace = getWorkspaceById(data, boardId);
  if (!workspace || workspace.deletedAt) return data;
  const map = new Map(workspace.widgets.map((w) => [w.id, w]));
  const reordered: Widget[] = [];
  for (const [i, id] of widgetIds.entries()) {
    const w = map.get(id);
    if (w) reordered.push({ ...w, order: i, updatedAt: Date.now() });
  }
  return updateWorkspace(data, boardId, (w) => ({ ...w, widgets: reordered, updatedAt: Date.now() }));
}

export function getWidgetById(data: AppData, boardId: string, widgetId: string): Widget | undefined {
  const workspace = getWorkspaceById(data, boardId);
  if (!workspace || workspace.deletedAt) return undefined;
  return workspace.widgets.find((w) => w.id === widgetId);
}

export function getWidgetsForBoard(data: AppData, boardId: string): Widget[] {
  const workspace = getWorkspaceById(data, boardId);
  if (!workspace || workspace.deletedAt) return [];
  return [...workspace.widgets].sort((a, b) => a.order - b.order);
}
