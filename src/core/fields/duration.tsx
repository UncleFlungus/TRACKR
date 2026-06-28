import { useEffect, useState } from 'react';
import { Play, Square, RotateCcw, Pencil, Check, X } from 'lucide-react';
import type { FieldTypeDef } from '../types';

interface DurationConfig {}

/** Format seconds as M:SS or HH:MM:SS depending on length. */
function formatDuration(totalSec: number): string {
  const sec = Math.floor(totalSec % 60);
  const min = Math.floor((totalSec / 60) % 60);
  const hr = Math.floor(totalSec / 3600);
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (hr > 0) return `${hr}:${pad(min)}:${pad(sec)}`;
  return `${min}:${pad(sec)}`;
}

/**
 * Parse human-typed durations like "1:23:45", "5:30", "90", "1h 20m", "45s"
 * into seconds. Returns null if unparseable.
 *
 * Accepted shapes:
 *   "1:23:45"  → HH:MM:SS
 *   "5:30"     → MM:SS
 *   "90"       → 90 seconds (bare number)
 *   "1h 20m"   → 1 hour 20 minutes (compact form)
 *   "45m"      → 45 minutes
 *   "1h"       → 1 hour
 */
function parseDuration(input: string): number | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;

  // Colon-separated form: 1:23:45 or 5:30
  if (/^\d+(:\d{1,2}){1,2}$/.test(s)) {
    const parts = s.split(':').map(Number);
    if (parts.some((n) => !Number.isFinite(n))) return null;
    if (parts.length === 3) {
      const [h, m, sec] = parts;
      if (m >= 60 || sec >= 60) return null;
      return h * 3600 + m * 60 + sec;
    }
    if (parts.length === 2) {
      const [m, sec] = parts;
      if (sec >= 60) return null;
      return m * 60 + sec;
    }
  }

  // Compact form: "1h 20m 30s" with any subset.
  const compact = s.match(/^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?\s*(?:(\d+)\s*s)?$/);
  if (compact && (compact[1] || compact[2] || compact[3])) {
    const h = Number(compact[1] ?? 0);
    const m = Number(compact[2] ?? 0);
    const sec = Number(compact[3] ?? 0);
    if ([h, m, sec].some((n) => !Number.isFinite(n))) return null;
    return h * 3600 + m * 60 + sec;
  }

  // Bare integer = seconds.
  if (/^\d+$/.test(s)) return Number(s);

  return null;
}

