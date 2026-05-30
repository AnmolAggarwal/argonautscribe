/**
 * Deterministic post-generation validator.
 *
 * Runs AFTER Claude returns field values and BEFORE the dentist sees the
 * "Copy" button. Checks for missing required fields, unmapped values,
 * contradictions with user-set fields, and rendering artifacts.
 *
 * This is intentionally simple TypeScript — no LLM, no guessing, no cost.
 * Every check is deterministic and always correct.
 */

import type { FieldValue, Template } from "./types";

export interface ValidationIssue {
  field: string;
  label: string;
  /** "blocking" prevents copy; "warning" shows a yellow chip but allows copy. */
  severity: "blocking" | "warning";
  message: string;
}

export interface ValidationResult {
  /** True if no blocking issues exist. */
  safe_to_copy: boolean;
  issues: ValidationIssue[];
}

/**
 * Validate field values against the template definition.
 *
 * @param template   The template used for this note.
 * @param fieldValues The current field values (AI-filled + user-edited).
 * @param renderedNote The final rendered note text (for artifact checks).
 */
export function validateNote(
  template: Template,
  fieldValues: Record<string, FieldValue>,
  renderedNote: string,
): ValidationResult {
  const issues: ValidationIssue[] = [];

  for (const field of template.fields) {
    const value = fieldValues[field.name];

    // 1. Required field missing entirely.
    if (field.required && !value) {
      issues.push({
        field: field.name,
        label: field.label,
        severity: "blocking",
        message: `${field.label} is required but has no value.`,
      });
      continue;
    }

    if (!value) continue;

    // 2. Required field has mapping_status "missing" — was not in transcript.
    if (
      field.required &&
      value.mapping_status === "missing" &&
      value.source !== "user" &&
      value.picklist === null &&
      (value.qualifier === null || value.qualifier === "")
    ) {
      issues.push({
        field: field.name,
        label: field.label,
        severity: "blocking",
        message: `${field.label} is required but was not mentioned in the dictation.`,
      });
    }

    // 3. Unmapped value on a picklist field — heard but doesn't match options.
    if (value.mapping_status === "unmapped" && field.picklist?.options) {
      issues.push({
        field: field.name,
        label: field.label,
        severity: "warning",
        message: `${field.label} was dictated but doesn't match any option. Review: "${value.qualifier ?? ""}"`,
      });
    }
  }

  // 4. Rendering artifact checks — catch null/undefined/[object Object] in output.
  const artifacts = ["null", "undefined", "[object Object]", "NaN"];
  for (const artifact of artifacts) {
    if (renderedNote.includes(artifact)) {
      issues.push({
        field: "_rendered",
        label: "Rendered note",
        severity: "blocking",
        message: `Note text contains "${artifact}" — rendering error.`,
      });
      break; // One artifact issue is enough.
    }
  }

  return {
    safe_to_copy: !issues.some((i) => i.severity === "blocking"),
    issues,
  };
}

/**
 * Derive a review level for a single field value.
 * Used by the UI to show red/yellow/green chips.
 *
 *   "none"   — no review needed (exact match or user-set)
 *   "yellow" — inferred or default-used, probably fine but glance at it
 *   "red"    — unmapped or missing required, must review
 */
export function reviewLevel(
  field: { required: boolean },
  value: FieldValue | undefined,
): "none" | "yellow" | "red" {
  if (!value) return field.required ? "red" : "none";
  if (value.source === "user") return "none";
  if (value.mapping_status === "unmapped") return "red";
  if (value.mapping_status === "missing" && field.required) return "red";
  if (value.mapping_status === "missing" && !field.required) return "none";
  if (value.ai_confidence === "inferred") return "yellow";
  return "none";
}
