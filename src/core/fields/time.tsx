import type { FieldTypeDef } from '../types';

interface TimeConfig {
  /** What to show and let the user pick. */
  display: 'datetime' | 'date' | 'time';
  format: '12h' | '24h';
  autoNow: boolean; // pre-fill with current timestamp when the entry form opens
}

// Convert a UTC ms timestamp to the local-time string each <input type> expects.
function toLocalDatetimeString(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function toLocalDateString(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function toLocalTimeString(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDisplay(ts: number, config: TimeConfig): string {
  const d = new Date(ts);
  if (config.display === 'date') {
    return new Intl.DateTimeFormat('default', { dateStyle: 'medium' }).format(d);
  }
  if (config.display === 'time') {
    return new Intl.DateTimeFormat('default', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: config.format === '12h',
    }).format(d);
  }
  // datetime — both, joined.
  const dateStr = new Intl.DateTimeFormat('default', { dateStyle: 'medium' }).format(d);
  const timeStr = new Intl.DateTimeFormat('default', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: config.format === '12h',
  }).format(d);
  return `${dateStr} · ${timeStr}`;
}

// Migration shim: older fields created before this rewrite have the old
// `includeDate: boolean` shape. Map it to the new `display` setting so they
// keep working without a data migration.
function normalizeConfig(config: TimeConfig | (TimeConfig & { includeDate?: boolean })): TimeConfig {
  if (!config.display) {
    const legacy = config as TimeConfig & { includeDate?: boolean };
    return {
      ...config,
      display: legacy.includeDate === false ? 'time' : 'datetime',
    };
  }
  return config;
}

export const timeField: FieldTypeDef<TimeConfig, number> = {
  id: 'time',
  label: 'Time',
  icon: 'Clock',
  defaultConfig: { display: 'datetime', format: '12h', autoNow: true },
  defaultValue: null,
  computeDefault: (config) => (config.autoNow ? Date.now() : null),
  validate: (value) => {
    if (value == null) return null;
    if (typeof value !== 'number' || Number.isNaN(value)) return 'Invalid time';
    return null;
  },
  Input: ({ value, onChange, autoFocus, config }) => {
    const cfg = normalizeConfig(config);
    if (cfg.display === 'date') {
      return (
        <input
          type="date"
          value={value ? toLocalDateString(value) : ''}
          onChange={(e) => {
            if (!e.target.value) return onChange(null);
            // Date-only input is local midnight on the picked day.
            onChange(new Date(e.target.value + 'T00:00').getTime());
          }}
          autoFocus={autoFocus}
          className="w-full bg-transparent text-grape-900 placeholder:text-grape-300 text-[15px] py-2 focus:outline-none"
        />
      );
    }
    if (cfg.display === 'time') {
      // Time-only: keep the date portion of any existing value, just replace
      // the time. If no value yet, anchor to today's date.
      const base = value ? new Date(value) : new Date();
      return (
        <input
          type="time"
          value={value ? toLocalTimeString(value) : ''}
          onChange={(e) => {
            if (!e.target.value) return onChange(null);
            const [hh, mm] = e.target.value.split(':').map(Number);
            const d = new Date(base);
            d.setHours(hh, mm, 0, 0);
            onChange(d.getTime());
          }}
          autoFocus={autoFocus}
          className="w-full bg-transparent text-grape-900 placeholder:text-grape-300 text-[15px] py-2 focus:outline-none"
        />
      );
    }
    return (
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
    );
  },
  Display: ({ value, config }) => {
    if (value == null) return <em className="text-grape-300 text-[15px]">empty</em>;
    return (
      <span className="text-grape-800 text-[15px] tabular-nums">
        {formatDisplay(value, normalizeConfig(config))}
      </span>
    );
  },
};