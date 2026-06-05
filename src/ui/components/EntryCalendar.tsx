import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getEntryDate, getEntryChipText, toDayKey } from '@/core/dateUtils';
import type { Entry, Field } from '@/core/types';

interface Props {
  entries: Entry[];
  fields: Field[];
  /** Called when the user clicks a day cell. Provides the date for that cell. */
  onDayClick: (date: Date) => void;
  /** Called when the user clicks an individual entry chip. */
  onEntryClick: (entryId: string) => void;
}

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const MAX_CHIPS_PER_CELL = 3;

/**
 * Calendar month view. Renders a 6×7 grid (always — keeps row height stable
 * across months). Out-of-month days are dimmed but still clickable.
 *
 * Entries are grouped by their effective date (see dateUtils.getEntryDate),
 * with up to 3 chips shown per cell and "+N more" for overflow.
 */
export default function EntryCalendar({
  entries,
  fields,
  onDayClick,
  onEntryClick,
}: Props) {
  // Anchor to the first of the current month so navigation arithmetic is clean.
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  // Group all entries into a map keyed by yyyy-mm-dd (local time).
  // Within a day, sort by full timestamp ascending so morning entries
  // appear before evening ones in the chip stack.
  const entriesByDay = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const entry of entries) {
      const date = getEntryDate(entry, fields);
      const key = toDayKey(date);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(entry);
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          getEntryDate(a, fields).getTime() - getEntryDate(b, fields).getTime(),
      );
    }
    return map;
  }, [entries, fields]);

  // Build the 42-cell grid: start from the Sunday on or before the 1st.
  const gridDays = useMemo(() => {
    const firstOfMonth = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth(),
      1,
    );
    const gridStart = new Date(firstOfMonth);
    gridStart.setDate(1 - firstOfMonth.getDay());
    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      days.push(d);
    }
    return days;
  }, [currentMonth]);

  const todayKey = toDayKey(new Date());

  function prevMonth() {
    setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }
  function nextMonth() {
    setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }
  function goToToday() {
    const t = new Date();
    setCurrentMonth(new Date(t.getFullYear(), t.getMonth(), 1));
  }

  return (
    <div>
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1">
          <button
            onClick={prevMonth}
            className="p-1.5 text-grape-500 hover:text-grape-700 hover:bg-grape-50 rounded-md transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={nextMonth}
            className="p-1.5 text-grape-500 hover:text-grape-700 hover:bg-grape-50 rounded-md transition-colors"
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={goToToday}
            className="ml-1 text-grape-500 hover:text-grape-700 text-[12px] font-semibold px-2 py-1 hover:bg-grape-50 rounded-md transition-colors"
          >
            Today
          </button>
        </div>
        <p className="font-display font-semibold text-grape-900 text-[18px]">
          {MONTH_NAMES[currentMonth.getMonth()]} {currentMonth.getFullYear()}
        </p>
        <div className="w-25" /> {/* Spacer to balance the left controls */}
      </div>

      {/* Day-of-week header */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAYS_OF_WEEK.map((d) => (
          <div
            key={d}
            className="text-center text-grape-400 text-[10px] font-semibold uppercase tracking-wide py-1"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Grid of day cells */}
      <div className="grid grid-cols-7 gap-1">
        {gridDays.map((day) => {
          const key = toDayKey(day);
          const dayEntries = entriesByDay.get(key) ?? [];
          const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
          const isToday = key === todayKey;
          return (
            <DayCell
              key={key}
              date={day}
              dayEntries={dayEntries}
              fields={fields}
              isCurrentMonth={isCurrentMonth}
              isToday={isToday}
              onClick={() => onDayClick(day)}
              onChipClick={onEntryClick}
            />
          );
        })}
      </div>
    </div>
  );
}

function DayCell({
  date,
  dayEntries,
  fields,
  isCurrentMonth,
  isToday,
  onClick,
  onChipClick,
}: {
  date: Date;
  dayEntries: Entry[];
  fields: Field[];
  isCurrentMonth: boolean;
  isToday: boolean;
  onClick: () => void;
  onChipClick: (entryId: string) => void;
}) {
  const overflow = dayEntries.length - MAX_CHIPS_PER_CELL;
  const visibleChips = dayEntries.slice(0, MAX_CHIPS_PER_CELL);

  // Composed classes for the cell:
  //   - bg slightly dimmer for out-of-month days
  //   - border grape-500 for today, grape-100 normally
  //   - min-h to leave room for chips without snapping back when empty
  const baseClasses =
    'min-h-[80px] sm:min-h-[100px] rounded-md p-1 cursor-pointer transition-colors flex flex-col gap-0.5 text-left focus:outline-none';
  const monthClasses = isCurrentMonth ? 'bg-white' : 'bg-grape-50/40';
  const borderClasses = isToday
    ? 'border-2 border-grape-500'
    : 'border border-grape-100 hover:border-grape-300';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className={`${baseClasses} ${monthClasses} ${borderClasses}`}
    >
      <span
        className={`text-[11px] sm:text-[12px] font-semibold ${
          isCurrentMonth ? 'text-grape-700' : 'text-grape-300'
        } ${isToday ? 'text-grape-700' : ''}`}
      >
        {date.getDate()}
      </span>
      {visibleChips.map((entry) => (
        <button
          key={entry.id}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onChipClick(entry.id);
          }}
          className="text-[10px] sm:text-[11px] text-left text-grape-700 bg-grape-100 hover:bg-grape-200 rounded px-1 py-0.5 truncate transition-colors"
        >
          {getEntryChipText(entry, fields)}
        </button>
      ))}
      {overflow > 0 && (
        <span className="text-[10px] text-grape-500 px-1">
          +{overflow} more
        </span>
      )}
    </div>
  );
}
