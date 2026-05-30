/**
 * Merge AI-returned field values into the existing field_values map on
 * a note. The "source: user" provenance is load-bearing: if the dentist
 * has explicitly set a value, the AI's value for that field is dropped
 * silently. Otherwise the AI value is written with provenance "ai" (or
 * "ai+user" if there was a previous AI value the user did not touch).
 *
 * See SPEC §6.3 + §10.3 step 12 for the canonical rules.
 */

import type { AiConfidence, FieldValue, MappingStatus } from "./types";

/** What the LLM returns per field (no `source` — we set that here). */
export interface AiFieldValue {
  picklist: FieldValue["picklist"];
  qualifier: string | null;
  ai_confidence: AiConfidence;
  mapping_status: MappingStatus;
}

export function mergeFieldValues(
  existing: Record<string, FieldValue>,
  fromAi: Record<string, AiFieldValue>,
): Record<string, FieldValue> {
  const result: Record<string, FieldValue> = { ...existing };

  for (const [name, aiValue] of Object.entries(fromAi)) {
    const prior = existing[name];

    if (prior && prior.source === "user") {
      // User explicitly set this — never overwrite, UNLESS the user
      // cleared the field entirely (picklist null + qualifier empty).
      // A cleared user field means "let AI fill this again".
      const cleared =
        (prior.picklist === null || prior.picklist === "") &&
        (!prior.qualifier || prior.qualifier.trim() === "");
      if (!cleared) continue;
    }

    result[name] = {
      picklist: aiValue.picklist,
      qualifier: aiValue.qualifier,
      ai_confidence: aiValue.ai_confidence,
      source: prior ? "ai+user" : "ai",
      mapping_status: aiValue.mapping_status ?? "missing",
    };
  }

  return result;
}
