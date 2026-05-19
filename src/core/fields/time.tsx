import type { FieldTypeDef } from '../types';

interface TimeConfig {
  includeDate: boolean;
  format: '12h' | '24h';
  autoNow: boolean; // pre-fill with current time when the entry form opens
}

// Convert a UTC millisecond timestamp to the string format datetime-local expects
// (which is local-time, no timezone, "YYYY-MM-DDTHH:mm").
function toLocalDatetimeString(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDisplay(ts: number, config: TimeConfig): string {
  const d = new Date(ts);
  const timeStr = new Intl.DateTimeFormat('default', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: config.format === '12h',
  }).format(d);
  if (!config.includeDate) return timeStr;
  const dateStr = new Intl.DateTimeFormat('default', { dateStyle: 'medium' }).format(d);
  return `${dateStr} · ${timeStr}`;
}

export const timeField: FieldTypeDef<TimeConfig, number> = {
  id: 'time',
  label: 'Time',
  icon: 'Clock',
  defaultConfig: { includeDate: true, format: '12h', autoNow: true },
  defaultValue: null,
  computeDefault: (config) => (config.autoNow ? Date.now() : null),
  validate: (value) => {
    if (value == null) return null;
    if (typeof value !== 'number' || Number.isNaN(value)) return 'Invalid time';
    return null;
  },
  Input: ({ value, onChange, autoFocus }) => (
    <input
      type="datetime-local"
      value={value ? toLocalDatetimeString(value) : ''}
      onChange={(e) => {
        if (!e.target.value) return onChange(null);
        onChange(new Date(e.target.value).getTime());
      }}
      autoFocus={autoFocus}
      className="w-full bg-transparent text-grape-900 placeholder:text-grape-300 text-[15px] py-2 focus:outline-none"
    />
  ),
  Display: ({ value, config }) => {
    if (value == null) return <em className="text-grape-300 text-[15px]">empty</em>;
    return (
      <span className="text-grape-800 text-[15px] tabular-nums">
        {formatDisplay(value, config)}
      </span>
    );
  },
};
