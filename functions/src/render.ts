/**
 * Server-side format-string renderer.
 *
 * Duplicate of shared/src/format.ts — kept in sync by hand. See the
 * top of ./types.ts for why we duplicate small runtime utilities here
 * instead of importing from @argonaut/shared.
 *
 * Same dumb-iteration semantics: emits one `Label: picklist[, qualifier]`
 * line per non-empty field. The richer format-string grammar (SPEC §11.3)
 * arrives when real templates demand it.
 */

import type { FieldValue, Template, TemplateField } from "./types";

export function render(template: Template, fieldValues: Record<string, FieldValue>): string {
  const lines: string[] = [];
  for (const field of template.fields) {
    const v = fieldValues[field.name];
    const line = renderField(field, v);
    if (line !== null) lines.push(line);
  }
  return lines.join("\n");
}

function renderField(field: TemplateField, value: FieldValue | undefined): string | null {
  const picklistText = value ? stringifyPicklist(value.picklist) : "";
  const qualifierText = value?.qualifier?.trim() ?? "";

  if (picklistText === "" && qualifierText === "") return null;
  if (picklistText !== "" && qualifierText !== "") {
    return `${field.label}: ${picklistText}, ${qualifierText}`;
  }
  return `${field.label}: ${picklistText || qualifierText}`;
}

function stringifyPicklist(picklist: FieldValue["picklist"]): string {
  if (picklist === null) return "";
  if (Array.isArray(picklist)) return picklist.join(", ");
  if (typeof picklist === "boolean") return picklist ? "Yes" : "No";
  return String(picklist);
}
