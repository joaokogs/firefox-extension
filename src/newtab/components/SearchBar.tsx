import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Search, X, Bookmark, Clock, Globe } from 'lucide-preact';
import { SEARCH_ENGINES } from '@shared/types';
import type { LinkItem, SearchEngine } from '@shared/types';
import { useI18n } from '@shared/i18n';

type DropdownItem =
  | { type: 'link'; text: string; link: LinkItem }
  | { type: 'search' | 'suggestion' | 'recent'; text: string };

interface SearchBarProps {
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  searchEngine: SearchEngine;
  onEngineChange: (engine: SearchEngine) => void;
  onSearch: (query: string) => void;
  onOpenLink: (url: string) => void;
  recentSearches: string[];
  linkSuggestions: LinkItem[];
  onRemoveRecentSearch?: (query: string) => void;
}

export function SearchBar({
  searchQuery,
  onSearchQueryChange,
  searchEngine,
  onEngineChange,
  onSearch,
  onOpenLink,
  recentSearches,
  linkSuggestions,
  onRemoveRecentSearch,
}: SearchBarProps) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [engineDropdownOpen, setEngineDropdownOpen] = useState(false);
  const [webSuggestions, setWebSuggestions] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number | null>(null);
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

  const currentEngine = SEARCH_ENGINES.find((e) => e.id === searchEngine);

  const abortRef = useRef<AbortController | null>(null);

  const fetchSuggestions = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || !currentEngine) {
      setWebSuggestions([]);
      return;
    }
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    try {
      const url = `${currentEngine.autocomplete}${encodeURIComponent(trimmed)}`;
      const res = await fetch(url, { signal: abort.signal });
      if (!res.ok) { setWebSuggestions([]); return; }
      const data = await res.json();
      if (currentEngine.id === 'duckduckgo') {
        setWebSuggestions((data as { phrase: string }[]).map((d) => d.phrase));
      } else {
        setWebSuggestions((data as [string, string[]])[1] || []);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setWebSuggestions([]);
    }
  };

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
        ...webSuggestions.slice(0, 5).map((text) => ({ type: 'suggestion' as const, text })),
      ];
    }

    return recentSearches.slice(0, 5).map((text) => ({ type: 'recent' as const, text }));
  }, [linkSuggestions, webSuggestions, recentSearches, searchQuery]);

  const hasDropdown = open && dropdownItems.length > 0;

  useEffect(() => {
    if (!open && !engineDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setEngineDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, engineDropdownOpen]);

  useEffect(() => {
    setHighlighted(-1);
  }, [dropdownItems.length]);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (!searchQuery.trim()) {
      setWebSuggestions([]);
      return;
    }
    debounceRef.current = window.setTimeout(() => {
      fetchSuggestions(searchQuery);
    }, 300);
  }, [searchQuery, searchEngine]);

  const handleInput = (val: string) => {
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
      } else if (e.key === 'Escape') {
        setOpen(false);
        return;
      }
    }
    if (e.key === 'Enter') {
      onSearch(searchQuery);
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="app-header__search">
      <div className="search-tools">
        <Search size={22} strokeWidth={2} className="app-header__search-icon" />
        <button
          className="search-engine-btn"
          onClick={() => setEngineDropdownOpen((s) => !s)}
          aria-label={t('searchBar.changeEngine')}
          title={currentEngine?.name}
        >
          <img
            src={currentEngine?.icon}
            alt=""
            className="search-engine-btn__icon"
          />
        </button>
      </div>
      <input
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
          onClick={() => { onSearchQueryChange(''); setOpen(false); inputRef.current?.focus(); }}
          aria-label={t('searchBar.clearSearch')}
        >
          <X size={14} />
        </button>
      )}

      {engineDropdownOpen && (
        <div className="search-engine-dropdown">
          {SEARCH_ENGINES.map((engine) => (
            <button
              key={engine.id}
              className={`search-engine-dropdown__item ${engine.id === searchEngine ? 'search-engine-dropdown__item--active' : ''}`}
              onClick={() => { onEngineChange(engine.id); setEngineDropdownOpen(false); }}
            >
              <img src={engine.icon} alt="" className="search-engine-dropdown__icon" />
              {engine.name}
            </button>
          ))}
        </div>
      )}

      {hasDropdown && (
        <ul className="search-suggestions" role="listbox">
          {dropdownItems.map((item, index) => (
            <>
              {(index === 0 || item.type !== dropdownItems[index - 1]?.type) && (
                <li className={`search-suggestions__section ${item.type === 'link' ? 'search-suggestions__section--links' : ''}`} role="presentation">
                  {item.type === 'search' ? t('searchBar.sectionSearch') : item.type === 'link' ? t('searchBar.sectionLinks') : item.type === 'suggestion' ? t('searchBar.sectionSuggestions') : t('searchBar.sectionRecent')}
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
                  : item.type === 'recent' ? <Clock size={14} strokeWidth={2} className="search-suggestions__icon" />
                  : <Globe size={14} strokeWidth={2} className="search-suggestions__icon" />}
                <span className="search-suggestions__text">{item.text}</span>
                {item.type === 'recent' && onRemoveRecentSearch && (
                  <button
                    className="search-suggestions__remove"
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
    </div>
  );
}
