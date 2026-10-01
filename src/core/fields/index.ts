import type { FieldTypeDef, FieldTypeId } from '../types';
import { textField } from './text';
import { longtextField } from './longtext';
import { numberField } from './number';
import { currencyField } from './currency';
import { timeField } from './time';
import { durationField } from './duration';
import { listField } from './list';
import { selectField } from './select';
import { linkField } from './link';
import { imageField } from './image';
import { checkmarkField } from './checkmark';
import { scoreField } from './score';
import { countField } from './count';
import { tableField } from './table';

export const fieldRegistry: Record<FieldTypeId, FieldTypeDef<any, any>> = {
  text: textField,
  longtext: longtextField,
  number: numberField,
  currency: currencyField,
  time: timeField,
  duration: durationField,
  list: listField,
  select: selectField,
  link: linkField,
  image: imageField,
  checkmark: checkmarkField,
  score: scoreField,
  count: countField,
  table: tableField,
};
export const allFieldTypes = Object.values(fieldRegistry);

export function getFieldType(id: FieldTypeId): FieldTypeDef<any, any> {
  const def = fieldRegistry[id];
  if (!def) throw new Error(`Unknown field type: ${id}`);
  return def;
}

/**
 * Whether to hide a field from compact entry rows. null, undefined, '', [] and
 * false count as empty; everything else, 0 included, does not. Field types can
 * override with `isEmpty` when they need their own definition, as select does
 * for values no longer in the options list.
 */
export function isFieldEmpty(
  def: FieldTypeDef<any, any>,
  value: unknown,
  config: Record<string, unknown>,
): boolean {
  if (def.isEmpty) return def.isEmpty(value, config);
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && value === '') return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (typeof value === 'boolean' && value === false) return true;
  return false;
}
