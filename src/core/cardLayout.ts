// Card layouts for the grid and list views: a few columns, each a stack of
// fields. No React in here.
//
// A layout stores field ids, so renaming a field doesn't break it. A field the
// layout doesn't mention isn't drawn on cards, but still shows when the entry
// is opened. Ids for deleted fields are skipped at render time rather than
// cleaned up, so nothing has to keep the two in sync.

import type { Field } from './types';

export type ColumnWidth = 'narrow' | 'auto' | 'wide';

export interface CardColumn {
  width: ColumnWidth;
  fields: string[];
}

export interface CardLayout {
  columns: CardColumn[];
  showLabels: boolean;
}

export const MAX_COLUMNS = 3;

const byOrder = (fields: Field[]) =>
  [...fields].sort((a, b) => a.order - b.order);

/** The layout with ids for missing fields dropped, and columns left empty by that removed. */
export function resolveLayout(
  layout: CardLayout,
  fields: Field[],
): { columns: { width: ColumnWidth; fields: Field[] }[]; showLabels: boolean } {
  const byId = new Map(fields.map((f) => [f.id, f]));
  return {
    showLabels: layout.showLabels,
    columns: layout.columns
      .map((c) => ({
        width: c.width,
        fields: c.fields
          .map((id) => byId.get(id))
          .filter((f): f is Field => !!f),
      }))
      .filter((c) => c.fields.length > 0),
  };
}

/** Fields that exist but aren't placed anywhere in the layout. */
export function unplacedFields(layout: CardLayout, fields: Field[]): Field[] {
  const placed = new Set(layout.columns.flatMap((c) => c.fields));
  return byOrder(fields).filter((f) => !placed.has(f.id));
}

export function defaultLayout(fields: Field[]): CardLayout {
  return {
    columns: [{ width: 'auto', fields: byOrder(fields).map((f) => f.id) }],
    showLabels: true,
  };
}

/** The first image field, which the poster presets build around. */
export function posterField(fields: Field[]): Field | undefined {
  return byOrder(fields).find((f) => f.type === 'image');
}

export function posterLeftLayout(fields: Field[]): CardLayout | null {
  const poster = posterField(fields);
  if (!poster) return null;
  return {
    columns: [
      { width: 'narrow', fields: [poster.id] },
      {
        width: 'auto',
        fields: byOrder(fields)
          .filter((f) => f.id !== poster.id)
          .map((f) => f.id),
      },
    ],
    showLabels: false,
  };
}

export function posterTopLayout(fields: Field[]): CardLayout | null {
  const poster = posterField(fields);
  if (!poster) return null;
  return {
    columns: [
      {
        width: 'auto',
        fields: [
          poster.id,
          ...byOrder(fields)
            .filter((f) => f.id !== poster.id)
            .map((f) => f.id),
        ],
      },
    ],
    showLabels: false,
  };
}
