/**
 * Build a JSON-schema-shaped tool input from a Template.
 *
 * The tool the LLM calls is `fill_note`, which takes a single argument
 * `field_values` — an object keyed by field name, each value an object
 * `{ picklist, qualifier, ai_confidence }`. The picklist subtype depends
 * on the field's PicklistSpec.kind (single → string|null with enum;
 * multi → array of string with enum; numeric-only field → number|null
 * with min/max).
 *
 * Inline picklists encode their options in the enum. Source-referenced
 * picklists ("providers", "assistants") are deferred — when those land
 * the schema generator will accept the resolved staff list as input.
 */

import type { Template, TemplateField } from "../types";

interface JsonSchemaObject {
  type: string | string[];
  description?: string;
  properties?: Record<string, JsonSchemaObject>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchemaObject;
  enum?: (string | null)[];
  minimum?: number;
  maximum?: number;
}

export function buildToolSchema(template: Template): JsonSchemaObject {
  const fieldProperties: Record<string, JsonSchemaObject> = {};
  const required: string[] = [];

  for (const field of template.fields) {
    fieldProperties[field.name] = buildFieldValueSchema(field);
    required.push(field.name);
  }

  return {
    type: "object",
    properties: {
      field_values: {
        type: "object",
        properties: fieldProperties,
        required,
        additionalProperties: false,
      },
    },
    required: ["field_values"],
    additionalProperties: false,
  };
}

function buildFieldValueSchema(field: TemplateField): JsonSchemaObject {
  return {
    type: "object",
    description: `Value for the "${field.label}" field.`,
    properties: {
      picklist: buildPicklistSchema(field),
      qualifier: {
        type: ["string", "null"],
        description: field.qualifier?.allowed
          ? `Free-text qualifier on the same line as the picklist value. Null if no qualifier.`
          : `Must be null — this field does not allow a free-text qualifier.`,
      },
      ai_confidence: {
        type: "string",
        enum: ["high", "inferred", "missing"],
        description:
          'high = explicitly stated in transcript; inferred = reasonably inferred from context; missing = not mentioned.',
      },
    },
    required: ["picklist", "qualifier", "ai_confidence"],
    additionalProperties: false,
  };
}

function buildPicklistSchema(field: TemplateField): JsonSchemaObject {
  const { picklist, numeric } = field;

  if (!picklist && numeric) {
    return {
      type: ["number", "null"],
      minimum: numeric.min,
      maximum: numeric.max,
      description: `Numeric ${field.label} between ${numeric.min} and ${numeric.max}. Null if not mentioned.`,
    };
  }

  if (!picklist) {
    // Pure free-text field — picklist must always be null.
    return {
      type: "null",
      description: `Must be null — this field has no picklist.`,
    };
  }

  if (picklist.source === "providers" || picklist.source === "assistants") {
    // Sourced staff lists not yet wired into the prompt. Allow any
    // string for now; resolution will be tightened later.
    return {
      type: ["string", "null"],
      description: `Sourced from practice ${picklist.source} list (resolution deferred).`,
    };
  }

  if (picklist.kind === "single" && picklist.options) {
    return {
      type: ["string", "null"],
      enum: [...picklist.options, null],
      description: `Single-select from the allowed options, or null if not mentioned.`,
    };
  }

  if (picklist.kind === "multi" && picklist.options) {
    return {
      type: ["array", "null"],
      items: { type: "string", enum: picklist.options },
      description: `Multi-select from the allowed options. Empty array or null if none mentioned.`,
    };
  }

  // Fallback: permissive string.
  return { type: ["string", "null"] };
}
