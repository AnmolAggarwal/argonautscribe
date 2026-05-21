/**
 * Toy template for step-2 development.
 *
 * Three fields exercise the three shapes a real template will use:
 *   - tooth        : numeric + qualifier  (no picklist, ranged number)
 *   - restoration  : single-select picklist + qualifier
 *   - notes        : qualifier only       (pure free-text)
 *
 * This is NOT a real clinical template. It's the wire-test template per
 * SPEC §20.3 step 5: the toy template proves the pipes work end-to-end.
 * Real templates from the pilot dentist replace this in step 6.
 *
 * Do NOT show the output of this template to the dentist — it's a stub,
 * not her workflow.
 */

import type { Template } from "../types";

export const TOY_PRACTICE_ID = "argonaut-practice";
export const TOY_TEMPLATE_ID = "toy";

// Use a sentinel timestamp; the seed script overwrites with serverTimestamp().
const SENTINEL_TS = { seconds: 0, nanoseconds: 0 };

export const TOY_TEMPLATE: Template = {
  template_id: TOY_TEMPLATE_ID,
  name: "Toy Template (dev only)",
  version: 1,
  fields: [
    {
      name: "tooth",
      label: "Tooth",
      required: true,
      picklist: null,
      qualifier: { allowed: true, placeholder: "e.g. distal, lingual" },
      numeric: { min: 1, max: 32 },
    },
    {
      name: "restoration",
      label: "Restoration",
      required: true,
      picklist: {
        kind: "single",
        source: "inline",
        options: ["Composite", "Amalgam", "Crown", "Filling", "Other"],
        default: null,
      },
      qualifier: { allowed: true, placeholder: "shade, surface, etc." },
      numeric: null,
    },
    {
      name: "notes",
      label: "Notes",
      required: false,
      picklist: null,
      qualifier: { allowed: true, placeholder: "what happened, observations, plan" },
      numeric: null,
    },
  ],
  format_string: "",
  few_shot_examples: [],
  keywords: [],
  system_prompt_override: null,
  created_at: SENTINEL_TS,
  updated_at: SENTINEL_TS,
};
