/**
 * General (freeform) template — no picklists, no structured fields.
 *
 * The dentist dictates freely and Claude produces a cohesive clinical
 * paragraph. Uses a single `note_content` qualifier field as the catch-all.
 * A `system_prompt_override` tells Claude to write prose instead of
 * extracting structured fields.
 */

import type { Template } from "../types";

export const GENERAL_TEMPLATE_ID = "general";

const SENTINEL_TS = { seconds: 0, nanoseconds: 0 };

export const GENERAL_TEMPLATE: Template = {
  template_id: GENERAL_TEMPLATE_ID,
  name: "General",
  version: 1,
  fields: [
    {
      name: "note_content",
      label: "Note",
      required: true,
      picklist: null,
      qualifier: {
        allowed: true,
        placeholder: "Dictate freely — Claude will organize into a clinical note",
      },
      numeric: null,
    },
  ],
  format_string: "{note_content}",
  system_prompt_override:
    "You are a dental clinical scribe. The dentist will dictate a freeform " +
    "encounter narrative. Your job is to clean up the dictation into a clear, " +
    "concise clinical note paragraph suitable for pasting into a PMS chart. " +
    "Fix grammar, remove filler words, and organize the content logically, " +
    "but do NOT invent clinical details that were not dictated. " +
    "Return the result in the note_content field.",
  few_shot_examples: [],
  deepgram_keywords: [],
  practice_id: "",
  created_at: SENTINEL_TS,
  updated_at: SENTINEL_TS,
};
