import { useEffect, useRef, useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import type { Widget } from '@shared/types';
import { MoreVertical, Plus, Pencil, Trash2 } from 'lucide-preact';

interface WidgetCardProps {
  widget: Widget;
  children: preact.ComponentChildren;
  onEdit?: () => void;
  onDelete?: () => void;
  onAddLink?: () => void;
  onResize?: (height: number) => void;
  onDragStart?: (e: DragEvent) => void;
  onDragOver?: (e: DragEvent) => void;
  onDrop?: (e: DragEvent) => void;
  onDragEnd?: () => void;
  isDragging?: boolean;
  className?: string;
}

export function WidgetCard({
  widget,
  children,
  onEdit,
  onDelete,
  onAddLink,
  onResize,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragging,
  className = ''
}: WidgetCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const kebabRef = useRef<HTMLButtonElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [tempHeight, setTempHeight] = useState<number | undefined>(undefined);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const resizeStart = useRef({ y: 0, baseHeight: 0 });

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        kebabRef.current &&
        !kebabRef.current.contains(target)
      ) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  useEffect(() => {
    if (!isResizing) return;

    const onMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      const diff = e.clientY - resizeStart.current.y;
      setTempHeight(Math.max(120, resizeStart.current.baseHeight + diff));
    };

    const onMouseUp = () => {
      setIsResizing(false);
      if (tempHeight !== undefined) {
        onResize?.(tempHeight);
        setTempHeight(undefined);
      }
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [isResizing, tempHeight]);

  const openMenu = () => {
    if (kebabRef.current) {
      const rect = kebabRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setMenuOpen(true);
  };

  const handleMouseDown = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (cardRef.current) {
      resizeStart.current = {
        y: e.clientY,
        baseHeight: cardRef.current.getBoundingClientRect().height
      };
    }
    setIsResizing(true);
  };

  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    openMenu();
  };

  const handleKebabClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (menuOpen) {
      setMenuOpen(false);
    } else {
      openMenu();
    }
  };

  const handleAction = (fn?: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    fn?.();
  };

  return (
    <div
      ref={cardRef}
      className={`widget-card ${widget.colSpan > 1 ? 'widget-card--wide' : ''} ${isDragging ? 'widget-card--dragging' : ''} ${widget.height ? 'widget-card--fixed-height' : ''} ${isResizing ? 'widget-card--resizing' : ''} ${className}`}
      draggable={!!onDragStart && !isResizing}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onContextMenu={handleContextMenu}
      data-widget-id={widget.id}
      data-col-span={widget.colSpan}
      style={tempHeight !== undefined ? { height: tempHeight, flexShrink: 0 } : widget.height ? { height: widget.height, flexShrink: 0 } : undefined}
    >
      <div className={`widget-card__header ${widget.type !== 'links' ? 'widget-card__header--actions-only' : ''}`}>
          {widget.type === 'links' && (
            <div className="widget-card__title-row">
            <h3 className="widget-card__title">{widget.title}</h3>
            </div>
          )}
          {(onEdit || onDelete || onAddLink) && (
            <div className="widget-card__actions">
              <button
                ref={kebabRef}
                className="widget-card__kebab"
                onClick={handleKebabClick}
                aria-label="Ações do widget"
                title="Ações"
              >
                <MoreVertical size={16} strokeWidth={2} />
              </button>
              {menuOpen && createPortal(
                <div
                  ref={menuRef}
                  className="widget-card__menu"
                  style={{ position: 'fixed', top: menuPos.top, right: menuPos.right }}
                >
                  {onAddLink && (
                    <button
                      className="widget-card__menu-item"
                      onClick={handleAction(onAddLink)}
                    >
                      <Plus size={14} strokeWidth={2} />
                      Adicionar link
                    </button>
                  )}
                  {onEdit && widget.type !== 'clock' && widget.type !== 'calendar' && (
                    <button
                      className="widget-card__menu-item"
                      onClick={handleAction(onEdit)}
                    >
                      <Pencil size={14} strokeWidth={2} />
                      Editar
                    </button>
                  )}
                  {onDelete && (
                    <button
                      className="widget-card__menu-item widget-card__menu-item--danger"
                      onClick={handleAction(onDelete)}
                    >
                      <Trash2 size={14} strokeWidth={2} />
                      Excluir
                    </button>
                  )}
                </div>,
                document.body
              )}
            </div>
          )}
      </div>
      <div className="widget-card__content">{children}</div>
      {onResize && (
        <div
          className="widget-card__resize-handle"
          onMouseDown={handleMouseDown}
          aria-label="Redimensionar widget"
          title="Arraste para redimensionar"
        />
      )}
    </div>
  );
}
