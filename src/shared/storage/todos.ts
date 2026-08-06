import type { AppData, TodoItem } from '@shared/types';
import { generateId } from '@shared/types/defaults';
import { t } from '@shared/i18n';
import { updateWidgetInBoard } from './index';

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
  return updateWidgetInBoard(
    data,
    boardId,
    widgetId,
    (w) => w.type === 'todo' ? { ...w, items: [...w.items, todo] } : w,
    false,
  );
}

export function deleteTodoItem(data: AppData, boardId: string, widgetId: string, todoId: string): AppData {
  const now = Date.now();
  const tombstoneKey = `${boardId}/${widgetId}/${todoId}`;
  return {
    ...updateWidgetInBoard(
      data,
      boardId,
      widgetId,
      (w) => w.type === 'todo' ? { ...w, items: w.items.filter((t) => t.id !== todoId) } : w,
      false,
    ),
    _tombstones: {
      ...data._tombstones,
      deletedBoards: { ...data._tombstones?.deletedBoards },
      deletedWidgets: { ...data._tombstones?.deletedWidgets },
      deletedLinks: { ...data._tombstones?.deletedLinks },
      deletedTodos: { ...data._tombstones?.deletedTodos, [tombstoneKey]: now },
    }
  };
}

export function updateTodoItem(
  data: AppData,
  boardId: string,
  widgetId: string,
  todoId: string,
  updates: Partial<TodoItem>
): AppData {
  return updateWidgetInBoard(
    data,
    boardId,
    widgetId,
    (w) => w.type === 'todo'
      ? { ...w, items: w.items.map((t) => (t.id === todoId ? { ...t, ...updates, updatedAt: Date.now() } : t)) }
      : w,
    false,
  );
}

export function toggleTodoItem(data: AppData, boardId: string, widgetId: string, todoId: string): AppData {
  return updateWidgetInBoard(
    data,
    boardId,
    widgetId,
    (w) => w.type === 'todo'
      ? { ...w, items: w.items.map((t) => (t.id === todoId ? { ...t, done: !t.done, updatedAt: Date.now() } : t)) }
      : w,
    false,
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
    boards: data.boards.map((b) => {
      if (b.id !== boardId) return b;

      let movedTodo: TodoItem | undefined;
      let originalIndex = -1;
      let widgets = b.widgets.map((w) => {
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
      deletedLinks: { ...data._tombstones?.deletedLinks },
      deletedTodos: {
        ...data._tombstones?.deletedTodos,
        [`${boardId}/${fromWidgetId}/${todoId}`]: now,
      },
    },
  };
}
