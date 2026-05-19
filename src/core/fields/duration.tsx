import { useEffect, useState } from 'react';
import { Play, Square, RotateCcw } from 'lucide-react';
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

function DurationInput({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  // When startedAt is set, the timer is running. We trigger re-renders every
  // 500ms via the `tick` state so the displayed elapsed time updates live.
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (startedAt === null) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 500);
    return () => window.clearInterval(id);
  }, [startedAt]);

  // Running state — show live elapsed + stop button
  if (startedAt !== null) {
    const elapsed = (Date.now() - startedAt) / 1000;
    return (
      <div className="flex items-center gap-3 py-1">
        <span className="text-grape-900 text-[18px] font-display font-semibold tabular-nums">
          {formatDuration(elapsed)}
        </span>
        <button
          type="button"
          onClick={() => {
            const finalSec = (Date.now() - startedAt) / 1000;
            setStartedAt(null);
            onChange(Math.round(finalSec));
          }}
          className="inline-flex items-center gap-1 bg-grape-500 hover:bg-grape-600 text-white text-[12px] font-semibold rounded-lg px-2.5 py-1.5 transition-colors"
        >
          <Square className="w-3 h-3 fill-white" strokeWidth={0} /> Stop
        </button>
      </div>
    );
  }

  // Stopped, has a recorded value — show the value with a reset button
  if (value != null && value > 0) {
    return (
      <div className="flex items-center gap-2 py-1">
        <span className="text-grape-900 text-[18px] font-display font-semibold tabular-nums">
          {formatDuration(value)}
        </span>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-grape-400 hover:text-grape-600 p-1 rounded-md"
          aria-label="Reset"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  // Idle — show start button
  return (
    <div className="py-1">
      <button
        type="button"
        onClick={() => setStartedAt(Date.now())}
        className="inline-flex items-center gap-1.5 bg-grape-50 hover:bg-grape-100 text-grape-700 text-[12px] font-semibold rounded-lg px-2.5 py-1.5 transition-colors"
      >
        <Play className="w-3 h-3 fill-grape-700" strokeWidth={0} /> Start timer
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
    if (value == null) return <em className="text-grape-300 text-[15px]">not timed</em>;
    return (
      <span className="text-grape-800 text-[15px] tabular-nums">{formatDuration(value)}</span>
    );
  },
};
