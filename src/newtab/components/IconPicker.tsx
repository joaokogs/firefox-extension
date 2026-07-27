import { useState } from 'preact/hooks';
import { useI18n } from '@shared/i18n';
import { ICON_PICKER_LIST, getLucideIcon, getFaIconDef } from './AnyIcon';

interface IconPickerProps {
  selected?: string | null;
  onSelect: (icon: string | null) => void;
}

export function IconPicker({ selected, onSelect }: IconPickerProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = query.trim()
    ? ICON_PICKER_LIST.filter((i) => i.label.toLowerCase().includes(query.toLowerCase()))
    : ICON_PICKER_LIST;

  return (
    <div className="icon-picker">
      <button
        type="button"
        className="icon-picker__trigger"
        onClick={() => setOpen((o) => !o)}
        aria-label={t('iconPicker.selectIcon')}
        title={t('iconPicker.linkIcon')}
      >
        {selected ? <PickerIcon name={selected} size={18} /> : <span className="icon-picker__placeholder">+</span>}
      </button>
      {open && (
        <div className="icon-picker__dropdown">
          <input
            type="text"
            className="icon-picker__search"
            placeholder={t('iconPicker.searchIcon')}
            value={query}
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
            autoFocus
          />
          <div className="icon-picker__grid">
            {filtered.map((item) => (
              <button
                key={item.name}
                className={`icon-picker__option ${selected === item.name ? 'icon-picker__option--active' : ''}`}
                onClick={() => {
                  onSelect(item.name);
                  setOpen(false);
                  setQuery('');
                }}
                aria-label={item.label}
                title={item.label}
              >
                <PickerIcon name={item.name} size={18} />
              </button>
            ))}
            <button
              className="icon-picker__option icon-picker__option--clear"
              onClick={() => {
                onSelect(null);
                setOpen(false);
                setQuery('');
              }}
              aria-label={t('iconPicker.noIcon')}
              title={t('iconPicker.noIconFavicon')}
            >
              <span style={{ fontSize: 18, lineHeight: 1 }}>✕</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PickerIcon({ name, size }: { name: string; size: number }) {
  if (name.startsWith('fa:') || name.startsWith('fab:') || name.startsWith('far:')) {
    const def = getFaIconDef(name);
    if (!def) return null;
    const prefix = def.prefix === 'fab' ? 'fa-brands' : def.prefix === 'far' ? 'fa-regular' : 'fa-solid';
    return <i class={`${prefix} ${def.iconName}`} style={{ fontSize: size, width: size, textAlign: 'center' }} />;
  }

  const IconComponent = getLucideIcon(name);
  if (!IconComponent) return null;
  return <IconComponent size={size} strokeWidth={2} />;
}
