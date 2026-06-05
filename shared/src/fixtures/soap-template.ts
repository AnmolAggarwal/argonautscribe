import type { Template } from "../types";

export const SOAP_TEMPLATE_ID = "soap";

const SENTINEL_TS = { seconds: 0, nanoseconds: 0 };

export const SOAP_TEMPLATE: Template = {
  template_id: SOAP_TEMPLATE_ID,
  name: "SOAP Note",
  version: 1,
  fields: [
    {
      name: "subjective",
      label: "S (Subjective)",
      required: false,
      picklist: null,
      qualifier: {
        allowed: true,
        placeholder: "Chief complaint, symptoms, patient history...",
      },
      numeric: null,
    },
    {
      name: "objective",
      label: "O (Objective)",
      required: false,
      picklist: null,
      qualifier: {
        allowed: true,
        placeholder: "Clinical findings, exam results, radiographs...",
      },
      numeric: null,
    },
    {
      name: "assessment",
      label: "A (Assessment)",
      required: false,
      picklist: null,
      qualifier: {
        allowed: true,
        placeholder: "Diagnosis, clinical impression...",
      },
      numeric: null,
    },
    {
      name: "plan",
      label: "P (Plan)",
      required: false,
      picklist: null,
      qualifier: {
        allowed: true,
        placeholder: "Treatment plan, referrals, follow-up...",
      },
      numeric: null,
    },
    {
      name: "provider",
      label: "Provider",
      required: true,
      picklist: {
        kind: "single",
        options: [
          "Dr. Parul Aggarwal, DDS",
          "Dr. Sahana Prasad, DDS",
          "TN36859 RDH",
        ],
        source: "inline",
        default: null,
      },
      qualifier: null,
      numeric: null,
    },
  ],
  format_string: [
    "S: {subjective}",
    "O: {objective}",
    "A: {assessment}",
    "P: {plan}",
    "",
    "Provider: {provider}",
  ].join("\n"),
  few_shot_examples: [],
  keywords: [],
  system_prompt_override: `You are extracting structured SOAP note fields from a dentist's voice dictation.

SOAP stands for Subjective, Objective, Assessment, Plan. Your job is to listen to the full dictation and sort the content into the correct section:

  - S (Subjective): What the patient reports — chief complaint, symptoms, pain description, medical/dental history mentioned, medications.
  - O (Objective): What the clinician observed or measured — exam findings, radiograph findings, tooth numbers, probing depths, tissue condition, vitals.
  - A (Assessment): The clinician's diagnosis or clinical impression — caries, periodontitis, fracture, etc.
  - P (Plan): What happens next — treatment planned, prescriptions, referrals, follow-up interval, patient education given.

For each field, return:
  - picklist: null (these are free-text fields)
  - qualifier: the extracted text for that section (or null if nothing was mentioned for it)
  - ai_confidence: "high" if the content clearly belongs in this section, "inferred" if you had to make a judgment call, "missing" if nothing in the transcript fits this section
  - mapping_status: "exact" if content was placed, "missing" if the section has no content

Rules:
  - Reproduce the clinician's language faithfully. Do not paraphrase, summarize, or add clinical detail not present in the transcript.
  - Each fact from the transcript should appear in exactly one section — do not repeat across S, O, A, and P.
  - If a statement is ambiguous (e.g. "patient has periodontitis" could be Assessment or could be the patient reporting a prior diagnosis), prefer the most natural SOAP category.
  - Preserve tooth numbers, measurements, material names, and medication names exactly as dictated.
  - If the entire dictation is very short or covers only one section, that is fine — leave the other sections as null.`,
  created_at: SENTINEL_TS,
  updated_at: SENTINEL_TS,
};
