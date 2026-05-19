import type { FieldTypeDef, FieldTypeId } from "../types";
import { textField } from "./text";
import { longtextField } from "./longtext";
import { numberField } from "./number";
import { currencyField } from "./currency";
import { timeField } from "./time";
import { durationField } from "./duration";
import { listField } from "./list";
import { pictureField } from "./picture";
import { selectField } from "./select";
// To add a new field type:
// 1. Create a new file in this folder (e.g. ./url.tsx) that exports a FieldTypeDef
// 2. Import it here
// 3. Add it to the registry below and to the FieldTypeId union in types.ts
export const fieldRegistry: Record<FieldTypeId, FieldTypeDef<any, any>> = {
  text: textField,
  longtext: longtextField,
  number: numberField,
  currency: currencyField,
  time: timeField,
  duration: durationField,
  list: listField,
  picture: pictureField,
  select: selectField,
};

export const allFieldTypes = Object.values(fieldRegistry);

export function getFieldType(id: FieldTypeId): FieldTypeDef<any, any> {
  const def = fieldRegistry[id];
  if (!def) throw new Error(`Unknown field type: ${id}`);
  return def;
}
