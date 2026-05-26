/**
 * Format-string renderer.
 *
 * Pure function: takes a Template + a map of FieldValues, returns the
 * assembled final-note text the dentist will copy to her PMS.
 *
 * Two modes:
 *   1. If `template.format_string` is non-empty, interpolate `{field_name}`
 *      placeholders inline. Lines whose placeholders ALL resolve to empty
 *      are dropped (so Provider/Assistant lines vanish if not set).
 *   2. Fallback: dumb `Label: value` per field (legacy / toy templates).
 *
 * The interface is the stable contract (SPEC §20.2). Both the web preview
 * pane and the Cloud Function call this. Callers don't change when the
 * implementation evolves.
 */

import type { FieldValue, Template, TemplateField } from "./types";

export function render(template: Template, fieldValues: Record<string, FieldValue>): string {
  if (template.format_string && template.format_string.trim().length > 0) {
    return renderWithFormatString(template, fieldValues);
  }
  return renderFallback(template, fieldValues);
}

// --- Format-string renderer ---

function renderWithFormatString(
  template: Template,
  fieldValues: Record<string, FieldValue>,
): string {
  // Build a lookup: field_name → rendered text
  const rendered: Record<string, string> = {};
  for (const field of template.fields) {
    const v = fieldValues[field.name];
    rendered[field.name] = renderFieldValue(v);
  }

  // Track which fields are referenced in the format string.
  const referenced = new Set<string>();

  const lines = template.format_string.split("\n");
  const output: string[] = [];

  for (const line of lines) {
    // Find all {field_name} placeholders in this line.
    const placeholders = [...line.matchAll(/\{(\w+)\}/g)];

    if (placeholders.length === 0) {
      // Static line — always include.
      output.push(line);
      continue;
    }

    for (const m of placeholders) referenced.add(m[1]!);

    // Check if ALL placeholders on this line are empty.
    const allEmpty = placeholders.every((m) => (rendered[m[1]!] ?? "") === "");
    if (allEmpty) continue; // Drop the line entirely.

    // Interpolate.
    let result = line;
    for (const m of placeholders) {
      const fieldName = m[1]!;
      const value = rendered[fieldName] ?? "";
      result = result.replace(m[0], value);
    }
    output.push(result);
  }

  // Append any fields that have values but weren't in the format string.
  for (const field of template.fields) {
    if (referenced.has(field.name)) continue;
    const val = rendered[field.name];
    if (val) {
      output.push(`${field.label}: ${val}`);
    }
  }

  return output.join("\n");
}

function renderFieldValue(value: FieldValue | undefined): string {
  if (!value) return "";
  const picklistText = stringifyPicklist(value.picklist);
  const qualifierText = value.qualifier?.trim() ?? "";
  if (picklistText && qualifierText) return `${picklistText}, ${qualifierText}`;
  return picklistText || qualifierText;
}

// --- Fallback dumb renderer ---

function renderFallback(template: Template, fieldValues: Record<string, FieldValue>): string {
  const lines: string[] = [];
  for (const field of template.fields) {
    const value = fieldValues[field.name];
    const line = renderFieldLine(field, value);
    if (line !== null) lines.push(line);
  }
  return lines.join("\n");
}

function renderFieldLine(field: TemplateField, value: FieldValue | undefined): string | null {
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
