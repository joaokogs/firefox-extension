import { useEffect, useRef, useState } from 'preact/hooks';
import { useI18n } from '@shared/i18n';
import { createPortal } from 'preact/compat';
import type { LinkItem, LinksWidget } from '@shared/types';
import { getFaviconUrl } from '@shared/storage';
import { AnyIcon } from './AnyIcon';
import { GripVertical, MoreVertical, Pencil, Trash2 } from 'lucide-preact';

interface LinkDragState {
  linkId: string | null;
  fromWidgetId: string | null;
}

interface LinksWidgetProps {
  widget: LinksWidget;
  linkDrag: LinkDragState;
  openInNewTab?: boolean;
  onDeleteLink?: (linkId: string) => void;
  onEditLink?: (linkId: string) => void;
  onLinkDragStart?: (e: DragEvent, linkId: string) => void;
  onLinkDragEnd?: () => void;
  onLinkDrop?: (targetLinkId: string | null, position: 'before' | 'after') => void;
}

interface DropTarget {
  linkId: string | null;
  position: 'before' | 'after';
}

export function LinksWidgetView({
  widget,
  linkDrag,
  openInNewTab = true,
  onDeleteLink,
  onEditLink,
  onLinkDragStart,
  onLinkDragEnd,
  onLinkDrop
}: LinksWidgetProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  useEffect(() => {
    if (!linkDrag.linkId) {
      setDropTarget(null);
    }
  }, [linkDrag.linkId]);

  const getDropPosition = (clientY: number): DropTarget | null => {
    if (!listRef.current) return null;
    const items = listRef.current.querySelectorAll<HTMLLIElement>('.links-widget__item');

    if (items.length === 0) {
      return { linkId: null, position: 'before' };
    }

    const firstRect = items[0].getBoundingClientRect();
    if (clientY <= firstRect.top) {
      return { linkId: items[0].dataset.linkId || null, position: 'before' };
    }

    for (let i = 0; i < items.length; i++) {
      const rect = items[i].getBoundingClientRect();
      const nextTop = i < items.length - 1 ? items[i + 1].getBoundingClientRect().top : rect.bottom + 20;

      if (clientY >= rect.top && clientY < nextTop) {
        const linkId = items[i].dataset.linkId;
        if (!linkId) continue;
        const midY = rect.top + rect.height / 2;
        return { linkId, position: clientY < midY ? 'before' : 'after' };
      }
    }

    const last = items[items.length - 1];
    return { linkId: last.dataset.linkId || null, position: 'after' };
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    if (!linkDrag.linkId) return;
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
    if (!onLinkDrop || !linkDrag.linkId) {
      setDropTarget(null);
      return;
    }
    const pos = getDropPosition(e.clientY);
    if (pos) {
      onLinkDrop(pos.linkId, pos.position);
    }
    setDropTarget(null);
  };

  const getItemDropClasses = (linkId: string): string => {
    if (!dropTarget || !linkDrag.linkId) return '';
    const classes = ['links-widget__item'];
    if (dropTarget.linkId === linkId) {
      if (dropTarget.position === 'before') classes.push('links-widget__item--drop-before');
      if (dropTarget.position === 'after') classes.push('links-widget__item--drop-after');
    }
    return classes.join(' ');
  };

  return (
    <ul
      ref={listRef}
      className="links-widget"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {widget.items.length === 0 && linkDrag.linkId && dropTarget && dropTarget.linkId === null && (
        <li className="links-widget__drop-into" />
      )}
      {widget.items.map((link) => (
        <LinkRow
          key={link.id}
          link={link}
          className={getItemDropClasses(link.id)}
            isDragging={linkDrag.linkId === link.id}
            openInNewTab={openInNewTab}
            onDelete={onDeleteLink}
          onEdit={onEditLink}
          onDragStart={onLinkDragStart}
          onDragEnd={onLinkDragEnd}
        />
      ))}
    </ul>
  );
}

function LinkRow({
  link,
  className,
  isDragging,
  openInNewTab = true,
  onDelete,
  onEdit,
  onDragStart,
  onDragEnd
}: {
  link: LinkItem;
  className?: string;
  isDragging?: boolean;
  openInNewTab?: boolean;
  onDelete?: (id: string) => void;
  onEdit?: (id: string) => void;
  onDragStart?: (e: DragEvent, linkId: string) => void;
  onDragEnd?: () => void;
}) {
  const { t } = useI18n();
  const [imageError, setImageError] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const kebabRef = useRef<HTMLButtonElement>(null);
  const favicon = link.favicon && !imageError ? link.favicon : getFaviconUrl(link.url);

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

  const openMenu = () => {
    if (kebabRef.current) {
      const rect = kebabRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 2, right: window.innerWidth - rect.right });
    }
    setMenuOpen(true);
  };

  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openMenu();
  };

  const handleKebabClick = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (menuOpen) {
      setMenuOpen(false);
    } else {
      openMenu();
    }
  };

  const handleAction = (fn?: (id: string) => void) => (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setMenuOpen(false);
    fn?.(link.id);
  };

  const handleDragStart = (e: DragEvent) => {
    if (!onDragStart) return;
    e.stopPropagation();
    onDragStart(e, link.id);
  };

  const handleDragEnd = () => {
    onDragEnd?.();
  };

  return (
    <li
      className={`${className || 'links-widget__item'}${isDragging ? ' links-widget__item--dragging' : ''}`}
      data-link-id={link.id}
      draggable={!!onDragStart}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onContextMenu={handleContextMenu}
    >
      <a
        href={link.url}
        target={openInNewTab ? '_blank' : '_self'}
        rel="noopener noreferrer"
        className="links-widget__link"
        aria-label={t('linksWidget.open', { title: link.title })}
      >
        <span className="links-widget__drag-handle" aria-hidden="true">
          <GripVertical size={12} />
        </span>
        <span className="links-widget__icon">
          {link.icon ? (
            <AnyIcon name={link.icon} size={16} />
          ) : favicon ? (
            <img
              src={favicon}
              alt=""
              width="18"
              height="18"
              loading="lazy"
              decoding="async"
              onError={() => setImageError(true)}
            />
          ) : (
            <AnyIcon name="link" size={14} />
          )}
        </span>
        <span className="links-widget__text">{link.title}</span>
      </a>
      {(onEdit || onDelete) && (
        <div className="links-widget__actions">
          <button
            ref={kebabRef}
            className="links-widget__kebab"
            onClick={handleKebabClick}
            aria-label={t('linksWidget.linkActions')}
            title={t('linksWidget.actions')}
          >
            <MoreVertical size={14} strokeWidth={2} />
          </button>
          {menuOpen && createPortal(
            <div
              ref={menuRef}
              className="links-widget__menu"
              style={{ position: 'fixed', top: menuPos.top, right: menuPos.right }}
            >
              {onEdit && (
                <button
                  className="links-widget__menu-item"
                  onClick={handleAction(onEdit)}
                >
                  <Pencil size={14} strokeWidth={2} />
                  {t('linksWidget.edit')}
                </button>
              )}
              {onDelete && (
                <button
                  className="links-widget__menu-item links-widget__menu-item--danger"
                  onClick={handleAction(onDelete)}
                >
                  <Trash2 size={14} strokeWidth={2} />
                  {t('linksWidget.delete')}
                </button>
              )}
            </div>,
            document.body
          )}
        </div>
      )}
    </li>
  );
}