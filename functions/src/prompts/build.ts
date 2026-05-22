/**
 * Build the system prompt and few-shot messages for the LLM call.
 *
 * MVP implementation is intentionally simple English — this is the
 * fluid layer per SPEC §20.1 and §20.2. Real per-template tuning lands
 * in step 6 once we have real recordings to benchmark against.
 *
 * Cache-control: the system prompt and tool schema are stable across
 * calls for a given template, so we mark cache_control on them. Few-shot
 * caching can be added later if cache-hit metrics warrant it.
 */

import type { FewShotExample, FieldValue, Template, TemplateField } from "../types";

export function buildSystemPrompt(template: Template): string {
  if (template.system_prompt_override) return template.system_prompt_override;

  const fieldLines = template.fields
    .map((f) => `  - ${f.name} (${f.label}): ${describeField(f)}`)
    .join("\n");

  return `You are extracting structured fields from a dentist's voice dictation for the "${template.name}" template.

For each field, return:
  - picklist: the structured value (from the allowed options, or a number, or null if not mentioned)
  - qualifier: a free-text tail rendered on the same line as the picklist value (or null)
  - ai_confidence: "high" if explicitly stated, "inferred" if reasonably inferred from context, "missing" if not mentioned

Fields in this template:
${fieldLines}

Rules:
  - Do NOT invent clinical details, materials, dosages, readings, or findings not present in the transcript.
  - If a value can be expressed as a picklist option, prefer the picklist option over the qualifier.
  - Use the qualifier for specifics that don't fit the picklist (counts, locations, qualifiers like "generalized" or "more on lowers").
  - Some user-set field values may be provided in the user message — match your output to those values where they exist; do not contradict them.
  - Return field_values for ALL listed fields, even if missing.`;
}

/**
 * Build the chat messages that surround the user transcript.
 * Returns the few-shot examples as alternating user/assistant turns,
 * to be placed before the final user message with the real transcript.
 */
export function buildFewShotMessages(template: Template): Array<{
  role: "user" | "assistant";
  content: string;
}> {
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const example of template.few_shot_examples) {
    messages.push({
      role: "user",
      content: `Transcript:\n${example.transcript}`,
    });
    messages.push({
      role: "assistant",
      content: JSON.stringify({ field_values: example.expected_field_values }),
    });
  }
  return messages;
}

export function buildUserMessage(args: {
  transcript: string;
  userSetFieldValues: Record<string, FieldValue>;
}): string {
  const { transcript, userSetFieldValues } = args;
  const userSet = Object.entries(userSetFieldValues)
    .filter(([, v]) => v && (v.picklist !== null || v.qualifier !== null))
    .reduce<Record<string, { picklist: FieldValue["picklist"]; qualifier: string | null }>>(
      (acc, [name, v]) => {
        acc[name] = { picklist: v.picklist, qualifier: v.qualifier };
        return acc;
      },
      {},
    );

  const userSetSection =
    Object.keys(userSet).length > 0
      ? `\n\nUser-set fields (do not contradict these):\n${JSON.stringify(userSet, null, 2)}`
      : "";

  return `Transcript:\n${transcript}${userSetSection}`;
}

function describeField(f: TemplateField): string {
  if (f.picklist?.kind === "single" && f.picklist.options) {
    return `single-select from [${f.picklist.options.join(", ")}]`;
  }
  if (f.picklist?.kind === "multi" && f.picklist.options) {
    return `multi-select from [${f.picklist.options.join(", ")}]`;
  }
  if (f.picklist?.source === "providers") return `provider from practice list`;
  if (f.picklist?.source === "assistants") return `assistant from practice list`;
  if (f.numeric) return `number between ${f.numeric.min} and ${f.numeric.max}`;
  if (f.qualifier?.allowed) return `free-text qualifier`;
  return `(no constraints)`;
}

// Re-export the type for adapter consumers.
export type FewShotForLlm = ReturnType<typeof buildFewShotMessages>;
export type { FewShotExample };