function DurationInput({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  // When startedAt is set, the timer is running. `accumulated` holds the
  // seconds saved from previous run/stop cycles — letting Resume pick up
  // from where we paused instead of restarting at zero.
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [accumulated, setAccumulated] = useState<number>(0);
  const [, setTick] = useState(0);

  // Manual-entry mode toggle. When true, swap the timer UI for a text input.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState(false);

  useEffect(() => {
    if (startedAt === null) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 500);
    return () => window.clearInterval(id);
  }, [startedAt]);

  function commitDraft() {
    const parsed = parseDuration(draft);
    if (parsed == null) {
      setDraftError(true);
      return;
    }
    setDraftError(false);
    setEditing(false);
    setDraft('');
    setAccumulated(0);
    setStartedAt(null);
    onChange(parsed);
  }

  // ---------------- Manual entry mode ----------------
  if (editing) {
    return (
      <div className="py-1">
        <div className="flex items-center gap-2">
          <input
            type="text"
            inputMode="numeric"
            autoFocus
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setDraftError(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitDraft();
              if (e.key === 'Escape') {
                setEditing(false);
                setDraft('');
                setDraftError(false);
              }
            }}
            placeholder="e.g. 1:23:45, 90, 1h 20m"
            className={`flex-1 bg-grape-50 text-[15px] text-grape-900 placeholder:text-grape-300 rounded-md px-2.5 py-1.5 focus:outline-none ${
              draftError ? 'ring-1 ring-rose-400' : ''
            }`}
          />
          <button
            type="button"
            onClick={commitDraft}
            className="text-grape-500 hover:text-grape-700 p-1 rounded-md"
            aria-label="Save"
          >
            <Check className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setDraft('');
              setDraftError(false);
            }}
            className="text-grape-300 hover:text-grape-600 p-1 rounded-md"
            aria-label="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {draftError && (
          <p className="text-rose-500 text-[11px] mt-1">
            Couldn't parse — try "1:23", "90", or "1h 20m"
          </p>
        )}
      </div>
    );
  }

  // ---------------- Running ----------------
  if (startedAt !== null) {
    const elapsed = accumulated + (Date.now() - startedAt) / 1000;
    return (
      <div className="flex items-center gap-3 py-1">
        <span className="text-grape-900 text-[18px] font-display font-semibold tabular-nums">
          {formatDuration(elapsed)}
        </span>
        <button
          type="button"
          onClick={() => {
            // Stop: snapshot current elapsed into accumulated and write to value.
            // Doesn't clear accumulated, so Resume can pick up from here.
            const total = accumulated + (Date.now() - startedAt) / 1000;
            setStartedAt(null);
            setAccumulated(total);
            onChange(Math.round(total));
          }}
          className="inline-flex items-center gap-1 bg-grape-500 hover:bg-grape-600 text-white text-[12px] font-semibold rounded-lg px-2.5 py-1.5 transition-colors"
        >
          <Square className="w-3 h-3 fill-white" strokeWidth={0} /> Stop
        </button>
      </div>
    );
  }

  // ---------------- Stopped with a value ----------------
  // accumulated > 0 means the user stopped a run; offer Resume + Finish.
  // accumulated === 0 means the value came from manual entry or a previous
  // session — show Reset/Edit instead of Resume.
  if (value != null && value > 0) {
    const fromTimer = accumulated > 0;
    return (
      <div className="flex items-center gap-2 py-1 flex-wrap">
        <span className="text-grape-900 text-[18px] font-display font-semibold tabular-nums">
          {formatDuration(value)}
        </span>
        {fromTimer && (
          <button
            type="button"
            onClick={() => setStartedAt(Date.now())}
            className="inline-flex items-center gap-1 bg-grape-50 hover:bg-grape-100 text-grape-700 text-[12px] font-semibold rounded-lg px-2.5 py-1.5 transition-colors"
          >
            <Play className="w-3 h-3 fill-grape-700" strokeWidth={0} /> Resume
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setEditing(true);
            setDraft(formatDuration(value));
          }}
          className="text-grape-400 hover:text-grape-600 p-1 rounded-md"
          aria-label="Edit value"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => {
            setAccumulated(0);
            onChange(null);
          }}
          className="text-grape-400 hover:text-grape-600 p-1 rounded-md"
          aria-label="Reset"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  // ---------------- Idle ----------------
  return (
    <div className="flex items-center gap-2 py-1">
      <button
        type="button"
        onClick={() => {
          setAccumulated(0);
          setStartedAt(Date.now());
        }}
        className="inline-flex items-center gap-1.5 bg-grape-50 hover:bg-grape-100 text-grape-700 text-[12px] font-semibold rounded-lg px-2.5 py-1.5 transition-colors"
      >
        <Play className="w-3 h-3 fill-grape-700" strokeWidth={0} /> Start timer
      </button>
      <button
        type="button"
        onClick={() => {
          setEditing(true);
          setDraft('');
        }}
        className="text-grape-500 hover:text-grape-700 text-[12px] font-semibold px-1.5"
      >
        or enter manually
      </button>
    </div>
  );
}

export const durationField: FieldTypeDef<DurationConfig, number> = {
  id: 'duration',
  label: 'Duration',
  icon: 'Timer',
  defaultConfig: {},
  defaultValue: null,
  validate: (value) => {
    if (value == null) return null;
    if (typeof value !== 'number' || value < 0) return 'Invalid duration';
    return null;
  },
  Input: DurationInput,
  Display: ({ value }) => {
    if (value == null)
      return <em className="text-grape-300 text-[15px]">not timed</em>;
    return (
      <span className="text-grape-800 text-[15px] tabular-nums">
        {formatDuration(value)}
      </span>
    );
  },
};
