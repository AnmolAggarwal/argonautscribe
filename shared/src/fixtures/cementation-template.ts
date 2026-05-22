/**
 * Cementation template — real clinical template from the pilot dentist.
 *
 * Maps the 8-prompt PMS cementation workflow into our template field
 * system. Provider and Assistant use inline picklists for MVP; will
 * switch to source: "providers" / "assistants" once staff list CRUD
 * lands.
 */

import type { Template } from "../types";

export const CEMENTATION_TEMPLATE_ID = "cementation";

const SENTINEL_TS = { seconds: 0, nanoseconds: 0 };

export const CEMENTATION_TEMPLATE: Template = {
  template_id: CEMENTATION_TEMPLATE_ID,
  name: "Cementation",
  version: 1,
  fields: [
    {
      name: "tooth",
      label: "Tooth",
      required: true,
      picklist: null,
      qualifier: { allowed: true, placeholder: "e.g. #14 DO, #19 MOD" },
      numeric: { min: 1, max: 32 },
    },
    {
      name: "restoration_type",
      label: "Type of Restoration",
      required: true,
      picklist: {
        kind: "single",
        source: "inline",
        options: [
          "Zirconia crown",
          "Temp crown",
          "Fillings",
          "Sedative fillings (interim)",
          "PFM",
          "Bridge",
          "Implant crown",
          "Veneer",
          "Crown Repair",
        ],
        default: null,
      },
      qualifier: { allowed: true, placeholder: "shade, material details" },
      numeric: null,
    },
    {
      name: "adjustment",
      label: "Adjustment",
      required: false,
      picklist: {
        kind: "single",
        source: "inline",
        options: [
          "Adjusted and polished as needed",
          "No adjustment needed",
        ],
        default: null,
      },
      qualifier: { allowed: true, placeholder: "details" },
      numeric: null,
    },
    {
      name: "cement_type",
      label: "Cement Type",
      required: true,
      picklist: {
        kind: "single",
        source: "inline",
        options: [
          "Temp Cement (Telio)",
          "Panavia",
          "TempBond",
          "RelyX",
        ],
        default: null,
      },
      qualifier: { allowed: true, placeholder: "details" },
      numeric: null,
    },
    {
      name: "patient_warning",
      label: "Patient Warning",
      required: false,
      picklist: {
        kind: "multi",
        source: "inline",
        options: [
          "no warning needed",
          "decay was deep and extensive",
          "may need root canal treatment",
          "may need adjustments",
          "may need crown",
          "may need new crown",
          "may need to be extracted",
          "may need a night guard",
          "may have post op sensitivity for more than 2 weeks",
        ],
        default: null,
      },
      qualifier: { allowed: true, placeholder: "additional warnings" },
      numeric: null,
    },
    {
      name: "next_visit",
      label: "Next Visit",
      required: false,
      picklist: {
        kind: "single",
        source: "inline",
        options: [
          "3 months Prophy",
          "4 months Prophy",
          "6 months Prophy",
          "3 months PerMaint",
          "4 months PerMaint",
          "SRP",
          "Restorative",
          "Cementation",
          "Referred to Specialist",
          "Consultation",
          "Delivery Invisalign Aligners",
          "Invisalign Refinement",
          "Delivery NG",
          "3 months re-evaluation",
          "4 months re-evaluation",
          "6 months re-evaluation",
        ],
        default: null,
      },
      qualifier: { allowed: true, placeholder: "details" },
      numeric: null,
    },
    {
      name: "provider",
      label: "Provider",
      required: true,
      picklist: {
        kind: "single",
        source: "inline",
        options: [
          "Dr. Parul Aggarwal, DDS",
          "Dr. Sahana Prasad, DDS",
          "TN36859 RDH",
        ],
        default: null,
      },
      qualifier: null,
      numeric: null,
    },
    {
      name: "assistant",
      label: "Assistant",
      required: false,
      picklist: {
        kind: "single",
        source: "inline",
        options: [
          "Kristie",
          "Veronica",
          "Hamida",
          "Esmeralda",
        ],
        default: null,
      },
      qualifier: { allowed: true, placeholder: "temp name if not listed" },
      numeric: null,
    },
  ],
  format_string: "",
  few_shot_examples: [],
  keywords: [
    "cementation:2",
    "zirconia:2",
    "PFM:2",
    "Panavia:2",
    "RelyX:2",
    "TempBond:2",
    "Telio:2",
    "veneer:1.5",
    "implant:1.5",
    "crown:1.5",
    "bridge:1.5",
    "prophy:1.5",
    "SRP:1.5",
    "night guard:1.5",
    "root canal:1.5",
    "sensitivity:1",
  ],
  system_prompt_override: null,
  created_at: SENTINEL_TS,
  updated_at: SENTINEL_TS,
};
