/**
 * Shared TypeScript types for ArgonautScribe.
 *
 * Mirror of the Firestore data model in SPEC §9. This file is the source of
 * truth for document shapes; both apps/web and functions/ should import from
 * here rather than defining their own variants.
 *
 * PRIVACY: The PatientTag interface (and only that interface) describes a
 * document containing PHI. Read CLAUDE.md §2 before writing any code that
 * touches it.
 */

// ---------- Identifiers ----------

export type ClinicianId = string;
export type PracticeId = string;
export type NoteId = string; // v4 UUID, generated client-side
export type SegmentId = string; // v4 UUID
export type TemplateId = string;
export type ProviderId = string;
export type AssistantId = string;

// ---------- Notes ----------

/**
 * The full lifecycle status of a note. See SPEC §9.4 for the state machine.
 *  - new          : Created via "+ New Note", no audio yet.
 *  - recording    : An audio segment is uploading.
 *  - transcribing : STT in flight on the latest segment.
 *  - drafting     : LLM filling fields from the combined transcript.
 *  - ready        : AI fill complete, awaiting dentist review.
 *  - edited       : Dentist has made edits since the last AI fill.
 *  - filed        : Terminal (note doc is then hard-deleted, audit row written).
 *  - error        : Pipeline error; see error_message on the note.
 */
/**
 * Note lifecycle status. The active set under the on-demand "Generate"
 * model (SPEC §20.3 step 4) is:
 *   new        — just created, possibly with recorded audio, no AI fill yet
 *   generating — generateNote Cloud Function is running (STT + LLM)
 *   ready      — AI fill complete, awaiting dentist review
 *   filed      — terminal; the note doc is hard-deleted after this status flips
 *   error      — pipeline failure; see note.error_message
 *
 * The other variants (recording, transcribing, drafting, edited) are
 * retained for forward/back compatibility but are not written by the
 * current pipeline.
 */
export type NoteStatus =
  | "new"
  | "recording"
  | "transcribing"
  | "drafting"
  | "generating"
  | "ready"
  | "edited"
  | "filed"
  | "error";

export interface Note {
  note_id: NoteId;
  template_id: TemplateId;
  template_version: number;

  /** Day-level only, e.g. "2026-05-19". Precise timestamps live in patient_tags only. */
  date_iso: string;

  status: NoteStatus;

  /** Combined transcript across all audio segments. Empty string when no audio yet. */
  transcript: string;

  /** Field values keyed by field name in the template. */
  field_values: Record<string, FieldValue>;

  /** Live render of field_values through the template's format string. */
  final_note_text: string;

  error_message: string | null;

  /** Processing timestamp, NOT appointment time. */
  created_at: FirestoreTimestamp;
  updated_at: FirestoreTimestamp;
}

export type AiConfidence = "high" | "inferred" | "missing" | null;

/** Provenance of the current field value. "user" never gets overwritten by AI. */
export type FieldValueSource = "ai" | "user" | "ai+user";

/**
 * How well the extracted value maps to the template's picklist options.
 *   - "exact"    : Value matches a picklist option verbatim.
 *   - "unmapped" : Value was clearly heard in the transcript but doesn't match any picklist option.
 *                  Placed in qualifier for doctor review (e.g. "Dr. Patel" when picklist has "Dr. Parul Aggarwal, DDS").
 *   - "missing"  : Field was not mentioned in the transcript at all.
 */
export type MappingStatus = "exact" | "unmapped" | "missing";

export interface FieldValue {
  /** Picklist part. Type depends on the field's PicklistSpec.kind. */
  picklist: string | string[] | number | boolean | null;
  /** Free-text qualifier rendered on the same line as the picklist value. */
  qualifier: string | null;
  ai_confidence: AiConfidence;
  source: FieldValueSource;
  /**
   * How the extracted value maps to the template's allowed picklist options.
   * Set by Claude during extraction; overridden to "exact" when the user
   * manually selects a picklist value.
   */
  mapping_status: MappingStatus;
}

// ---------- Audio segments ----------

export type SegmentStatus = "uploading" | "transcribing" | "done" | "error";

/**
 * A single audio segment within a note. Multiple segments exist when the
 * dentist augments. Audio blobs in Cloud Storage are deleted after STT;
 * this doc records segment metadata and the per-segment transcript chunk.
 */
export interface AudioSegment {
  segment_id: SegmentId;
  /** 1, 2, 3... in order of recording. */
  sequence: number;
  /** Cloud Storage path. Cleared after audio deletion. */
  storage_path: string | null;
  /** STT output for this segment. */
  transcript_chunk: string;
  duration_ms: number;
  status: SegmentStatus;
  error_message: string | null;
  created_at: FirestoreTimestamp;
}

