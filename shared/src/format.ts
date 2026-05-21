/**
 * Format-string renderer.
 *
 * Pure function: takes a Template + a map of FieldValues, returns the
 * assembled final-note text the dentist will copy to her PMS.
 *
 * MVP IMPLEMENTATION ("dumb renderer", per SPEC §20.3 step 2):
 * Iterates the template's fields in order. For each, emits one line of the
 * form `Label: picklist[, qualifier]`. Skips fields whose picklist and
 * qualifier are both empty. Does NOT use template.format_string yet — that
 * grammar is added in step 6, when real templates demand it.
 *
 * The interface is the stable contract (SPEC §20.2). Both the web preview
 * pane and the Cloud Function call this. When the implementation gets
 * smarter, callers don't change.
 */

import type { FieldValue, Template, TemplateField } from "./types";

export function render(template: Template, fieldValues: Record<string, FieldValue>): string {
  const lines: string[] = [];
  for (const field of template.fields) {
    const value = fieldValues[field.name];
    const line = renderField(field, value);
    if (line !== null) {
      lines.push(line);
    }
  }
  return lines.join("\n");
}

function renderField(field: TemplateField, value: FieldValue | undefined): string | null {
  const picklistText = value ? stringifyPicklist(value.picklist) : "";
  const qualifierText = value?.qualifier?.trim() ?? "";

  if (picklistText === "" && qualifierText === "") {
    // Required-field-missing rendering is deferred to step 6 — for MVP
    // we just omit empty fields rather than emitting "[MISSING: x]".
    return null;
  }

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
