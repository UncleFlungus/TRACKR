import type { FieldTypeId, TrackerSettings } from './types';

interface FieldTemplate {
  name: string;
  type: FieldTypeId;
  config?: Record<string, unknown>;
  defaultValue?: unknown;
}

interface TrackerTemplate {
  id: string;
  name: string;
  icon: string; // lucide icon name
  color: string;
  description: string;
  /** Optional tracker-wide settings, e.g. default view mode. */
  settings?: TrackerSettings;
  fields: FieldTemplate[];
}

// Templates are plain data — edit freely without a migration.
// Each one is meant to demonstrate a different combination of field types
// and view modes, so a new user can browse and find a working example
// of whatever they want to track.
export const templates: TrackerTemplate[] = [
  {
    id: 'todo',
    name: 'To-do list',
    icon: 'ListChecks',
    color: 'sky',
    description: 'Tasks for any day, on a calendar',
    settings: { viewMode: 'calendar' },
    fields: [
      { name: 'Task', type: 'text' },
      {
        name: 'Done',
        type: 'checkmark',
        config: { aggregations: ['doneCount'] },
      },
      {
        name: 'Notes',
        type: 'longtext',
        config: { placeholder: 'Optional details', rows: 2 },
      },
    ],
  },
  {
    id: 'wishlist',
    name: 'Wishlist',
    icon: 'ShoppingBag',
    color: 'grape',
    description: 'Stuff you want to buy, visually',
    settings: { viewMode: 'grid' },
    fields: [
      { name: 'Item', type: 'text' },
      {
        name: 'Type',
        type: 'select',
        config: {
          options: ['Clothes', 'Tech', 'Home', 'Other'],
          aggregations: ['counts'],
        },
      },
      { name: 'Link', type: 'link' },
      {
        name: 'Price',
        type: 'currency',
        config: { symbol: '$', decimals: 2, aggregations: ['sum'] },
      },
      { name: 'Photo', type: 'picture' },
    ],
  },
  {
    id: 'job-applications',
    name: 'Job applications',
    icon: 'Briefcase',
    color: 'sky',
    description: 'Track your job search by status',
    settings: { viewMode: 'calendar' },
    fields: [
      { name: 'Company', type: 'text' },
      { name: 'Position', type: 'text' },
      {
        name: 'Status',
        type: 'select',
        config: {
          options: ['Applied', 'Interviewing', 'Offered', 'Denied', 'Accepted'],
          aggregations: ['counts'],
        },
      },
      { name: 'Link', type: 'link' },
      {
        name: 'Notes',
        type: 'longtext',
        config: { placeholder: 'Recruiter notes, interview prep…', rows: 2 },
      },
    ],
  },
  {
    id: 'meals',
    name: 'Meals',
    icon: 'UtensilsCrossed',
    color: 'sky',
    description: 'What and when you ate',
    settings: { viewMode: 'calendar' },
    fields: [
      { name: 'Meal', type: 'text' },
      {
        // Time-only field (no date). The calendar uses createdAt for placement,
        // so this field just carries the time-of-day — breakfast vs dinner.
        name: 'Time',
        type: 'time',
        config: { display: 'time', format: '12h', autoNow: true },
      },
      {
        name: 'Calories',
        type: 'number',
        config: { suffix: 'kcal', decimals: 0 },
      },
      { name: 'Photo', type: 'picture' },
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
    description: 'When, how long, what it looked like',
    settings: { viewMode: 'calendar' },
    fields: [
      {
        name: 'Time',
        type: 'time',
        config: { display: 'time', format: '12h', autoNow: true },
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
    id: 'weight',
    name: 'Weight tracker',
    icon: 'Scale',
    color: 'grape',
    description: 'Daily weight log over time',
    settings: { viewMode: 'calendar' },
    fields: [
      {
        name: 'Weight',
        type: 'number',
        config: { suffix: 'lbs', decimals: 1 },
      },
      {
        name: 'Notes',
        type: 'longtext',
        config: { placeholder: 'Optional', rows: 2 },
      },
    ],
  },
];

export function getTemplate(id: string): TrackerTemplate | undefined {
  return templates.find((t) => t.id === id);
}

// Note: createFromTemplate moved to core/data.tsx (in useDataMutations).
// It composes mutations, so it needs to route through the auth-aware layer.
