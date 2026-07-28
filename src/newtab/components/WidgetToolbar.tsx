import { useState, useEffect, useRef } from 'preact/hooks';
import { CalendarDays, Clock3, Cloud, Search, CheckSquare, type LucideIcon } from 'lucide-preact';
import type { WidgetType, TopWidgetConfig } from '@shared/types';
import { CityAutocomplete } from './CityAutocomplete';
import { useI18n } from '@shared/i18n';

interface WidgetOption {
  type: WidgetType | 'board' | 'notes' | 'search';
  label: string;
  icon: LucideIcon;
  hasToggle?: boolean;
  hasAdd?: boolean;
  hasCity?: boolean;
}

interface WidgetToolbarProps {
  topWidgets: TopWidgetConfig[];
  onToggleWidget: (type: WidgetType) => void;
  onAddWidget: (type: WidgetType) => void;
  onCityChange: (city: string) => void;
  onClose: () => void;
}

export function WidgetToolbar({
  topWidgets,
  onToggleWidget,
  onAddWidget,
  onCityChange,
  onClose
}: WidgetToolbarProps) {
  const { t } = useI18n();

  const BLOCK_WIDGETS: WidgetOption[] = [
    { type: 'calendar', label: t('widgetToolbar.calendar'), icon: CalendarDays, hasAdd: true },
    { type: 'clock', label: t('widgetToolbar.clock'), icon: Clock3, hasAdd: true },
    { type: 'weather', label: t('widgetToolbar.weather'), icon: Cloud, hasAdd: true },
    { type: 'todo', label: t('widgetToolbar.todo'), icon: CheckSquare, hasAdd: true },
  ];

  const HEADER_WIDGETS: WidgetOption[] = [
    { type: 'clock', label: t('widgetToolbar.clock'), icon: Clock3, hasToggle: true },
    { type: 'search', label: t('widgetToolbar.search'), icon: Search, hasToggle: true },
    { type: 'weather', label: t('widgetToolbar.weather'), icon: Cloud, hasToggle: true, hasCity: true }
  ];

  const [cityInput, setCityInput] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const weatherWidget = topWidgets.find((w) => w.type === 'weather');
    if (weatherWidget?.city) {
      setCityInput(weatherWidget.city);
    }
  }, [topWidgets]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const isWidgetActive = (type: WidgetType) => {
    return topWidgets.some((w) => w.type === type);
  };

  const filterOptions = (options: WidgetOption[]) => options;

  const handleApplyCity = () => {
    if (cityInput.trim()) {
      onCityChange(cityInput.trim());
    }
  };

  return (
    <div className="widget-toolbar" ref={panelRef}>
      <div className="widget-toolbar__header">
        <h3>{t('widgetToolbar.title')}</h3>
      </div>

      <div className="widget-toolbar__group">
        <h4 className="widget-toolbar__group-title">{t('widgetToolbar.blocks')}</h4>
        <div className="widget-toolbar__list">
          {filterOptions(BLOCK_WIDGETS).map((option) => {
          const WidgetIcon = option.icon;
          const isActive = option.type !== 'board' && option.type !== 'notes'
            ? isWidgetActive(option.type as WidgetType)
            : false;

          return (
            <div key={option.type} className="widget-toolbar__item">
              <div className="widget-toolbar__item-info">
                <WidgetIcon size={18} strokeWidth={2} />
                <span>{option.label}</span>
              </div>

              {option.hasAdd && (
                <button
                  className="widget-toolbar__add-btn"
                  onClick={() => onAddWidget(option.type as WidgetType)}
                >
                  {t('widgetToolbar.add')}
                </button>
              )}

              {option.hasToggle && (
                <label className="widget-toolbar__toggle">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={() => onToggleWidget(option.type as WidgetType)}
                  />
                  <span className="widget-toolbar__toggle-slider" />
                </label>
              )}
            </div>
          );
        })}
      </div>
      </div>

      <div className="widget-toolbar__group">
        <h4 className="widget-toolbar__group-title">{t('widgetToolbar.header')}</h4>
        <div className="widget-toolbar__list">
          {filterOptions(HEADER_WIDGETS).map((option) => {
          const WidgetIcon = option.icon;
          const isActive = option.type !== 'board' && option.type !== 'notes'
            ? isWidgetActive(option.type as WidgetType)
            : false;

          return (
            <div key={option.type} className="widget-toolbar__item">
              <div className="widget-toolbar__item-info">
                <WidgetIcon size={18} strokeWidth={2} />
                <span>{option.label}</span>
              </div>

              {option.hasAdd && (
                <button
                  className="widget-toolbar__add-btn"
                  onClick={() => onAddWidget(option.type as WidgetType)}
                >
                  {t('widgetToolbar.add')}
                </button>
              )}

              {option.hasToggle && (
                <label className="widget-toolbar__toggle">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={() => onToggleWidget(option.type as WidgetType)}
                  />
                  <span className="widget-toolbar__toggle-slider" />
                </label>
              )}
            </div>
          );
        })}
      </div>

          {isWidgetActive('weather') && (
            <div className="widget-toolbar__city">
              <CityAutocomplete
                value={cityInput}
                onChange={setCityInput}
                onSelect={onCityChange}
                placeholder={t('widgetToolbar.city')}
                id="widget-toolbar-city"
              />
              <button
                className="widget-toolbar__apply-btn"
                onClick={handleApplyCity}
              >
                {t('widgetToolbar.apply')}
              </button>
            </div>
          )}
      </div>

    </div>
  );
}