// ---------- Patient tags (PHI — handle with care) ----------

/**
 * THIS DOCUMENT CONTAINS PHI.
 *
 * The patient tag is the only piece of PHI in the system. It is never logged,
 * never sent to STT, never sent to the LLM, never read by Cloud Functions.
 * Security rules deny `list` permission; tags are fetched one at a time by
 * the authenticated client.
 *
 * See CLAUDE.md §2 for the full set of invariants.
 */
export interface PatientTag {
  note_id: NoteId;
  /** "Sarah J — #14 — 9:15" — free-text label, dentist's choice. */
  tag: string;
  /** Optional. Never replicated to any other document. */
  precise_time: FirestoreTimestamp | null;
  created_at: FirestoreTimestamp;
}

// ---------- Templates ----------

export interface Template {
  template_id: TemplateId;
  /** Display name, e.g. "Cementation", "Periodic Exam / Adult Prophy". */
  name: string;
  version: number;
  fields: TemplateField[];
  /** Format string with field substitutions. See SPEC §11.3 for the grammar. */
  format_string: string;
  /** 2-3 (transcript, expected_field_values) pairs for LLM few-shot context. */
  few_shot_examples: FewShotExample[];
  /** Deepgram boost list, e.g. ["WNL:1.5", "USS:1.5", "BWs:1.5"]. */
  keywords: string[];
  /** Per-template override of the default system prompt. */
  system_prompt_override: string | null;
  created_at: FirestoreTimestamp;
  updated_at: FirestoreTimestamp;
}

export interface TemplateField {
  /** Programmatic name, e.g. "calculus". */
  name: string;
  /** Display label, e.g. "Calculus". */
  label: string;
  required: boolean;
  /** null = pure free-text field (qualifier only). */
  picklist: PicklistSpec | null;
  /** null = pure picklist field (no free-text tail). */
  qualifier: QualifierSpec | null;
  /** Set when the field is numeric (e.g. tooth_number). */
  numeric: { min: number; max: number } | null;
}

export interface PicklistSpec {
  /** null = source-referenced; kind comes from the source's natural shape. */
  kind: "single" | "multi" | null;
  /** For inline picklists. */
  options: string[] | null;
  /**
   * - "inline"     : Use options[] directly.
   * - "providers"  : Pull from /practices/{pid}/providers.
   * - "assistants" : Pull from /practices/{pid}/assistants.
   */
  source: "inline" | "providers" | "assistants" | null;
  default: PicklistDefault;
}

export type PicklistDefault = string | string[] | number | boolean | null;

export interface QualifierSpec {
  allowed: boolean;
  /** Hint shown in the qualifier text input. */
  placeholder: string | null;
}

export interface FewShotExample {
  transcript: string;
  expected_field_values: Record<string, FieldValue>;
}

// ---------- Clinicians ----------

export type ClinicianRole = "clinician" | "admin";

export interface Clinician {
  email: string;
  display_name: string;
  role: ClinicianRole;
  practice_id: PracticeId;
  default_template_id: TemplateId | null;
  created_at: FirestoreTimestamp;
}

// ---------- Practice ----------

export interface Practice {
  practice_id: PracticeId;
  /** Display name, e.g. "Argonaut Dental". */
  name: string;
  created_at: FirestoreTimestamp;
}

// ---------- Staff lists (practice-scoped) ----------

export interface Provider {
  /** "Dr. Parul Aggarwal, DDS" — rendered into the note exactly as written. */
  display_name: string;
  /** "DDS", "RDH", license number, etc. */
  credential: string | null;
  active: boolean;
  created_at: FirestoreTimestamp;
}

export interface Assistant {
  /** "Veronica" */
  display_name: string;
  active: boolean;
  created_at: FirestoreTimestamp;
}

// ---------- Audit ----------

export type AuditEventType =
  | "note_created"
  | "note_filed"
  | "template_edited"
  | "signin";

/**
 * Content-free audit row. No PHI, no field values, no transcript. Retained
 * for AUDIT_RETENTION_DAYS days; see SPEC §12.5.
 */
export interface AuditEvent {
  event_type: AuditEventType;
  clinician_id: ClinicianId;
  note_id: NoteId | null;
  template_id: TemplateId | null;
  date_iso: string;
  created_at: FirestoreTimestamp;
}

// ---------- Firestore timestamp ----------

/**
 * Framework-neutral timestamp shape. Both the Admin SDK and the JS SDK
 * produce objects with this structure. Re-declared here so this package
 * does not depend on either SDK.
 */
export interface FirestoreTimestamp {
  seconds: number;
  nanoseconds: number;
}
