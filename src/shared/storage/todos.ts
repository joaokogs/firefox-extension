import type { AppData, TodoItem } from '@shared/types';
import { generateId } from '@shared/types/defaults';
import { t } from '@shared/i18n';
import { updateWidgetInWorkspace } from './index';

export function createTodoItem(text: string): TodoItem {
  const now = Date.now();
  return {
    id: generateId('todo'),
    text: text.trim() || t('defaults.newNote'),
    done: false,
    createdAt: now,
    updatedAt: now
  };
}

export function addTodoItem(data: AppData, boardId: string, widgetId: string, todo: TodoItem): AppData {
  return updateWidgetInWorkspace(
    data,
    boardId,
    widgetId,
    (w) => w.type === 'todo' ? { ...w, items: [...w.items, todo] } : w,
    true,
  );
}

export function deleteTodoItem(data: AppData, boardId: string, widgetId: string, todoId: string): AppData {
  return updateWidgetInWorkspace(
    data,
    boardId,
    widgetId,
    (w) => w.type === 'todo' ? { ...w, items: w.items.filter((t) => t.id !== todoId) } : w,
    true,
  );
}

export function updateTodoItem(
  data: AppData,
  boardId: string,
  widgetId: string,
  todoId: string,
  updates: Partial<TodoItem>
): AppData {
  return updateWidgetInWorkspace(
    data,
    boardId,
    widgetId,
    (w) => w.type === 'todo'
      ? { ...w, items: w.items.map((t) => (t.id === todoId ? { ...t, ...updates, updatedAt: Date.now() } : t)) }
      : w,
    true,
  );
}

export function toggleTodoItem(data: AppData, boardId: string, widgetId: string, todoId: string): AppData {
  return updateWidgetInWorkspace(
    data,
    boardId,
    widgetId,
    (w) => w.type === 'todo'
      ? { ...w, items: w.items.map((t) => (t.id === todoId ? { ...t, done: !t.done, updatedAt: Date.now() } : t)) }
      : w,
    true,
  );
}

export function moveTodoItem(
  data: AppData,
  boardId: string,
  fromWidgetId: string,
  toWidgetId: string,
  todoId: string,
  toIndex: number
): AppData {
  const now = Date.now();
  let moved = false;
  const next = {
    ...data,
    workspaces: data.workspaces.map((workspace) => {
      if (workspace.id !== boardId || workspace.deletedAt) return workspace;

      let movedTodo: TodoItem | undefined;
      let originalIndex = -1;
      let widgets = workspace.widgets.map((w) => {
        if (w.id === fromWidgetId && w.type === 'todo') {
          const idx = w.items.findIndex((t) => t.id === todoId);
          if (idx !== -1) {
            originalIndex = idx;
            movedTodo = { ...w.items[idx], updatedAt: now };
            return { ...w, items: w.items.filter((t) => t.id !== todoId) };
          }
        }
        return w;
      });

      if (movedTodo) {
        let adjustedIndex = toIndex;
        if (fromWidgetId === toWidgetId && originalIndex < toIndex) {
          adjustedIndex = toIndex - 1;
        }
        widgets = widgets.map((w) => {
          if (w.id === toWidgetId && w.type === 'todo') {
            const items = [...w.items];
            const clampedIndex = Math.min(adjustedIndex, items.length);
            items.splice(clampedIndex, 0, movedTodo!);
            moved = true;
            return { ...w, items };
          }
          return w;
        });
      }

      return { ...workspace, widgets, updatedAt: Date.now() };
    })
  };

  if (!moved) return data;
  return next;
}
