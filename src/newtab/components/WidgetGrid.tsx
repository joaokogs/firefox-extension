import { useRef, useState, useMemo } from 'preact/hooks';
import type { Widget } from '@shared/types';
import { useI18n } from '@shared/i18n';
import { WidgetCard } from './WidgetCard';
import { LinksWidgetView } from './LinksWidget';
import { CalendarWidgetView } from './CalendarWidget';
import { ClockWidgetView } from './ClockWidget';
import { WeatherWidgetView } from './WeatherWidget';
import { TodoWidgetView, type TodoDragState } from './TodoWidget';
import { useColumnCount } from '../hooks/useColumnCount';

interface WidgetGridProps {
  widgets: Widget[];
  openInNewTab: boolean;
  onReorder: (widgets: Widget[]) => void;
  onEditWidget: (widget: Widget) => void;
  onDeleteWidget: (widgetId: string) => void;
  onDeleteLink: (widgetId: string, linkId: string) => void;
  onEditLink?: (widgetId: string, linkId: string) => void;
  onAddLink?: (widget: Widget) => void;
  onResizeWidget?: (widgetId: string, height: number) => void;
  onAddWidget?: () => void;
  onMoveLink?: (fromWidgetId: string, toWidgetId: string, linkId: string, toIndex: number) => void;
  onAddTodo?: (widgetId: string, text: string) => void;
  onToggleTodo?: (widgetId: string, todoId: string) => void;
  onUpdateTodo?: (widgetId: string, todoId: string, text: string) => void;
  onDeleteTodo?: (widgetId: string, todoId: string) => void;
  onMoveTodo?: (fromWidgetId: string, toWidgetId: string, todoId: string, toIndex: number) => void;
  isEditing?: boolean;
}

interface DragTarget {
  widgetId: string | null;
  col: number | null;
  targetId: string | null;
  position: 'before' | 'after' | 'into' | null;
}

interface LinkDragState {
  linkId: string | null;
  fromWidgetId: string | null;
}

