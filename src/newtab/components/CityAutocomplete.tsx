import { useEffect, useRef, useState } from 'preact/hooks';
import { useI18n } from '@shared/i18n';

interface CityResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  admin1?: string;
  country?: string;
}

interface CityAutocompleteProps {
  value: string;
  onChange: (city: string) => void;
  onSelect?: (city: string) => void;
  placeholder?: string;
  id?: string;
  className?: string;
}

export function CityAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder: placeholderProp,
  id,
  className = ''
}: CityAutocompleteProps) {
  const { t } = useI18n();
  const placeholder = placeholderProp ?? t('cityAutocomplete.placeholder');
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<CityResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const fetchCities = async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=10&language=pt&format=json`
      );
      if (!response.ok) throw new Error(t('cityAutocomplete.searchFailed'));
      const data = await response.json();
      const list: CityResult[] = data.results || [];
      setResults(list);
      setOpen(list.length > 0);
      setHighlighted(0);
    } catch {
      setResults([]);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const handleInput = (val: string) => {
    setQuery(val);
    onChange(val);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      fetchCities(val);
    }, 300);
  };

  const handleSelect = (result: CityResult) => {
    const name = result.name;
    setQuery(name);
    onChange(name);
    if (onSelect) onSelect(name);
    setOpen(false);
    setResults([]);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const result = results[highlighted];
      if (result) handleSelect(result);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={`city-autocomplete ${className}`}>
      <input
        id={id}
        type="text"
        value={query}
        onInput={(e) => handleInput((e.target as HTMLInputElement).value)}
        onKeyDown={handleKeyDown}
        onFocus={() => query.trim() && results.length > 0 && setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? `${id || 'city'}-listbox` : undefined}
        role="combobox"
      />
      {loading && <span className="city-autocomplete__spinner" aria-hidden="true" />}
      {open && results.length > 0 && (
        <ul
          id={`${id || 'city'}-listbox`}
          className="city-autocomplete__dropdown"
          role="listbox"
        >
          {results.map((result, index) => (
            <li
              key={result.id}
              className={`city-autocomplete__option ${index === highlighted ? 'city-autocomplete__option--highlighted' : ''}`}
              onClick={() => handleSelect(result)}
              onMouseEnter={() => setHighlighted(index)}
              role="option"
              aria-selected={index === highlighted}
            >
              <span className="city-autocomplete__option-name">{result.name}</span>
              <span className="city-autocomplete__option-detail">
                {result.admin1 ? `${result.admin1}, ` : ''}
                {result.country || ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
