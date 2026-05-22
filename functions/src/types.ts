/**
 * Local type definitions for Cloud Functions.
 *
 * Mirrors the runtime-relevant subset of @argonaut/shared/types.ts.
 * Duplicated rather than imported because functions builds to CommonJS
 * runtime JS and shared exports TypeScript source (which the web app
 * consumes natively via Vite). Keeping the duplication small and
 * commented; expand only when needed.
 *
 * Source of truth: shared/src/types.ts. Keep in sync.
 */

export type AiConfidence = "high" | "inferred" | "missing" | null;
export type FieldValueSource = "ai" | "user" | "ai+user";

export interface FieldValue {
  picklist: string | string[] | number | boolean | null;
  qualifier: string | null;
  ai_confidence: AiConfidence;
  source: FieldValueSource;
}

export interface PicklistSpec {
  kind: "single" | "multi" | null;
  options: string[] | null;
  source: "inline" | "providers" | "assistants" | null;
  default: string | string[] | number | boolean | null;
}

export interface QualifierSpec {
  allowed: boolean;
  placeholder: string | null;
}

export interface TemplateField {
  name: string;
  label: string;
  required: boolean;
  picklist: PicklistSpec | null;
  qualifier: QualifierSpec | null;
  numeric: { min: number; max: number } | null;
}

export interface FewShotExample {
  transcript: string;
  expected_field_values: Record<string, FieldValue>;
}

export interface Template {
  template_id: string;
  name: string;
  version: number;
  fields: TemplateField[];
  format_string: string;
  few_shot_examples: FewShotExample[];
  keywords: string[];
  system_prompt_override: string | null;
}
