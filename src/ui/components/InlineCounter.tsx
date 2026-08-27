import { Minus, Plus } from 'lucide-react';
import { CountDisplay } from '@/core/fields/count';
import { resolveMax, type OutOfConfig } from '@/core/fields/outOf';

/**
 * Count stepper embedded in an entry row/card, so reps can be ticked up
 * mid-workout without opening the entry. Clicks are stopped from bubbling
 * because the surrounding row is itself a click target that opens the
 * detail modal.
 */
export default function InlineCounter({
  value,
  config,
  onChange,
}: {
  value: number | null;
  config: OutOfConfig;
  onChange: (next: number) => void;
}) {
  const max = resolveMax(config);
  const current = value ?? 0;

  const step = (e: React.MouseEvent, delta: number) => {
    e.stopPropagation();
    onChange(Math.min(max, Math.max(0, current + delta)));
  };

  return (
    <div className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={(e) => step(e, -1)}
        disabled={current <= 0}
        aria-label="Decrease"
        className="w-6 h-6 rounded-full flex items-center justify-center bg-white border border-grape-200 text-grape-600 hover:border-grape-300 hover:bg-grape-50 disabled:opacity-30 transition-colors shrink-0"
      >
        <Minus className="w-3 h-3" strokeWidth={3} />
      </button>

      <CountDisplay value={current} config={config} />

      <button
        type="button"
        onClick={(e) => step(e, 1)}
        disabled={current >= max}
        aria-label="Increase"
        className="w-6 h-6 rounded-full flex items-center justify-center bg-white border border-grape-200 text-grape-600 hover:border-grape-300 hover:bg-grape-50 disabled:opacity-30 transition-colors shrink-0"
      >
        <Plus className="w-3 h-3" strokeWidth={3} />
      </button>
    </div>
  );
}
