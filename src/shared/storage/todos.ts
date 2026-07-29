import type { AppData, TodoItem } from '@shared/types';
import { generateId } from '@shared/types/defaults';
import { t } from '@shared/i18n';
import { updateWidgetInBoard } from './index';

export function createTodoItem(text: string): TodoItem {
  return {
    id: generateId('todo'),
    text: text.trim() || t('defaults.newNote'),
    done: false
  };
}

export function addTodoItem(data: AppData, boardId: string, widgetId: string, todo: TodoItem): AppData {
  return updateWidgetInBoard(data, boardId, widgetId, (w) =>
    w.type === 'todo' ? { ...w, items: [...w.items, todo] } : w
  );
}

export function deleteTodoItem(data: AppData, boardId: string, widgetId: string, todoId: string): AppData {
  return updateWidgetInBoard(data, boardId, widgetId, (w) =>
    w.type === 'todo' ? { ...w, items: w.items.filter((t) => t.id !== todoId) } : w
  );
}

export function updateTodoItem(
  data: AppData,
  boardId: string,
  widgetId: string,
  todoId: string,
  updates: Partial<TodoItem>
): AppData {
  return updateWidgetInBoard(data, boardId, widgetId, (w) =>
    w.type === 'todo'
      ? { ...w, items: w.items.map((t) => (t.id === todoId ? { ...t, ...updates } : t)) }
      : w
  );
}

export function toggleTodoItem(data: AppData, boardId: string, widgetId: string, todoId: string): AppData {
  return updateWidgetInBoard(data, boardId, widgetId, (w) =>
    w.type === 'todo'
      ? { ...w, items: w.items.map((t) => (t.id === todoId ? { ...t, done: !t.done } : t)) }
      : w
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
  return {
    ...data,
    boards: data.boards.map((b) => {
      if (b.id !== boardId) return b;

      let movedTodo: TodoItem | undefined;
      let originalIndex = -1;
      let widgets = b.widgets.map((w) => {
        if (w.id === fromWidgetId && w.type === 'todo') {
          const idx = w.items.findIndex((t) => t.id === todoId);
          if (idx !== -1) {
            originalIndex = idx;
            movedTodo = w.items[idx];
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
            return { ...w, items };
          }
          return w;
        });
      }

      return { ...b, widgets, updatedAt: Date.now() };
    })
  };
}
