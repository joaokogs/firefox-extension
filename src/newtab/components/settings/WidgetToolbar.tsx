import { useState, useEffect } from 'preact/hooks';
import { CalendarDays, Clock3, Cloud, Search, CheckSquare, type LucideIcon } from 'lucide-preact';
import type { WidgetType, TopWidgetConfig } from '@shared/types';
import { CityAutocomplete } from '../ui/CityAutocomplete';
import { useI18n } from '@shared/i18n';
import {
  uiButtonSecondaryClass,
  uiSwitchInputClass,
  uiSwitchLabelClass,
  uiSwitchTrackClass
} from '@shared/ui/classes';

interface WidgetOption {
  type: WidgetType | 'search';
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
}

export function WidgetToolbar({
  topWidgets,
  onToggleWidget,
  onAddWidget,
  onCityChange
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

  useEffect(() => {
    const weatherWidget = topWidgets.find((w) => w.type === 'weather');
    if (weatherWidget?.city) {
      setCityInput(weatherWidget.city);
    }
  }, [topWidgets]);

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
    <div className="dialog__body">
      <div className="widget-toolbar__group">
        <h4 className="dialog__section-title">{t('widgetToolbar.blocks')}</h4>
        <div className="widget-toolbar__list">
          {filterOptions(BLOCK_WIDGETS).map((option) => {
          const WidgetIcon = option.icon;
          const isActive = isWidgetActive(option.type as WidgetType);

          return (
            <div key={option.type} className="widget-toolbar__item">
              <div className="widget-toolbar__item-info">
                <WidgetIcon size={18} strokeWidth={2} />
                <span>{option.label}</span>
              </div>

              {option.hasAdd && (
                <button
                  className={`${uiButtonSecondaryClass} min-h-8 px-4 py-1.5 text-xs`}
                  onClick={() => onAddWidget(option.type as WidgetType)}
                >
                  {t('widgetToolbar.add')}
                </button>
              )}

              {option.hasToggle && (
                <label className={uiSwitchLabelClass}>
                  <input
                    className={uiSwitchInputClass}
                    type="checkbox"
                    checked={isActive}
                    onChange={() => onToggleWidget(option.type as WidgetType)}
                  />
                  <span className={uiSwitchTrackClass} />
                </label>
              )}
            </div>
          );
        })}
        </div>
      </div>

      <div className="widget-toolbar__group">
        <h4 className="dialog__section-title">{t('widgetToolbar.header')}</h4>
        <div className="widget-toolbar__list">
          {filterOptions(HEADER_WIDGETS).map((option) => {
          const WidgetIcon = option.icon;
          const isActive = isWidgetActive(option.type as WidgetType);

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
                <label className={uiSwitchLabelClass}>
                  <input
                    className={uiSwitchInputClass}
                    type="checkbox"
                    checked={isActive}
                    onChange={() => onToggleWidget(option.type as WidgetType)}
                  />
                  <span className={uiSwitchTrackClass} />
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
                placeholder={t('widgetToolbar.city')}
                id="widget-toolbar-city"
              />
              <button
                className={`${uiButtonSecondaryClass} min-h-10 shrink-0 px-4 py-2 text-xs`}
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
