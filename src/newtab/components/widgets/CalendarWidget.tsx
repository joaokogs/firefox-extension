import { useState, useEffect } from 'preact/hooks';
import { ChevronLeft, ChevronRight } from 'lucide-preact';
import { useI18n } from '@shared/i18n';

export function CalendarWidgetView() {
  const { t } = useI18n();
  const MONTHS = t('calendar.months').split(',');
  const DAYS = t('calendar.days').split(',');
  const [today, setToday] = useState(new Date());
  const [month, setMonth] = useState(new Date());

  useEffect(() => {
    setToday(new Date());
  }, []);

  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const prevMonth = () => setMonth(new Date(year, monthIndex - 1, 1));
  const nextMonth = () => setMonth(new Date(year, monthIndex + 1, 1));

  const isToday = (day: number) => {
    return (
      today.getDate() === day &&
      today.getMonth() === monthIndex &&
      today.getFullYear() === year
    );
  };

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="calendar-widget">
      <div className="calendar-widget__header">
        <button className="calendar-widget__nav" onClick={prevMonth} aria-label={t('calendar.prevMonth')}>
          <ChevronLeft size={16} strokeWidth={2} />
        </button>
        <span className="calendar-widget__month">{MONTHS[monthIndex]} {year}</span>
        <button className="calendar-widget__nav" onClick={nextMonth} aria-label={t('calendar.nextMonth')}>
          <ChevronRight size={16} strokeWidth={2} />
        </button>
      </div>
      <div className="calendar-widget__grid">
        {DAYS.map((d) => (
          <div key={d} className="calendar-widget__day-label">
            {d}
          </div>
        ))}
        {cells.map((day, idx) => (
          <div
            key={idx}
            className={`calendar-widget__day ${day === null ? 'calendar-widget__day--empty' : ''} ${day && isToday(day) ? 'calendar-widget__day--today' : ''}`}
          >
            {day}
          </div>
        ))}
      </div>
    </div>
  );
}
