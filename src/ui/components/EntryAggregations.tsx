import { getFieldType } from '@/core/fields';
import type { Entry, Field, FieldTypeId } from '@/core/types';
import { resolveMax } from '@/core/fields/outOf';

interface Props {
  fields: Field[];
  /** Already filtered: aggregations always respect the active filters. */
  entries: Entry[];
}

/**
 * What each field type can aggregate. A field opts in by listing the key in
 * `field.config.aggregations`, which is what the FieldEditor checkboxes write
 * to. The keys are stored, so renaming one needs a data migration.
 */
export function availableAggregationsFor(
  type: FieldTypeId,
): { key: string; label: string }[] {
  switch (type) {
    case 'currency':
    case 'number':
    case 'duration':
      return [{ key: 'sum', label: 'Sum at top of list' }];
    case 'score':
      return [{ key: 'average', label: 'Average at top of list' }];
    case 'count':
      return [
        { key: 'average', label: 'Average at top of list' },
        { key: 'completedCount', label: 'Completed count' },
      ];
    case 'table':
      return [{ key: 'rowCount', label: 'Total rows at top of list' }];
    case 'select':
      return [{ key: 'counts', label: 'Count per option' }];
    case 'checkmark':
      return [{ key: 'doneCount', label: 'Done count' }];
    default:
      return [];
  }
}

export default function EntryAggregations({ fields, entries }: Props) {
  if (entries.length === 0) return null;

  // Flat array so the chips flex-wrap uniformly. Each label comes from the
  // field name plus the aggregation type.
  const chips: Array<{ key: string; node: React.ReactNode }> = [];

  for (const field of fields) {
    const aggs = (field.config.aggregations as string[] | undefined) ?? [];
    if (aggs.length === 0) continue;

    // Only entries where this field has a value contribute.
    const populated = entries
      .map((e) => e.values[field.id])
      .filter((v) => v != null && v !== '');

    if (
      aggs.includes('sum') &&
      ['currency', 'number', 'duration'].includes(field.type)
    ) {
      const total = populated.reduce<number>(
        (acc, v) => acc + (typeof v === 'number' ? v : 0),
        0,
      );
      chips.push({
        key: `${field.id}-sum`,
        node: <StatChip field={field} label="Total" value={total} />,
      });
    }

    // Scores and counts average rather than sum: "34/10" across 5 entries is
    // nonsense, "6.8/10" is the number worth showing.
    if (
      aggs.includes('average') &&
      (field.type === 'score' || field.type === 'count')
    ) {
      const nums = populated.filter(
        (v): v is number => typeof v === 'number' && !Number.isNaN(v),
      );
      if (nums.length > 0) {
        const avg = nums.reduce((acc, n) => acc + n, 0) / nums.length;
        chips.push({
          key: `${field.id}-average`,
          node: <StatChip field={field} label="Average" value={avg} />,
        });
      }
    }

    // How many counts hit their target: the "3 of 7 sets done" read.
    if (aggs.includes('completedCount') && field.type === 'count') {
      const max = resolveMax(field.config as { max: number });
      const done = entries.filter((e) => {
        const v = e.values[field.id];
        return typeof v === 'number' && v >= max;
      }).length;
      chips.push({
        key: `${field.id}-completed`,
        node: <DoneChip name={field.name} done={done} total={entries.length} />,
      });
    }

    // Rows summed across entries, i.e. "how many sets this month". Anything
    // that has to understand the columns (heaviest set, total volume) needs an
    // aggregation of its own.
    if (aggs.includes('rowCount') && field.type === 'table') {
      const total = populated.reduce<number>(
        (acc, v) => acc + (Array.isArray(v) ? v.length : 0),
        0,
      );
      chips.push({
        key: `${field.id}-rows`,
        node: <PlainStatChip name={field.name} label="Rows" value={total} />,
      });
    }

    if (aggs.includes('counts') && field.type === 'select') {
      const counts = new Map<string, number>();
      const options = (field.config as { options?: string[] }).options ?? [];
      // Start every option at 0 so those with no entries still render. On a
      // job tracker, "offered: 0" is worth seeing.
      options.forEach((opt) => counts.set(opt, 0));
      populated.forEach((v) => {
        const key = v as string;
        if (counts.has(key)) counts.set(key, counts.get(key)! + 1);
      });
      chips.push({
        key: `${field.id}-counts`,
        node: <SelectCountChip name={field.name} counts={counts} />,
      });
    }

    if (aggs.includes('doneCount') && field.type === 'checkmark') {
      const done = entries.filter((e) => e.values[field.id] === true).length;
      chips.push({
        key: `${field.id}-done`,
        node: <DoneChip name={field.name} done={done} total={entries.length} />,
      });
    }
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {chips.map((c) => (
        <div key={c.key}>{c.node}</div>
      ))}
    </div>
  );
}

function StatChip({
  field,
  label,
  value,
}: {
  field: Field;
  label: string;
  value: number;
}) {
  const def = getFieldType(field.type);
  return (
    <div className="bg-grape-50 border border-grape-100 rounded-lg px-3 py-1.5">
      <p className="text-grape-400 text-[10px] font-semibold uppercase tracking-wide">
        {field.name} · {label}
      </p>
      <div className="text-grape-900 text-[14px] font-semibold mt-0.5">
        <def.Display value={value as any} config={field.config as any} />
      </div>
    </div>
  );
}

/** For numbers that shouldn't go through a field's own Display. */
function PlainStatChip({
  name,
  label,
  value,
}: {
  name: string;
  label: string;
  value: number;
}) {
  return (
    <div className="bg-grape-50 border border-grape-100 rounded-lg px-3 py-1.5">
      <p className="text-grape-400 text-[10px] font-semibold uppercase tracking-wide">
        {name} · {label}
      </p>
      <p className="text-grape-900 text-[14px] font-semibold mt-0.5 tabular-nums">
        {value}
      </p>
    </div>
  );
}

function SelectCountChip({
  name,
  counts,
}: {
  name: string;
  counts: Map<string, number>;
}) {
  return (
    <div className="bg-grape-50 border border-grape-100 rounded-lg px-3 py-1.5">
      <p className="text-grape-400 text-[10px] font-semibold uppercase tracking-wide">
        {name}
      </p>
      <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
        {Array.from(counts.entries()).map(([opt, count]) => (
          <span key={opt} className="text-[13px] text-grape-700">
            <span className="font-semibold">{opt}</span>{' '}
            <span className="text-grape-500">{count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function DoneChip({
  name,
  done,
  total,
}: {
  name: string;
  done: number;
  total: number;
}) {
  return (
    <div className="bg-grape-50 border border-grape-100 rounded-lg px-3 py-1.5">
      <p className="text-grape-400 text-[10px] font-semibold uppercase tracking-wide">
        {name}
      </p>
      <p className="text-grape-900 text-[14px] font-semibold mt-0.5">
        {done} of {total} done
      </p>
    </div>
  );
}