export function WidgetGrid({
  widgets,
  openInNewTab,
  onReorder,
  onEditWidget,
  onDeleteWidget,
  onDeleteLink,
  onEditLink,
  onAddLink,
  onResizeWidget,
  onAddWidget,
  onMoveLink,
  onAddTodo,
  onToggleTodo,
  onUpdateTodo,
  onDeleteTodo,
  onMoveTodo,
  isEditing = true
}: WidgetGridProps) {
  const { t } = useI18n();
  const gridRef = useRef<HTMLDivElement>(null);
  const columnCount = useColumnCount(gridRef);
  const [drag, setDrag] = useState<DragTarget>({ widgetId: null, col: null, targetId: null, position: null });
  const [linkDrag, setLinkDrag] = useState<LinkDragState>({ linkId: null, fromWidgetId: null });
  const [todoDrag, setTodoDrag] = useState<TodoDragState>({ todoId: null, fromWidgetId: null });

  const columns = useMemo(() => {
    const cols: Widget[][] = Array.from({ length: columnCount }, () => []);
    for (const w of widgets) {
      const col = Math.min(Math.max(w.col ?? 0, 0), columnCount - 1);
      cols[col].push(w);
    }
    for (const col of cols) {
      col.sort((a, b) => a.order - b.order);
    }
    return cols;
  }, [widgets, columnCount]);

  const handleDragStart = (e: DragEvent, id: string) => {
    setDrag({ widgetId: id, col: null, targetId: null, position: null });
    e.dataTransfer?.setData('text/plain', id);
    e.dataTransfer?.setDragImage(new Image(), 0, 0);
  };

  const handleDragOverWidget = (e: DragEvent, widget: Widget) => {
    e.preventDefault();
    e.stopPropagation();
    if (!drag.widgetId || drag.widgetId === widget.id) {
      setDrag((prev) => ({ ...prev, col: null, targetId: null, position: null }));
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position = e.clientY < midY ? 'before' : 'after';
    const col = Math.min(Math.max(widget.col ?? 0, 0), columnCount - 1);
    setDrag({ widgetId: drag.widgetId, col, targetId: widget.id, position });
  };

  const handleDragOverColumn = (e: DragEvent, colIndex: number) => {
    e.preventDefault();
    if (!drag.widgetId) return;

    const cards = Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[data-widget-id]'))
      .filter((card) => card.dataset.widgetId !== drag.widgetId);
    const nextCard = cards.find((card) => e.clientY < card.getBoundingClientRect().top + card.getBoundingClientRect().height / 2);

    if (nextCard?.dataset.widgetId) {
      setDrag({ widgetId: drag.widgetId, col: colIndex, targetId: nextCard.dataset.widgetId, position: 'before' });
      return;
    }

    const lastCard = cards[cards.length - 1];
    setDrag({
      widgetId: drag.widgetId,
      col: colIndex,
      targetId: lastCard?.dataset.widgetId ?? null,
      position: lastCard ? 'after' : 'into'
    });
  };

  const commitReorder = (fn: (byCol: Widget[][]) => void) => {
    const byCol: Widget[][] = Array.from({ length: columnCount }, () => []);
    const copy = widgets.map((w) => ({ ...w }));
    for (const w of copy) {
      const c = Math.min(Math.max(w.col ?? 0, 0), columnCount - 1);
      byCol[c].push(w);
    }
    for (const col of byCol) {
      col.sort((a, b) => a.order - b.order);
    }
    fn(byCol);
    for (const col of byCol) {
      col.forEach((w, i) => { w.order = i; });
    }
    const result = byCol.flat();
    onReorder(result);
  };

  const handleDropOnWidget = (e: DragEvent, targetWidget: Widget) => {
    e.preventDefault();
    e.stopPropagation();
    if (!drag.widgetId || drag.widgetId === targetWidget.id) {
      setDrag({ widgetId: null, col: null, targetId: null, position: null });
      return;
    }

    const targetCol = Math.min(Math.max(targetWidget.col ?? 0, 0), columnCount - 1);
    const position = drag.position;

    commitReorder((byCol) => {
      const moved = byCol.flat().find((w) => w.id === drag.widgetId);
      if (!moved) return;
      for (const col of byCol) {
        const idx = col.findIndex((w) => w.id === drag.widgetId);
        if (idx !== -1) { col.splice(idx, 1); break; }
      }
      moved.col = targetCol;
      const targetIndex = byCol[targetCol].findIndex((w) => w.id === targetWidget.id);
      const insertIndex = position === 'after' ? targetIndex + 1 : targetIndex;
      byCol[targetCol].splice(insertIndex, 0, moved);
    });

    setDrag({ widgetId: null, col: null, targetId: null, position: null });
  };

  const handleDropOnColumn = (e: DragEvent, colIndex: number) => {
    e.preventDefault();
    if (!drag.widgetId) {
      setDrag({ widgetId: null, col: null, targetId: null, position: null });
      return;
    }

    const targetWidget = drag.targetId ? columns[colIndex].find((widget) => widget.id === drag.targetId) : undefined;
    if (targetWidget && drag.position !== 'into') {
      handleDropOnWidget(e, targetWidget);
      return;
    }

    commitReorder((byCol) => {
      let moved: Widget | undefined;
      for (const col of byCol) {
        const idx = col.findIndex((w) => w.id === drag.widgetId);
        if (idx !== -1) { moved = col.splice(idx, 1)[0]; break; }
      }
      if (!moved) return;
      moved.col = colIndex;
      byCol[colIndex].push(moved);
    });

    setDrag({ widgetId: null, col: null, targetId: null, position: null });
  };

  const handleDragEnd = () => {
    setDrag({ widgetId: null, col: null, targetId: null, position: null });
  };

  const handleLinkDragStart = (e: DragEvent, linkId: string, widgetId: string) => {
    e.dataTransfer?.setData('text/plain', JSON.stringify({ linkId, widgetId }));
    e.dataTransfer?.setDragImage(new Image(), 0, 0);
    setLinkDrag({ linkId, fromWidgetId: widgetId });
  };

  const handleLinkDragEnd = () => {
    setLinkDrag({ linkId: null, fromWidgetId: null });
  };

  const handleLinkDrop = (targetWidgetId: string, targetLinkId: string | null, position: 'before' | 'after') => {
    if (!linkDrag.linkId || !linkDrag.fromWidgetId) {
      setLinkDrag({ linkId: null, fromWidgetId: null });
      return;
    }

    if (!onMoveLink) {
      setLinkDrag({ linkId: null, fromWidgetId: null });
      return;
    }

    const targetWidget = widgets.find((w) => w.id === targetWidgetId);
    if (!targetWidget || targetWidget.type !== 'links') {
      setLinkDrag({ linkId: null, fromWidgetId: null });
      return;
    }

    const targetItems = targetWidget.items;
    let toIndex: number;
    if (targetLinkId) {
      const idx = targetItems.findIndex((l) => l.id === targetLinkId);
      toIndex = position === 'after' ? idx + 1 : idx;
    } else {
      toIndex = position === 'after' ? targetItems.length : 0;
    }

    onMoveLink(linkDrag.fromWidgetId, targetWidgetId, linkDrag.linkId, toIndex);
    setLinkDrag({ linkId: null, fromWidgetId: null });
  };

  const handleTodoDragStart = (e: DragEvent, todoId: string, widgetId: string) => {
    e.dataTransfer?.setData('text/plain', JSON.stringify({ todoId, widgetId }));
    e.dataTransfer?.setDragImage(new Image(), 0, 0);
    setTodoDrag({ todoId, fromWidgetId: widgetId });
  };

  const handleTodoDragEnd = () => {
    setTodoDrag({ todoId: null, fromWidgetId: null });
  };

  const handleTodoDrop = (targetWidgetId: string, targetTodoId: string | null, position: 'before' | 'after') => {
    if (!todoDrag.todoId || !todoDrag.fromWidgetId) {
      setTodoDrag({ todoId: null, fromWidgetId: null });
      return;
    }

    if (!onMoveTodo) {
      setTodoDrag({ todoId: null, fromWidgetId: null });
      return;
    }

    const targetWidget = widgets.find((w) => w.id === targetWidgetId);
    if (!targetWidget || targetWidget.type !== 'todo') {
      setTodoDrag({ todoId: null, fromWidgetId: null });
      return;
    }

    const targetItems = targetWidget.items;
    let toIndex: number;
    if (targetTodoId) {
      const idx = targetItems.findIndex((t) => t.id === targetTodoId);
      toIndex = position === 'after' ? idx + 1 : idx;
    } else {
      toIndex = position === 'after' ? targetItems.length : 0;
    }

    onMoveTodo(todoDrag.fromWidgetId, targetWidgetId, todoDrag.todoId, toIndex);
    setTodoDrag({ todoId: null, fromWidgetId: null });
  };

  return (
    <div className="widgets-grid" ref={gridRef}>
      {columns.map((colWidgets, colIndex) => (
        <div
          key={colIndex}
          className="widgets-column"
          onDragOver={(e) => isEditing && handleDragOverColumn(e, colIndex)}
          onDrop={(e) => isEditing && handleDropOnColumn(e, colIndex)}
        >
          {colWidgets.length === 0 && drag.col === colIndex && drag.position === 'into' && <DropIndicator />}
          {colWidgets.map((widget) => {
            const isTarget = drag.widgetId && drag.targetId === widget.id && drag.col === (widget.col ?? 0);
            return (
              <div key={widget.id} className="widget-drop-wrapper">
                {isTarget && drag.position === 'before' && <DropIndicator />}
                <WidgetCard
                  widget={widget}
                  isDragging={widget.id === drag.widgetId}
                  onDragStart={isEditing ? (e) => handleDragStart(e, widget.id) : undefined}
                  onDragOver={isEditing ? (e) => handleDragOverWidget(e, widget) : undefined}
                  onDrop={isEditing ? (e) => handleDropOnWidget(e, widget) : undefined}
                  onDragEnd={handleDragEnd}
                  onEdit={isEditing ? () => onEditWidget(widget) : undefined}
                  onDelete={isEditing ? () => onDeleteWidget(widget.id) : undefined}
                  onAddLink={isEditing && widget.type === 'links' && onAddLink ? () => onAddLink(widget) : undefined}
                  onResize={isEditing && onResizeWidget && (widget.type === 'links' || widget.type === 'todo') ? (h) => onResizeWidget(widget.id, h) : undefined}
                >
                  <WidgetContent
                    widget={widget}
                    linkDrag={linkDrag}
                    todoDrag={todoDrag}
                    openInNewTab={openInNewTab}
                    onDeleteLink={isEditing ? (linkId) => onDeleteLink(widget.id, linkId) : undefined}
                    onEditLink={isEditing && onEditLink ? (linkId) => onEditLink(widget.id, linkId) : undefined}
                    onLinkDragStart={isEditing ? (e, linkId) => handleLinkDragStart(e, linkId, widget.id) : undefined}
                    onLinkDragEnd={isEditing ? handleLinkDragEnd : undefined}
                    onLinkDrop={isEditing ? (targetLinkId, position) => handleLinkDrop(widget.id, targetLinkId, position) : undefined}
                    onAddTodo={onAddTodo}
                    onToggleTodo={onToggleTodo}
                    onUpdateTodo={onUpdateTodo}
                    onDeleteTodo={onDeleteTodo}
                    onTodoDragStart={(e, todoId) => handleTodoDragStart(e, todoId, widget.id)}
                    onTodoDragEnd={handleTodoDragEnd}
                    onTodoDrop={(widgetId, targetTodoId, position) => handleTodoDrop(widgetId, targetTodoId, position)}
                  />
                </WidgetCard>
                {isTarget && drag.position === 'after' && <DropIndicator />}
              </div>
            );
          })}
          {isEditing && onAddWidget && (
            <button
              className="widgets-column__add"
              onClick={() => onAddWidget?.()}
              aria-label={t('widgetGrid.addWidgetColumn', { n: colIndex + 1 })}
              title={t('widgetGrid.addWidgets')}
            >
              <span aria-hidden="true">+</span>
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function DropIndicator() {
  return <div className="drop-indicator" />;
}

function WidgetContent({
  widget,
  linkDrag,
  openInNewTab,
  onDeleteLink,
  onEditLink,
  onLinkDragStart,
  onLinkDragEnd,
  onLinkDrop,
  onAddTodo,
  onToggleTodo,
  onUpdateTodo,
  onDeleteTodo,
  todoDrag,
  onTodoDragStart,
  onTodoDragEnd,
  onTodoDrop
}: {
  widget: Widget;
  linkDrag: LinkDragState;
  todoDrag: TodoDragState;
  openInNewTab: boolean;
  onDeleteLink?: (linkId: string) => void;
  onEditLink?: (linkId: string) => void;
  onLinkDragStart?: (e: DragEvent, linkId: string) => void;
  onLinkDragEnd?: () => void;
  onLinkDrop?: (targetLinkId: string | null, position: 'before' | 'after') => void;
  onAddTodo?: (widgetId: string, text: string) => void;
  onToggleTodo?: (widgetId: string, todoId: string) => void;
  onUpdateTodo?: (widgetId: string, todoId: string, text: string) => void;
  onDeleteTodo?: (widgetId: string, todoId: string) => void;
  onTodoDragStart?: (e: DragEvent, todoId: string, widgetId: string) => void;
  onTodoDragEnd?: () => void;
  onTodoDrop?: (widgetId: string, targetTodoId: string | null, position: 'before' | 'after') => void;
}) {
  switch (widget.type) {
    case 'links':
      return (
        <LinksWidgetView
          widget={widget}
          linkDrag={linkDrag}
          openInNewTab={openInNewTab}
          onDeleteLink={onDeleteLink}
          onEditLink={onEditLink}
          onLinkDragStart={onLinkDragStart}
          onLinkDragEnd={onLinkDragEnd}
          onLinkDrop={onLinkDrop}
        />
      );
    case 'calendar':
      return <CalendarWidgetView />;
    case 'clock':
      return <ClockWidgetView timezone={widget.timezone} label={widget.label} />;
    case 'weather':
      return <WeatherWidgetView city={widget.city} />;
    case 'todo':
      return (
        <TodoWidgetView
          widget={widget}
          todoDrag={todoDrag}
          onAddTodo={onAddTodo ? (text) => onAddTodo(widget.id, text) : undefined}
          onToggleTodo={onToggleTodo ? (todoId) => onToggleTodo(widget.id, todoId) : undefined}
          onUpdateTodo={onUpdateTodo ? (todoId, text) => onUpdateTodo(widget.id, todoId, text) : undefined}
          onDeleteTodo={onDeleteTodo ? (todoId) => onDeleteTodo(widget.id, todoId) : undefined}
          onTodoDragStart={onTodoDragStart ? (e, todoId) => onTodoDragStart(e, todoId, widget.id) : undefined}
          onTodoDragEnd={onTodoDragEnd}
          onTodoDrop={onTodoDrop ? (targetTodoId, position) => onTodoDrop(widget.id, targetTodoId, position) : undefined}
        />
      );
    default:
      return null;
  }
}