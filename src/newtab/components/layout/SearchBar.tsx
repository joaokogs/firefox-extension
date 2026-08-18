import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Search, X, Bookmark, Clock } from 'lucide-preact';
import type { LinkItem } from '@shared/types';
import { useI18n } from '@shared/i18n';
import { notifyMenuOpened, subscribeToMenuClose } from '../../utils/menu';

type DropdownItem =
  | { type: 'link'; text: string; link: LinkItem }
  | { type: 'search' | 'recent'; text: string };

interface SearchBarProps {
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  onSearch: (query: string) => void;
  onOpenLink: (url: string) => void;
  recentSearches: string[];
  linkSuggestions: LinkItem[];
  onRemoveRecentSearch?: (query: string) => void;
}

export function SearchBar({
  searchQuery,
  onSearchQueryChange,
  onSearch,
  onOpenLink,
  recentSearches,
  linkSuggestions,
  onRemoveRecentSearch,
}: SearchBarProps) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const containerRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { t } = useI18n();

  useEffect(() => {
    let count = 0;
    const focus = () => {
      if (document.activeElement !== inputRef.current) {
        inputRef.current?.focus();
      }
    };
    focus();
    const id = setInterval(() => {
      if (document.activeElement === inputRef.current || count >= 50) {
        clearInterval(id);
        return;
      }
      focus();
      count++;
    }, 100);
    const onShow = () => focus();
    window.addEventListener('pageshow', onShow);
    return () => { clearInterval(id); window.removeEventListener('pageshow', onShow); };
  }, []);

  const dropdownItems = useMemo(() => {
    const links: DropdownItem[] = linkSuggestions.map((link) => ({
      type: 'link',
      text: link.title,
      link,
    }));

    if (searchQuery.trim()) {
      return [
        { type: 'search' as const, text: searchQuery.trim() },
        ...links,
      ];
    }

    return recentSearches.slice(0, 5).map((text) => ({ type: 'recent' as const, text }));
  }, [linkSuggestions, recentSearches, searchQuery]);

  const hasDropdown = open && dropdownItems.length > 0;

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    return subscribeToMenuClose(() => {
      setOpen(false);
    });
  }, [open]);

  useEffect(() => {
    setHighlighted(-1);
  }, [dropdownItems.length]);

  const handleInput = (val: string) => {
    notifyMenuOpened();
    onSearchQueryChange(val);
    setOpen(true);
  };

  const handleSelect = (item: DropdownItem) => {
    if (item.type === 'link') {
      onOpenLink(item.link.url);
    } else {
      onSearchQueryChange(item.text);
      onSearch(item.text);
    }
    setOpen(false);
  };

  const handleSubmit = (event: Event) => {
    event.preventDefault();
    const query = inputRef.current?.value.trim() || '';
    if (!query) return;
    onSearch(query);
    setOpen(false);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (hasDropdown) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlighted((i) => (i < dropdownItems.length - 1 ? i + 1 : 0));
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlighted((i) => (i > 0 ? i - 1 : dropdownItems.length - 1));
        return;
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (highlighted >= 0) {
          const item = dropdownItems[highlighted];
          if (item) {
            handleSelect(item);
            return;
          }
        }
        onSearch(searchQuery);
        setOpen(false);
      } else if (e.key === 'Escape') {
        setOpen(false);
        return;
      }
    }
  };

  return (
    <form id="search-form" ref={containerRef} className="app-header__search" onSubmit={handleSubmit}>
      <div className="search-tools">
        <Search size={22} strokeWidth={2} className="app-header__search-icon" />
      </div>
      <input
        id="search"
        ref={inputRef}
        type="text"
        placeholder={t('searchBar.placeholder')}
        value={searchQuery}
        onInput={(e) => handleInput((e.target as HTMLInputElement).value)}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (searchQuery.trim()) setOpen(true); }}
        autoComplete="off"
        autoFocus
        aria-autocomplete="list"
        aria-expanded={hasDropdown}
        aria-label={t('searchBar.placeholder')}
      />
      {searchQuery && (
        <button
          className="app-header__clear"
          type="button"
          onClick={() => { onSearchQueryChange(''); setOpen(false); inputRef.current?.focus(); }}
          aria-label={t('searchBar.clearSearch')}
        >
          <X size={14} />
        </button>
      )}

      {hasDropdown && (
        <ul className="search-suggestions" role="listbox">
          {dropdownItems.map((item, index) => (
            <>
              {(index === 0 || item.type !== dropdownItems[index - 1]?.type) && (
                <li className={`search-suggestions__section ${item.type === 'link' ? 'search-suggestions__section--links' : ''}`} role="presentation">
                  {item.type === 'search' ? t('searchBar.sectionSearch') : item.type === 'link' ? t('searchBar.sectionLinks') : t('searchBar.sectionRecent')}
                </li>
              )}
              <li
                key={`${item.type}-${item.text}`}
                className={`search-suggestions__item ${index === highlighted ? 'search-suggestions__item--highlighted' : ''}`}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setHighlighted(index)}
                role="option"
                aria-selected={index === highlighted}
              >
                {item.type === 'search' ? <Search size={14} strokeWidth={2} className="search-suggestions__icon" />
                   : item.type === 'link' ? <Bookmark size={14} strokeWidth={2} className="search-suggestions__icon" />
                   : <Clock size={14} strokeWidth={2} className="search-suggestions__icon" />}
                <span className="search-suggestions__text">{item.text}</span>
                {item.type === 'recent' && onRemoveRecentSearch && (
                  <button
                    className="search-suggestions__remove"
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onRemoveRecentSearch(item.text); }}
                    aria-label={t('searchBar.removeSearch', { text: item.text })}
                  >
                    <X size={12} />
                  </button>
                )}
              </li>
            </>
          ))}
        </ul>
      )}
    </form>
  );
}
