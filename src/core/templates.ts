import type { FieldTypeId } from './types';

interface FieldTemplate {
  name: string;
  type: FieldTypeId;
  config?: Record<string, unknown>;
  defaultValue?: unknown;
}

interface TrackerTemplate {
  id: string; // template id, not tracker id
  name: string;
  icon: string; // lucide icon name
  color: string;
  description: string;
  fields: FieldTemplate[];
}

// Stored as plain data — edit freely without a migration.
export const templates: TrackerTemplate[] = [
  {
    id: 'food',
    name: 'Food tracker',
    icon: 'Apple',
    color: 'sky',
    description: 'What you ate, when, with photos',
    fields: [
      {
        name: 'When',
        type: 'time',
        config: { includeDate: true, format: '12h', autoNow: true },
      },
      { name: 'Items', type: 'list', config: { layout: 'pills' } },
      { name: 'Photos', type: 'picture' },
      {
        name: 'Notes',
        type: 'longtext',
        config: { placeholder: 'How was it?', rows: 2 },
      },
    ],
  },
  {
    id: 'poop',
    name: 'Poop tracker',
    icon: 'Donut',
    color: 'grape',
    description: 'Time, duration, and a quick description',
    fields: [
      {
        name: 'Time',
        type: 'time',
        config: { includeDate: true, format: '12h', autoNow: true },
      },
      { name: 'Duration', type: 'duration' },
      {
        name: 'Description',
        type: 'longtext',
        config: { placeholder: 'Brown, solid…', rows: 2 },
      },
    ],
  },
  {
    id: 'wishlist',
    name: 'Wishlist',
    icon: 'ShoppingBag',
    color: 'grape',
    description: 'Stuff you want to buy someday',
    fields: [
      { name: 'Item', type: 'text' },
      {
        name: 'Type',
        type: 'select',
        config: { options: ['Clothes', 'Tech', 'Home', 'Other'] },
      },
      { name: 'Link', type: 'link' },
      { name: 'Price', type: 'currency', config: { symbol: '$', decimals: 2 } },
    ],
  },
  {
    id: 'meals',
    name: 'Meals',
    icon: 'UtensilsCrossed',
    color: 'sky',
    description: 'What you ate and when',
    fields: [
      {
        name: 'Time',
        type: 'time',
        config: { includeDate: true, format: '12h', autoNow: true },
      },
      { name: 'Meal', type: 'text' },
      {
        name: 'Calories',
        type: 'number',
        config: { suffix: 'kcal', decimals: 0 },
      },
    ],
  },
  {
    id: 'grocery',
    name: 'Grocery',
    icon: 'ShoppingCart',
    color: 'grape',
    description: 'Shopping list with prices',
    fields: [
      { name: 'Item', type: 'text' },
      { name: 'Quantity', type: 'number', config: { decimals: 0 } },
      { name: 'Price', type: 'currency', config: { symbol: '$', decimals: 2 } },
    ],
  },
  {
    id: 'daily-log',
    name: 'Daily log',
    icon: 'NotebookPen',
    color: 'sky',
    description: 'A free-form daily entry',
    fields: [
      { name: 'What happened', type: 'text' },
      {
        name: 'Mood (1–5)',
        type: 'number',
        config: { decimals: 0, min: 1, max: 5 },
      },
    ],
  },
];

export function getTemplate(id: string): TrackerTemplate | undefined {
  return templates.find((t) => t.id === id);
}

// Note: createFromTemplate moved to core/data.tsx (in useDataMutations).
// It composes mutations, so it needs to route through the auth-aware layer.
