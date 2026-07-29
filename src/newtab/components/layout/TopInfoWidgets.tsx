import type { TopWidgetConfig } from '@shared/types';
import { ClockWidgetView } from '../widgets/ClockWidget';
import { WeatherWidgetView } from '../widgets/WeatherWidget';

interface TopInfoWidgetsProps {
  configs: TopWidgetConfig[];
}

export function TopInfoWidgets({ configs }: TopInfoWidgetsProps) {
  return (
    <div className="top-info-widgets">
      {configs.map((config, index) => (
        <div key={`${config.type}-${index}`} className="top-info-widget">
          <TopWidget config={config} />
        </div>
      ))}
    </div>
  );
}

function TopWidget({ config }: { config: TopWidgetConfig }) {
  switch (config.type) {
    case 'weather':
      return <WeatherWidgetView city={config.city} />;
    case 'clock':
      return <ClockWidgetView timezone={config.timezone} label={config.label} />;
    default:
      return null;
  }
}
