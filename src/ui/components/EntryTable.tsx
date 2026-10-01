import { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { useDataMutations } from '@/core/data';
import { getFieldType, isFieldEmpty } from '@/core/fields';
import { tableRows } from '@/core/fields/table';
import { ImagePreview, safeImageUrl } from '@/core/fields/image';
import { resolveMax } from '@/core/fields/outOf';
import { sortEntries } from '@/core/sorting';
import { readTextStyle, textStyleClass } from '@/core/textStyle';
import InlineCounter from './InlineCounter';
import AuthorTag from './AuthorTag';
import { useToast } from './Toast';
import type { AuthorMap } from '@/core/authors';
import type { Entry, Field } from '@/core/types';

interface Props {
  entries: Entry[];
  fields: Field[];
  readOnly?: boolean;
  authors?: AuthorMap | null;
  onEntryClick: (entryId: string) => void;
}

type Sort = { fieldId: string; direction: 'asc' | 'desc' } | null;

/**
 * One row per entry, one column per field. Clicking a header cycles
 * ascending, descending, then back to the default newest-first order.
 */
export default function EntryTable({
  entries,
  fields,
  readOnly = false,
  authors = null,
  onEntryClick,
}: Props) {
  const { updateEntry, incrementEntryValue } = useDataMutations();
  const { notify } = useToast();
  const [sort, setSort] = useState<Sort>(null);

  const columns = useMemo(
    () => [...fields].sort((a, b) => a.order - b.order),
    [fields],
  );

  const rows = useMemo(() => {
    const field = sort && columns.find((f) => f.id === sort.fieldId);
    return field ? sortEntries(entries, field, sort.direction) : entries;
  }, [entries, columns, sort]);

  function cycleSort(fieldId: string) {
    setSort((s) => {
      if (!s || s.fieldId !== fieldId) return { fieldId, direction: 'asc' };
      if (s.direction === 'asc') return { fieldId, direction: 'desc' };
      return null;
    });
  }

  async function toggleCheckmark(entry: Entry, fieldId: string) {
    // Only the changed key, so a co-member's edit to another field survives.
    try {
      await updateEntry(entry.id, { [fieldId]: !entry.values[fieldId] });
    } catch {
      notify("Couldn't save that — check your connection.");
    }
  }

  async function stepCount(entry: Entry, field: Field, delta: number) {
    try {
      await incrementEntryValue(
        entry.id,
        field.id,
        delta,
        resolveMax(field.config as { max: number }),
      );
    } catch {
      notify("Couldn't save that — check your connection.");
    }
  }

  function renderCell(entry: Entry, field: Field) {
    const def = getFieldType(field.type);
    const value = entry.values[field.id];

    if (field.type === 'checkmark' && !readOnly) {
      return (
        <button
          type="button"
          aria-label={value ? 'Mark not done' : 'Mark done'}
          onClick={(e) => {
            e.stopPropagation();
            toggleCheckmark(entry, field.id);
          }}
          className="align-middle"
        >
          {value ? (
            <span className="w-4 h-4 rounded bg-grape-500 text-white flex items-center justify-center">
              <Check className="w-3 h-3" strokeWidth={3} />
            </span>
          ) : (
            <span className="block w-4 h-4 rounded border-2 border-grape-300 hover:border-grape-500 transition-colors" />
          )}
        </button>
      );
    }
    if (field.type === 'count' && !readOnly) {
      return (
        <InlineCounter
          value={value as number | null}
          config={field.config as { max: number }}
          onStep={(delta) => stepCount(entry, field, delta)}
        />
      );
    }
    if (isFieldEmpty(def, value, field.config)) {
      return <span className="text-grape-200">–</span>;
    }
    // A thumbnail, so one tall picture doesn't stretch its row.
    if (field.type === 'image') {
      const url = safeImageUrl(value);
      return url ? (
        <ImagePreview url={url} className="h-10 w-10 rounded-md" />
      ) : null;
    }
    // Both of these render multi-line in cards, which would make every row
    // as tall as its longest note.
    if (field.type === 'table') {
      const n = tableRows(value).length;
      return (
        <span className="text-grape-600">
          {n} {n === 1 ? 'row' : 'rows'}
        </span>
      );
    }
    if (field.type === 'longtext') {
      return (
        <span className={textStyleClass(readTextStyle(field.config))}>
          {String(value)}
        </span>
      );
    }
    return <def.Display value={value as any} config={field.config as any} />;
  }

  return (
    <div className="bg-white border border-grape-100 rounded-xl overflow-x-auto">
      <table className="w-full text-[13px] border-collapse">
        <thead>
          <tr className="border-b border-grape-100">
            {authors && (
              <th className="px-3 py-2 text-left text-grape-400 text-[11px] font-semibold uppercase tracking-wide">
                By
              </th>
            )}
            {columns.map((field) => {
              const active = sort?.fieldId === field.id ? sort.direction : null;
              return (
                <th
                  key={field.id}
                  aria-sort={
                    active === 'asc'
                      ? 'ascending'
                      : active === 'desc'
                        ? 'descending'
                        : 'none'
                  }
                  className="px-3 py-2 text-left whitespace-nowrap"
                >
                  <button
                    type="button"
                    onClick={() => cycleSort(field.id)}
                    className={`inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide hover:text-grape-700 ${
                      active ? 'text-grape-700' : 'text-grape-400'
                    }`}
                  >
                    {field.name}
                    {active === 'asc' && <ChevronUp className="w-3 h-3" />}
                    {active === 'desc' && <ChevronDown className="w-3 h-3" />}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((entry) => (
            <tr
              key={entry.id}
              tabIndex={0}
              onClick={() => onEntryClick(entry.id)}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onEntryClick(entry.id);
                }
              }}
              className="border-b border-grape-50 last:border-b-0 hover:bg-grape-50/50 cursor-pointer focus:outline-none focus:bg-grape-50"
            >
              {authors && (
                <td className="px-3 py-2 whitespace-nowrap">
                  <AuthorTag
                    authors={authors}
                    authorId={entry.authorId}
                    size="sm"
                  />
                </td>
              )}
              {columns.map((field) => (
                <td key={field.id} className="px-3 py-2 align-middle">
                  <div className="max-w-70 truncate whitespace-nowrap">
                    {renderCell(entry, field)}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
