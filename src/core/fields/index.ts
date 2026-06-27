import type { FieldTypeDef, FieldTypeId } from '../types';
import { textField } from './text';
import { longtextField } from './longtext';
import { numberField } from './number';
import { currencyField } from './currency';
import { timeField } from './time';
import { durationField } from './duration';
import { listField } from './list';
// import { pictureField } from './picture';
import { selectField } from './select';
import { linkField } from './link';
import { checkmarkField } from './checkmark';

export const fieldRegistry: Record<FieldTypeId, FieldTypeDef<any, any>> = {
  text: textField,
  longtext: longtextField,
  number: numberField,
  currency: currencyField,
  time: timeField,
  duration: durationField,
  list: listField,
  // picture: pictureField,
  select: selectField,
  link: linkField,
  checkmark: checkmarkField,
};
export const allFieldTypes = Object.values(fieldRegistry);

export function getFieldType(id: FieldTypeId): FieldTypeDef<any, any> {
  const def = fieldRegistry[id];
  if (!def) throw new Error(`Unknown field type: ${id}`);
  return def;
}

/**
 * Generic emptiness check used to decide whether to hide a field from
 * compact entry rows. Field types can override via the optional `isEmpty`
 * method if they have a special definition (e.g. select treats values
 * no longer in the options list as empty).
 *
 * Default rules:
 * - null / undefined → empty
 * - '' → empty
 * - [] → empty
 * - false (for checkmark) → empty
 * - everything else (including 0) → not empty
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
