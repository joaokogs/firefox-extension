import { useState, useRef, useEffect } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import type { Board } from '@shared/types';
import { useI18n } from '@shared/i18n';
import { ChevronLeft, ChevronRight, GripVertical, MoreVertical, Pencil, Trash2, Plus } from 'lucide-preact';

interface BoardTabsProps {
  boards: Board[];
  activeId?: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string, title: string) => void;
  onReorder: (id: string, toIndex: number) => void;
}

export function BoardTabs({ boards, activeId, onSelect, onAdd, onRename, onDelete, onReorder }: BoardTabsProps) {
  const { t } = useI18n();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragOverPos, setDragOverPos] = useState<'before' | 'after' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const kebabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const pointerStartRef = useRef<{ boardId: string; x: number; y: number } | null>(null);
  const dragStateRef = useRef<{ id: string | null; overId: string | null; pos: 'before' | 'after' | null }>({
    id: null,
    overId: null,
    pos: null
  });

  const checkScroll = () => {
    const el = scrollRef.current;
    if (el) {
      setCanScrollLeft(el.scrollLeft > 0);
      setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
    }
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener('scroll', checkScroll);
    const observer = new ResizeObserver(checkScroll);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', checkScroll);
      observer.disconnect();
    };
  }, [boards]);

  const scrollBy = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -200 : 200, behavior: 'smooth' });
  };

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  useEffect(() => {
    if (!menuOpenId) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        (!triggerRef.current || !triggerRef.current.contains(target))
      ) {
        setMenuOpenId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpenId]);

  const startRename = (board: Board) => {
    setEditingId(board.id);
    setEditValue(board.title);
    setMenuOpenId(null);
  };

  const commitRename = () => {
    if (editingId) {
      onRename(editingId, editValue);
      setEditingId(null);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') commitRename();
    if (e.key === 'Escape') setEditingId(null);
  };

  const openMenu = (boardId: string) => {
    const btn = kebabRefs.current[boardId];
    triggerRef.current = btn ?? null;
    if (btn) {
      const rect = btn.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setMenuOpenId(boardId);
  };

  const handleContextMenu = (e: MouseEvent, boardId: string) => {
    e.preventDefault();
    setMenuPos({ top: e.clientY, right: window.innerWidth - e.clientX });
    setMenuOpenId(boardId);
  };

  const handleKebabClick = (e: MouseEvent, boardId: string) => {
    e.stopPropagation();
    if (menuOpenId === boardId) {
      setMenuOpenId(null);
    } else {
      openMenu(boardId);
    }
  };

  const handleAction = (fn?: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    setMenuOpenId(null);
    fn?.();
  };

  const clearDrag = () => {
    pointerStartRef.current = null;
    dragStateRef.current = { id: null, overId: null, pos: null };
    setDragId(null);
    setDragOverId(null);
    setDragOverPos(null);
  };

  const handlePointerDown = (e: PointerEvent, boardId: string) => {
    if (e.button !== 0 || editingId) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, input')) return;
    pointerStartRef.current = { boardId, x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: PointerEvent) => {
    const start = pointerStartRef.current;
    if (!start) return;

    if (!dragStateRef.current.id) {
      const distance = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      if (distance < 6) return;
      dragStateRef.current.id = start.boardId;
      setDragId(start.boardId);
    }

    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-board-id]');
    const targetId = target?.dataset.boardId;
    if (!targetId || targetId === start.boardId) {
      dragStateRef.current.overId = null;
      dragStateRef.current.pos = null;
      setDragOverId(null);
      setDragOverPos(null);
      return;
    }

    const rect = target.getBoundingClientRect();
    const pos = e.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
    dragStateRef.current.overId = targetId;
    dragStateRef.current.pos = pos;
    setDragOverId(targetId);
    setDragOverPos(pos);
    e.preventDefault();
  };

  const handlePointerUp = () => {
    const start = pointerStartRef.current;
    const { id, overId, pos } = dragStateRef.current;
    if (!start || !id || !overId || !pos) {
      clearDrag();
      return;
    }

    const fromIdx = boards.findIndex((b) => b.id === start.boardId);
    const toIdx = boards.findIndex((b) => b.id === overId);
    if (fromIdx !== -1 && toIdx !== -1) {
      const targetIndex = pos === 'after' ? toIdx + 1 : toIdx;
      onReorder(start.boardId, fromIdx < targetIndex ? targetIndex - 1 : targetIndex);
    }
    clearDrag();
  };

  const isDragOver = (board: Board) =>
    dragOverId === board.id && dragId !== board.id;

  return (
    <nav className="board-tabs" aria-label={t('boardTabs.boards')}>
      {canScrollLeft && (
        <button
          className="board-tabs__arrow board-tabs__arrow--left"
          onClick={() => scrollBy('left')}
          aria-label={t('boardTabs.scrollLeft')}
        >
          <ChevronLeft size={16} strokeWidth={2} />
        </button>
      )}
      <div className="board-tabs__scroll" ref={scrollRef}>
        {boards.map((board) => {
          const over = isDragOver(board);
          const isBefore = over && dragOverPos === 'before';
          const isAfter = over && dragOverPos === 'after';
          return (
            <div
              key={board.id}
              className={[
                'board-tab',
                board.id === activeId ? 'board-tab--active' : '',
                board.id === dragId ? 'board-tab--dragging' : '',
                isBefore ? 'board-tab--drop-before' : '',
                isAfter ? 'board-tab--drop-after' : '',
              ].filter(Boolean).join(' ')}
              data-board-id={board.id}
              onClick={() => onSelect(board.id)}
              onContextMenu={(e) => handleContextMenu(e, board.id)}
              onPointerDown={(e) => handlePointerDown(e, board.id)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={clearDrag}
              role="button"
              tabIndex={0}
              aria-label={t('boardTabs.openBoard', { title: board.title })}
              onKeyDown={(e) => e.key === 'Enter' && onSelect(board.id)}
            >
              {editingId === board.id ? (
                <input
                  ref={inputRef}
                  className="board-tab__input"
                  value={editValue}
                  onChange={(e) => setEditValue((e.target as HTMLInputElement).value)}
                  onBlur={commitRename}
                  onKeyDown={handleKeyDown}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={t('boardTabs.renameBoard')}
                />
              ) : (
                <>
                  {board.id === activeId && (
                    <GripVertical size={12} strokeWidth={2} className="board-tab__drag-handle" />
                  )}
                  <span className="board-tab__title">{board.title}</span>
                  {board.id === activeId && (
                    <div className="board-tab__actions">
                      <button
                        ref={(el) => { kebabRefs.current[board.id] = el; }}
                        className="board-tab__kebab"
                        onClick={(e) => handleKebabClick(e, board.id)}
                        aria-label={t('boardTabs.boardActions')}
                        title={t('boardTabs.actions')}
                      >
                        <MoreVertical size={12} strokeWidth={2} />
                      </button>
                    </div>
                  )}
                  {menuOpenId === board.id && createPortal(
                    <div
                      ref={menuRef}
                      className="board-tab__menu"
                      style={{ position: 'fixed', top: menuPos.top, right: menuPos.right }}
                    >
                      <button
                        className="board-tab__menu-item"
                        onClick={handleAction(() => startRename(board))}
                      >
                        <Pencil size={12} strokeWidth={2} />
                        {t('boardTabs.rename')}
                      </button>
                      {boards.length > 1 && (
                        <button
                          className="board-tab__menu-item board-tab__menu-item--danger"
                          onClick={handleAction(() => onDelete(board.id, board.title))}
                        >
                          <Trash2 size={12} strokeWidth={2} />
                          {t('boardTabs.delete')}
                        </button>
                      )}
                    </div>,
                    document.body
                  )}
                </>
              )}
            </div>
          );
        })}

        <button className="board-tab board-tab--add" onClick={onAdd} aria-label={t('boardTabs.createNewTab')} title={t('boardTabs.newTab')}>
          <Plus size={14} strokeWidth={2} />
        </button>
      </div>
      {canScrollRight && (
        <button
          className="board-tabs__arrow board-tabs__arrow--right"
          onClick={() => scrollBy('right')}
          aria-label={t('boardTabs.scrollRight')}
        >
          <ChevronRight size={16} strokeWidth={2} />
        </button>
      )}
    </nav>
  );
}
