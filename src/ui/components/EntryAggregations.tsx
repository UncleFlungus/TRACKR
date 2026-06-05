import { getFieldType } from '@/core/fields';
import type { Entry, Field, FieldTypeId } from '@/core/types';

interface Props {
  fields: Field[];
  /** Filtered entries — aggregations always respect active filters. */
  entries: Entry[];
}

/**
 * Available aggregations per field type. A field opts in to an aggregation
 * by including its key in `field.config.aggregations` (an array). The same
 * array is what the FieldEditor's checkboxes write to.
 *
 * Aggregation keys are stable strings — changing them would require a
 * data migration on existing fields.
 */
export function availableAggregationsFor(
  type: FieldTypeId,
): { key: string; label: string }[] {
  switch (type) {
    case 'currency':
    case 'number':
    case 'duration':
      return [{ key: 'sum', label: 'Sum at top of list' }];
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

  // Collect chips into a flat array so we can flex-wrap them uniformly.
  // Each chip pulls its label from the field name + aggregation type.
  const chips: Array<{ key: string; node: React.ReactNode }> = [];

  for (const field of fields) {
    const aggs = (field.config.aggregations as string[] | undefined) ?? [];
    if (aggs.length === 0) continue;

    // Only entries where this field has a value contribute to aggregations.
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
        node: <SumChip field={field} value={total} />,
      });
    }

    if (aggs.includes('counts') && field.type === 'select') {
      const counts = new Map<string, number>();
      const options = (field.config as { options?: string[] }).options ?? [];
      // Initialize with 0 for every option, then increment based on entries.
      // This way options with zero entries still render — useful at a glance
      // (e.g. seeing that "offered: 0" is meaningful info for a job tracker).
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

function SumChip({ field, value }: { field: Field; value: number }) {
  const def = getFieldType(field.type);
  return (
    <div className="bg-grape-50 border border-grape-100 rounded-lg px-3 py-1.5">
      <p className="text-grape-400 text-[10px] font-semibold uppercase tracking-wide">
        {field.name} · Total
      </p>
      <div className="text-grape-900 text-[14px] font-semibold mt-0.5">
        <def.Display value={value as any} config={field.config as any} />
      </div>
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
