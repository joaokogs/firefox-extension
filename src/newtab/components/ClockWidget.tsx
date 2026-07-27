import { useEffect, useState } from 'preact/hooks';
import { useI18n } from '@shared/i18n';

export function ClockWidgetView({ timezone, label }: { timezone?: string; label?: string }) {
  const { t } = useI18n();
  const WEEKDAYS = t('clock.days').split(',');
  const MONTHS = t('clock.months').split(',');
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    setNow(new Date());
    const msToNextMin = (60 - new Date().getSeconds()) * 1000;
    const intervalRef: { current: number | null } = { current: null };
    const timeoutRef = window.setTimeout(() => {
      setNow(new Date());
      intervalRef.current = window.setInterval(() => setNow(new Date()), 60000);
    }, msToNextMin);
    return () => {
      clearTimeout(timeoutRef);
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
  }, []);

  const options: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: false
  };

  const timeStr = timezone ? now.toLocaleTimeString('en', options) : formatTime(now);
  const weekday = WEEKDAYS[now.getDay()];
  const month = MONTHS[now.getMonth()];
  const day = now.getDate();
  const displayLabel = label || `${weekday} ${month} ${day}`;

  return (
    <div className="clock-widget">
      <div className="clock-widget__label">{displayLabel}</div>
      <div className="clock-widget__time">{timeStr}</div>
    </div>
  );
}

function formatTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}
