// src/ui/components/InlineSelect.tsx
//
// Inline-editable select for entry cards/rows/modal. Renders the current value
// as a compact chip; tapping opens a dropdown of the field's options and writes
// the choice immediately (optimistic). Dropdown is portaled to document.body so
// it escapes scroll/overflow containers.
//
// Option colors: an option's color is its manual override if set, else the
// tracker's accent color (passed in as `accentColor`). No auto-assignment.

import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';
import type { Field } from '@/core/types';
import { useDataMutations } from '@/core/data';
import { getOptionTheme } from '@/core/selectColors';

interface Props {
  entryId: string;
  entryValues: Record<string, unknown>;
  field: Field;
  accentColor: string; // tracker.color — fallback for un-overridden options
}

interface MenuPos {
  left: number;
  top: number;
  width: number;
  openUp: boolean;
}

export default function InlineSelect({
  entryId,
  entryValues,
  field,
  accentColor,
}: Props) {
  const { updateEntry } = useDataMutations();
  const [open, setOpen] = useState(false);
  const [optimistic, setOptimistic] = useState<string | null | undefined>(
    undefined,
  );
  const chipRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<MenuPos | null>(null);

  const options = (field.config as { options?: string[] }).options ?? [];

  const stored = entryValues[field.id];
  const current =
    optimistic !== undefined
      ? optimistic
      : typeof stored === 'string'
        ? stored
        : null;
  const theme = current
    ? getOptionTheme(field.config, current, accentColor)
    : null;

  useLayoutEffect(() => {
    if (!open || !chipRef.current) return;
    const rect = chipRef.current.getBoundingClientRect();
    const menuHeightEstimate = Math.min(240, (options.length + 1) * 34 + 8);
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < menuHeightEstimate && rect.top > spaceBelow;
    setPos({
      left: rect.left,
      top: openUp ? rect.top : rect.bottom,
      width: Math.max(rect.width, 144),
      openUp,
    });
  }, [open, options.length]);

  async function choose(value: string | null) {
    setOpen(false);
    if (value === current) return;
    setOptimistic(value);
    try {
      await updateEntry(entryId, { ...entryValues, [field.id]: value });
    } catch (err) {
      setOptimistic(undefined);
      console.error('inline select update failed', err);
    }
  }

  return (
    <>
      <button
        ref={chipRef}
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={`inline-flex items-center gap-1 text-[13px] font-medium rounded-full pl-2.5 pr-1.5 py-1 transition-colors ${
          theme
            ? `${theme.tileBg} ${theme.tileFg}`
            : 'bg-grape-100 text-grape-700 hover:bg-grape-200'
        }`}
      >
        {current ?? <span className="text-grape-400">Set…</span>}
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>

      {open &&
        pos &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[60]"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
              }}
              aria-hidden
            />
            <div
              className="fixed z-[61] max-h-60 overflow-y-auto bg-white border border-grape-200 rounded-xl shadow-lg py-1"
              style={{
                left: pos.left,
                width: pos.width,
                ...(pos.openUp
                  ? { bottom: window.innerHeight - pos.top + 4 }
                  : { top: pos.top + 4 }),
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  choose(null);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-grape-400 hover:bg-grape-50 text-left"
              >
                <span className="w-3.5" />
                None
              </button>
              {options.map((opt) => {
                const selected = opt === current;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      choose(opt);
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-left transition-colors ${
                      selected
                        ? 'text-grape-700 font-medium bg-grape-50'
                        : 'text-grape-700 hover:bg-grape-50'
                    }`}
                  >
                    {selected ? (
                      <Check className="w-3.5 h-3.5 text-grape-500" />
                    ) : (
                      <span className="w-3.5" />
                    )}
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        getOptionTheme(field.config, opt, accentColor).tileBg
                      }`}
                    />
                    {opt}
                  </button>
                );
              })}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
