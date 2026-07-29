import { useEffect, useRef, useState } from 'preact/hooks';
import type { TodoItem, TodoWidget } from '@shared/types';
import { Check, Plus, Pencil, Trash2, X, GripVertical } from 'lucide-preact';
import { useI18n } from '@shared/i18n';

export interface TodoDragState {
  todoId: string | null;
  fromWidgetId: string | null;
}

interface DropTarget {
  todoId: string | null;
  position: 'before' | 'after';
}

interface TodoWidgetViewProps {
  widget: TodoWidget;
  todoDrag?: TodoDragState;
  onAddTodo?: (text: string) => void;
  onToggleTodo?: (todoId: string) => void;
  onUpdateTodo?: (todoId: string, text: string) => void;
  onDeleteTodo?: (todoId: string) => void;
  onTodoDragStart?: (e: DragEvent, todoId: string) => void;
  onTodoDragEnd?: () => void;
  onTodoDrop?: (targetTodoId: string | null, position: 'before' | 'after') => void;
}

export function TodoWidgetView({
  widget,
  todoDrag,
  onAddTodo,
  onToggleTodo,
  onUpdateTodo,
  onDeleteTodo,
  onTodoDragStart,
  onTodoDragEnd,
  onTodoDrop
}: TodoWidgetViewProps) {
  const [newText, setNewText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  useEffect(() => {
    if (!todoDrag?.todoId) {
      setDropTarget(null);
    }
  }, [todoDrag?.todoId]);

  const handleAdd = () => {
    const text = newText.trim();
    if (!text) return;
    onAddTodo?.(text);
    setNewText('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') handleAdd();
  };

  const handleEditKeyDown = (e: KeyboardEvent, todoId: string) => {
    if (e.key === 'Enter') {
      saveEdit(todoId);
    } else if (e.key === 'Escape') {
      setEditingId(null);
    }
  };

  const startEdit = (todo: TodoItem) => {
    setEditingId(todo.id);
    setEditText(todo.text);
  };

  const saveEdit = (todoId: string) => {
    const text = editText.trim();
    if (text) {
      onUpdateTodo?.(todoId, text);
    }
    setEditingId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const getDropPosition = (clientY: number): DropTarget | null => {
    if (!listRef.current) return null;
    const items = listRef.current.querySelectorAll<HTMLLIElement>('.todo-widget__item');

    if (items.length === 0) {
      return { todoId: null, position: 'before' };
    }

    const firstRect = items[0].getBoundingClientRect();
    if (clientY <= firstRect.top) {
      return { todoId: items[0].dataset.todoId || null, position: 'before' };
    }

    for (let i = 0; i < items.length; i++) {
      const rect = items[i].getBoundingClientRect();
      const nextTop = i < items.length - 1 ? items[i + 1].getBoundingClientRect().top : rect.bottom + 20;

      if (clientY >= rect.top && clientY < nextTop) {
        const todoId = items[i].dataset.todoId;
        if (!todoId) continue;
        const midY = rect.top + rect.height / 2;
        return { todoId, position: clientY < midY ? 'before' : 'after' };
      }
    }

    const last = items[items.length - 1];
    return { todoId: last.dataset.todoId || null, position: 'after' };
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    if (!todoDrag?.todoId) return;
    const pos = getDropPosition(e.clientY);
    if (pos) setDropTarget(pos);
  };

  const handleDragLeave = (e: DragEvent) => {
    if (listRef.current && !listRef.current.contains(e.relatedTarget as Node)) {
      setDropTarget(null);
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onTodoDrop || !todoDrag?.todoId) {
      setDropTarget(null);
      return;
    }
    const pos = getDropPosition(e.clientY);
    if (pos) {
      onTodoDrop(pos.todoId, pos.position);
    }
    setDropTarget(null);
  };

  const getItemDropClasses = (todoId: string): string => {
    if (!dropTarget || !todoDrag?.todoId) return 'todo-widget__item';
    const classes = ['todo-widget__item'];
    if (dropTarget.todoId === todoId) {
      if (dropTarget.position === 'before') classes.push('todo-widget__item--drop-before');
      if (dropTarget.position === 'after') classes.push('todo-widget__item--drop-after');
    }
    return classes.join(' ');
  };

  const completedCount = widget.items.filter((t) => t.done).length;

  return (
    <div className="todo-widget">
      <h3 className="todo-widget__title">{widget.title}</h3>

      {onAddTodo && (
        <div className="todo-widget__input-row">
          <input
            ref={inputRef}
            type="text"
            className="todo-widget__input"
            value={newText}
            onChange={(e) => setNewText((e.target as HTMLInputElement).value)}
            onKeyDown={handleKeyDown}
            placeholder={t('todo.newNote')}
            aria-label={t('todo.newNoteLabel')}
          />
          <button
            className="todo-widget__add-btn"
            onClick={handleAdd}
            disabled={!newText.trim()}
            aria-label={t('todo.addNote')}
          >
            <Plus size={16} strokeWidth={2} />
          </button>
        </div>
      )}

      <ul
        ref={listRef}
        className="todo-widget__list"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {widget.items.length === 0 && todoDrag?.todoId && dropTarget && dropTarget.todoId === null && (
          <li className="todo-widget__drop-into" />
        )}
        {widget.items.map((todo) => (
          <li
            key={todo.id}
            data-todo-id={todo.id}
            className={`${getItemDropClasses(todo.id)} ${todo.done ? 'todo-widget__item--done' : ''}${todoDrag?.todoId === todo.id ? ' todo-widget__item--dragging' : ''}`}
            draggable={!!onTodoDragStart && editingId !== todo.id}
            onDragStart={(e) => onTodoDragStart?.(e, todo.id)}
            onDragEnd={() => onTodoDragEnd?.()}
          >
            <span className="todo-widget__drag-handle" aria-hidden="true">
              <GripVertical size={12} />
            </span>

            <button
              className="todo-widget__checkbox"
              onClick={() => onToggleTodo?.(todo.id)}
              aria-label={todo.done ? t('todo.markPending') : t('todo.markDone')}
            >
              {todo.done && <Check size={12} strokeWidth={3} />}
            </button>

            {editingId === todo.id ? (
              <div className="todo-widget__edit-row">
                <input
                  ref={editInputRef}
                  type="text"
                  className="todo-widget__edit-input"
                  value={editText}
                  onChange={(e) => setEditText((e.target as HTMLInputElement).value)}
                  onKeyDown={(e) => handleEditKeyDown(e, todo.id)}
                  aria-label={t('todo.editNote')}
                />
                <button
                  className="todo-widget__edit-confirm"
                  onClick={() => saveEdit(todo.id)}
                  aria-label={t('todo.save')}
                >
                  <Check size={14} strokeWidth={2} />
                </button>
                <button
                  className="todo-widget__edit-cancel"
                  onClick={cancelEdit}
                  aria-label={t('todo.cancel')}
                >
                  <X size={14} strokeWidth={2} />
                </button>
              </div>
            ) : (
              <>
                <span
                  className="todo-widget__text"
                  onClick={() => onToggleTodo?.(todo.id)}
                >
                  {todo.text}
                </span>
                <div className="todo-widget__actions">
                  <button
                    className="todo-widget__action-btn"
                    onClick={() => startEdit(todo)}
                    aria-label={t('todo.editNote')}
                  >
                    <Pencil size={12} strokeWidth={2} />
                  </button>
                  <button
                    className="todo-widget__action-btn todo-widget__action-btn--danger"
                    onClick={() => onDeleteTodo?.(todo.id)}
                    aria-label={t('todo.deleteNote')}
                  >
                    <Trash2 size={12} strokeWidth={2} />
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>

      {widget.items.length > 0 && (
        <div className="todo-widget__footer">
          {t('todo.completed', { done: completedCount, total: widget.items.length })}
        </div>
      )}
    </div>
  );
}
