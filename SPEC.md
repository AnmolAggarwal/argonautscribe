# Dental Scribe — Product & Technical Specification

**Status:** Pre-MVP design specification
**Version:** 0.1 (initial handover document)
**Last updated:** 2026-05-19
**Project name:** "Dental Scribe" is a working title. Final naming TBD.

---

## 1. Executive Summary

Dental Scribe is an AI-powered clinical documentation tool designed for small dental practices. It produces the **full clinical note** the dentist would otherwise type into her Practice Management System (PMS, e.g. Dentrix Ascend) — assembled from a combination of in-app picklist selections and voice dictation. The dentist creates a new note in the web app, optionally taps through structured fields for her template (cement type, restoration, provider, etc.) and/or dictates the per-encounter specifics, reviews the assembled note, and copies the result as one block into the PMS's free-text note field, bypassing the PMS's own picklist wizard.

The output is structured throughout — every line is `Label: value(s)`, matching the format the dentist writes by hand today. Each field combines a picklist selection with an optional free-text qualifier on the same line (e.g. `Calculus: Heavy, more all lowers, Heavy AL`). There is no separate narrative paragraph; the assembled list of labeled fields *is* the note.

**MVP is web-only.** The dentist records, reviews, edits, and copies all from her workstation, using the browser microphone. A mobile PWA with the same capabilities (capture and review on the phone, with cross-device handoff via Firestore as the source of truth) is the immediate v1.1 priority once MVP is in pilot.

The system is deliberately architected to keep Protected Health Information (PHI) out of the AI pipeline. The dentist dictates clinical content only ("cementation tooth 14 zirconia adjusted, prep was deep, mild post-op sensitivity"); patient identity is captured separately as a short text tag stored in an isolated subcollection that is never sent to the speech-to-text or language model providers. This dramatically simplifies the HIPAA posture, reduces ongoing compliance burden, and unlocks the use of best-in-class general-purpose AI providers without requiring Business Associate Agreements at MVP stage.

The target operating cost is approximately **$15-30 per dentist per month** at typical clinical volume (15 patients per day, 3-5 minute recordings averaging across procedures). The MVP is achievable in roughly **100-150 hours of focused engineering work** by a single competent developer.

---

## 2. Problem & Motivation

### 2.1 The clinical documentation burden

Dentists spend a meaningful portion of every working day documenting clinical notes. After each patient encounter — composites, hygiene visits, crown preparations, exams, extractions — the clinician must enter a structured note into the PMS describing what was done, what was observed, what materials were used, and what the plan is. For a dentist seeing 15-20 patients per day, this is approximately **45-90 minutes of daily administrative work**, often done in fragments between patients and frequently spilling into evenings and weekends.

The notes themselves are highly templated. A composite restoration note follows roughly the same structure every time: tooth number, surface(s), anesthesia, isolation method, bonding agent, material, shade, cure time, occlusal adjustment, patient tolerance, plan. The variability is in the values, not the structure. This makes the problem well-suited to AI-assisted templated extraction.

### 2.2 Why existing solutions don't fit small practices

Enterprise scribe products and human medical scribes exist but are priced for medical (not dental) practices and large groups, typically $1,500-3,000 per provider per month. Generic dictation tools like Dragon Medical require expensive licensing, run only on Windows, and produce unstructured text rather than templated notes. Several emerging AI scribe products target dentistry but are positioned at $200-500/month with feature sets oriented around full-encounter recording and complex EHR integration — overkill for a solo or two-dentist practice that just wants templated notes done faster.

### 2.3 What we're building

A lightweight, two-part tool optimized for the small-practice solo dentist:
- **Mobile PWA for capture:** open the app, tap the mic, talk for 1-5 minutes, tap stop. The recording is queued for processing.
- **Web app for compose:** between patients, open the pending notes list, review the AI-filled structured note, edit anything that's wrong, copy to clipboard, paste into the PMS.

No EHR integration. No real-time human review. No replacement for the dentist's clinical judgment. Just: cut the documentation time substantially while keeping the dentist firmly in the driver's seat for what gets recorded.

---

## 3. Users & Personas

### 3.1 Primary user — the clinician

The primary user is a practicing dentist or dental hygienist. Representative persona:

**Dr. Patel.** Solo-practice general dentist, 12 years in practice. Sees 15 patients per day. Uses Dentrix Ascend (cloud-based PMS) on a workstation in each operatory plus an iPad at the front desk. Documents most procedures herself rather than dictating to staff. Comfortable with iPhone and basic web apps; not technical beyond that. Strongly motivated by anything that reduces her end-of-day documentation backlog. Skeptical of AI tools that "make things up." Values speed, accuracy, and tools that work without ceremony.

Hygienists are a secondary user with mostly the same workflow but a narrower set of templates (recall exams, perio charting, periodontal maintenance, scaling).

### 3.2 Secondary user — the practice administrator / lead clinician

In small practices, the lead dentist or office manager configures templates, manages user access, and reviews any flagged content (PHI safety reports, daily summaries). Representative persona:

**Maria.** Office manager at Dr. Patel's practice. Comfortable with web apps and admin dashboards. Will be the one who adds and removes user accounts, edits template field lists when clinical preferences change, and reviews monthly usage reports.

In MVP, Dr. Patel will likely fill both roles herself.

### 3.3 Explicit non-users

- **Patients.** Never interact with the system. There is no patient-facing component, no portal, no consent flow on the patient side. (Practices may need to update their general practice consent to mention AI-assisted documentation, but that's a practice-level paperwork matter outside this product's scope.)
- **PMS vendors.** No integration. The product is intentionally PMS-agnostic.

---

## 4. Product Overview

### 4.1 One web app for MVP; mobile PWA in v1.1

**MVP is a single web app**, running in the dentist's workstation browser, that handles the full lifecycle: create a note, record audio (browser microphone), edit picklist selections and free-text qualifiers, review the assembled note, copy to clipboard, mark filed. There is no separate mobile capture surface in MVP.

**Mobile PWA is the immediate v1.1 priority.** Once the web flow is in pilot, we add a mobile PWA with the same capabilities (capture *and* review) and cross-device handoff: a note started on the phone can be finished on the workstation and vice versa. Firestore is the source of truth from the moment a note is created, so the mobile client is additive — no schema migration required, no device-pinned state.

The original spec split into a "capture surface" and "compose surface" with asymmetric capabilities (phone records, web reviews). That split was rejected in favor of symmetric surfaces, because in practice the dentist may need to start a recording at her workstation between patients or pick up a phone-started note at her desk — work flows in both directions.

### 4.2 End-to-end user flow

The canonical flow, from a cementation appointment on tooth 14:

1. **Pre-encounter setup (one-time).** Dr. Patel has configured ~10 templates covering the procedures she does regularly (cementation, periodic exam / prophy, composite restoration, crown prep, extraction, etc.). Each template defines: a list of fields (tooth, restoration type, cement type, provider, assistant, next visit, patient warnings, etc.), each with a picklist of options and/or a free-text qualifier slot; a format string that renders the fields into the dentist's exact note style; a dental keyword list for STT boosting; and 2-3 few-shot examples for the LLM. This setup happens once during onboarding and is updated occasionally.

2. **During the encounter.** Dr. Patel completes the cementation. The patient is still in the chair or just stepping out.

3. **New Note.** Between patients, Dr. Patel opens the web app at her workstation, clicks **+ New Note**, picks a template ("Cementation"), and optionally types a short tag ("Sarah J — #14") for her own reference. The empty note now exists in her list with status `new`.

4. **Capture and/or fill.** She has two input channels, used together within one note:
   - **Picklist.** Tap through the structured fields in the template (tooth: 14; restoration: zirconia crown; adjustment: adjusted and polished; cement: RelyX; provider: Dr. Parul Aggarwal; assistant: Veronica; next visit: 6 months prophy).
   - **Voice.** Tap the mic button and dictate the specifics: *"prep was deep with previous IRM, mesial open contact addressed with flowable, mild post-op sensitivity advised may resolve in 2-3 weeks, discussed nightguard."* Tap stop. She can re-record (discard and start over) or augment (add more audio that appends to the transcript).

5. **Background processing.** The audio blob uploads to Cloud Storage. A Cloud Function triggers, sends the audio to Deepgram Nova-3 Medical for transcription with the template's dental keyword list, receives the transcript, then sends transcript + template schema + few-shot examples + the dentist's existing picklist selections (if any) to Claude Sonnet 4.6 via the Anthropic API. Claude returns structured JSON: picklist values for any fields the dentist hasn't already set, plus free-text qualifiers for fields that warrant them. The result merges into the note's field values. Total processing time: typically 5-15 seconds.

6. **Review.** The web app shows the assembled note in real-time: each field as a row with its picklist selection (editable dropdown) and free-text qualifier (editable text). Below, a live preview of the final note text as it will appear when pasted. Fields where the AI's confidence is low (or where it inferred from context rather than explicit statement) are flagged visually. Dr. Patel skims, corrects anything wrong (changes restoration shade, adjusts a qualifier), and clicks **Copy Note**.

7. **Paste into PMS.** She switches to her Dentrix Ascend browser tab (already open to the patient's chart), clicks in the Clinical Notes field, presses Ctrl+V. The fully-formatted note appears as one block. She saves the chart entry as she normally would.

8. **Mark filed.** She clicks **Mark Filed** in the web app. The note, audio segments (if any remain), transcript, patient tag, and field values are deleted from the backend. A content-free record is written to the audit log for usage analytics.

### 4.3 Key product properties

A few non-negotiable properties the design preserves:

The dentist always reviews and approves notes before they enter the PMS. The system never writes directly into the chart. This keeps clinical responsibility unambiguously human and avoids the regulatory complexity of being a "device" that produces clinical records autonomously.

PHI is kept out of the AI pipeline. The dentist dictates clinical content only. Patient identifiers live in a separately-classified tag field that never reaches the STT or LLM providers. This is enforced by the data model and backend code, not by user discipline alone (although user discipline is the first line of defense).

The system is PMS-agnostic. It produces final note text and places it on the clipboard. Whatever the dentist does with that text — paste into Dentrix, paste into Open Dental, paste into a Google Doc — is outside the product's concern.

The output matches the dentist's existing note style exactly. The format string is per-template and produces the literal `Label: value(s)` lines she would have typed herself, including her clinical shorthand (WNL, BWs, PAs, USS, OHI, etc.). We are not introducing a new note format; we are accelerating the one she already uses.

---

## 5. User Stories

The MVP user stories, written from the clinician's point of view:

- *As a dentist, I want to capture a quick voice note immediately after finishing a procedure, so that I don't have to remember the details until end of day.*
- *As a dentist, I want to tag each recording with a short patient identifier, so that I can match notes to charts when I review them later.*
- *As a dentist, I want to optionally select the procedure template at capture time, so that the AI fills in the right structure without me having to pick later.*
- *As a dentist, I want the AI to fill in the structured fields of my note from the transcript, with clear indicators of what was high-confidence vs. inferred vs. missing, so that I can quickly trust or correct each field.*
- *As a dentist, I want to review and edit the AI-filled note before it goes anywhere, so that I retain full clinical responsibility.*
- *As a dentist, I want to copy the final note to my clipboard with one click, so that I can paste it into any PMS without integration headaches.*
- *As a dentist, I want my recording to work even if I'm in an operatory with bad wifi, so that I never lose a note because of network issues.*
- *As an admin, I want to manage the templates the AI uses, so that I can adjust them as my clinical preferences evolve.*

Stories deferred from MVP are listed in §17.

---

## 6. Functional Requirements

### 6.1 Web app (MVP — single surface)

The web app must support the full note lifecycle on the dentist's workstation.

**Authentication.** Firebase Authentication, email + password to start. MFA (TOTP via Firebase Auth) required before onboarding any external customer.

**New Note creation.** A `+ New Note` action creates an empty note: the dentist picks a template from her list (~10 templates expected), optionally types a short patient tag for her own reference, and the note enters her list with status `new`. The tag is stored in the isolated `patient_tags` subcollection (PHI; never transmitted to STT/LLM).

**Recording.** Browser microphone via the MediaRecorder API. Audio encoded as WebM/Opus on Chrome/Edge or MP4/AAC on Safari, at 16 kHz mono. Browser-native echo cancellation, noise suppression, and automatic gain control enabled. The dentist can:
- **Record** a fresh audio segment on a new note.
- **Augment** an existing note with another audio segment — the new transcript is appended to the existing transcript, and the LLM re-fills the template fields from the combined transcript.
- **Re-record (clean)** an existing note — discards the current audio segments and transcript, keeps the note shell and any picklist selections already entered.

**Picklist editing.** Every template field with a defined option set renders as a dropdown/multi-select control. The dentist can fill picklist values before, during, or after recording. Picklist selections combine with voice-derived data into the same field-value structure.

**Free-text qualifier editing.** Each field can also carry a free-text qualifier ("Heavy" + "more all lowers, Heavy AL"). The qualifier is editable inline as a text input next to (or below) the picklist selection.

**Live preview of the assembled note.** As field values change (picklist picks, qualifier text, AI updates), the rendered final note text updates live. This is what the dentist will copy.

**Drafts list.** Organized by date, shows template name, patient tag (joined from `patient_tags`), status, and age. Status states are visible: `new`, `recording`, `transcribing`, `drafting`, `ready`, `edited`, `filed`. Notes are sorted by recency by default; filterable by template and status.

**Review.** Opening a note shows all template fields with their current values, the assembled note preview, and (collapsible) the transcript and a list of audio segment timestamps. Fields where the AI inferred (rather than explicitly extracted) are flagged with a visual marker so the dentist's eye is drawn to anything not high-confidence.

**Copy Note.** A button that places the assembled final note text on the system clipboard. After a successful copy, the dentist can paste into the PMS's free-text note field.

**Mark Filed.** Triggers deletion of the note, its audio segments (if any remain), its transcript, its patient tag, and its field values. Writes a content-free audit record to `/audit/{practice_id}/{event_id}` for usage analytics.

**Template management (admin role only).** A minimal form-based editor for creating and editing templates: field definitions with option sets, format string, dental keyword list for STT, few-shot examples. Visual editor is deferred to v2.

### 6.2 Mobile PWA (v1.1 — same capabilities as web, plus chairside ergonomics)

Deferred from MVP; documented here so the data model anticipates it.

The mobile PWA, when added, must support the same lifecycle as the web app (create / record / fill picklist / edit qualifiers / review / copy / mark filed). It additionally optimizes for chairside capture: large mic button suitable for gloved hands, one-tap template selection, offline recording queue (IndexedDB) for operatories with bad wifi, status indicators for in-flight uploads.

Cross-device handoff is core: a note started on the phone appears immediately in the web app via Firestore listeners, and vice versa. Firestore is the source of truth from the moment of `+ New Note`; no device-pinned state.

### 6.3 Backend pipeline

The backend must:

Accept authenticated audio uploads from any authorized client (web app in MVP; mobile PWA in v1.1), store them temporarily in Cloud Storage at a UUID-keyed path.

Trigger a Cloud Function on each new upload that orchestrates the processing pipeline: speech-to-text via Deepgram Nova-3 Medical, structured field-fill via Claude Sonnet 4.6, merge of the LLM result into the note's field-value map in Firestore.

Append the new transcript to the note's existing transcript (for augment flows). The note carries a single combined transcript that is the source of truth; individual audio segments are deleted after successful transcription.

Delete audio blobs immediately after successful transcription, with a 24-hour Cloud Storage lifecycle rule as a safety net.

Apply per-template prompt engineering: each template has its own system prompt, tool-use JSON schema, dental keyword list (for STT boosting), and 2-3 few-shot examples. The backend selects the correct prompt based on the template chosen at note creation.

Pass any picklist values the dentist has already set as context to the LLM, so the model fills the remaining fields without overwriting her explicit choices. The LLM's output for fields the dentist has already filled is treated as a suggestion (visible in review) but does not silently overwrite.

Enforce strict JSON output from the LLM using Anthropic's tool-use feature. Schema mismatches result in a single retry with a corrective prompt; if still failing, the note enters `error` status with the error message visible to the dentist for retry.

Log all LLM calls and STT calls (without PHI) for cost monitoring, accuracy benchmarking, and debugging.

Surface processing errors to the dentist via note status (`error` plus a human-readable error message), with retry affordance.

### 6.4 Templates

Templates are first-class entities. The template system must support:

**Field types.** Each field has both a *structured part* (single-select picklist, multi-select picklist, number, boolean, date, derived, or none) and an optional *free-text qualifier slot* (a string that the dentist or the LLM can populate to add specifics on the same line as the picklist value). A field with no picklist part is pure free-text; a field with no qualifier slot is pure picklist. Most fields in real templates have both.

**Validation.** Required vs. optional per field, allowed value sets for picklist parts, allowed value ranges for numbers.

**Format strings.** Each template includes a format string with `{field_name}` placeholders that produces the final note text by substitution. Substitution combines the picklist part and the qualifier into a single line (e.g. picklist `Heavy` + qualifier `more all lowers, Heavy AL` renders as `Heavy, more all lowers, Heavy AL`). Format strings support conditional fragments (show a line only if a field is set) and filters (uppercase, lowercase, join arrays). The format must produce the dentist's exact note style — same labels, same clinical shorthand, same line breaks.

**Few-shot examples.** Each template carries 2-3 example pairs: `(transcript, expected_field_values)`. Used in the LLM prompt to improve accuracy on the template's vocabulary.

**Dental keyword list.** Per-template list of terms to boost during STT (e.g. `["Filtek:2", "Scotchbond:2", "MOD:2", "USS:1.5", "OHI:1.5", "WNL:1.5", ...]`).

**Versioning.** Edits to a template create a new version. Notes retain a reference to the template version used to fill them, for audit and reproducibility. The current version is what's used for new notes.

**Practice-scoped staff lists.** Provider and assistant fields draw their options from practice-level settings (`/practices/{pid}/providers`, `/practices/{pid}/assistants`), not from the template itself. This keeps staff lists in one place when they change; templates reference them by name.

---

## 7. Non-Functional Requirements

### 7.1 Privacy and PHI posture

The architectural intent is that the audio, transcript, and AI-generated draft contents are **not PHI**, because the dentist dictates clinical content only and patient identifiers are routed through a separate tag field. This is the principal privacy property of the system.

The patient tag is PHI. It is stored in a separately-classified store with stricter access controls. It is never sent to STT or LLM providers. It is deleted along with the draft on the "Mark Filed" action.

A PHI scanner (Microsoft Presidio or LLM-based) is planned for v2 as a safety net for accidental name mentions in dictation. In MVP, the safeguard is user discipline supported by clear capture UI design that separates the tag field from the mic button.

Audio is deleted from the backend immediately after successful transcription (within seconds, typically). A 24-hour Cloud Storage lifecycle rule deletes any audio that wasn't cleaned up explicitly.

### 7.2 Performance and latency

**Capture-to-ready latency target:** under 30 seconds from "tap stop" to "draft ready" in the web app, for a 90-second recording, on a typical broadband connection. Deepgram returns transcripts in 2-5 seconds; Claude returns drafts in 3-8 seconds; the rest is network and cold-start overhead.

**Web app responsiveness target:** draft list and review panel open in under 1 second on a typical workstation. Firestore listeners provide near-instant updates when drafts transition to "ready."

**Offline capture target:** recording works fully offline; uploads retry when connectivity returns. Up to 24 hours of queued recordings should sync without data loss.

### 7.3 Reliability

The capture path is the highest-reliability requirement. Losing a recording costs the dentist real work to reconstruct. Local IndexedDB storage of recordings persists across browser restarts. Upload retries use exponential backoff. Failed uploads are visible to the clinician for manual retry.

The processing pipeline tolerates STT or LLM provider outages by retrying with backoff and surfacing failures as draft errors rather than silently dropping them.

### 7.4 Cost

Target operating cost per clinician per month, at 15 patients/day and 5-10 minute recordings: **under $40/month all-in**. Detailed breakdown in §13.

### 7.5 Accessibility

Web compose surface should meet WCAG 2.1 AA basics: keyboard navigation throughout the review panel (the highest-frequency screen), screen-reader-compatible field labels, sufficient color contrast, and non-color-only confidence indicators (icons accompany the color coding).

Mobile capture surface should have a touch target size of at least 44pt for the mic button and template chips, and large enough text labels to be readable with gloved hands at arm's length.

---

## 8. Architecture

### 8.1 High-level system

```
┌──────────────────────┐                  ┌──────────────────────┐
│  Mobile PWA          │                  │  Web App             │
│  (Capture surface)   │                  │  (Compose surface)   │
│                      │                  │                      │
│  - Record audio      │                  │  - List drafts       │
│  - Tag (local)       │◄─── tag sync ───►│  - Review/edit       │
│  - Queue offline     │                  │  - Copy to clipboard │
│  - Upload audio      │                  │  - Mark filed        │
└──────────┬───────────┘                  └──────────▲───────────┘
           │                                         │
           │ audio                                   │ snapshot listener
           ▼                                         │
┌──────────────────────────────────────────────────────────────────┐
│                    Firebase Backend                              │
│                                                                  │
│  ┌────────────────┐   ┌──────────────┐   ┌──────────────────┐    │
│  │ Cloud Storage  │   │  Firestore   │   │ Firebase Auth    │    │
│  │ (audio blobs)  │   │  (drafts,    │   │ (clinicians)     │    │
│  │ 24h lifecycle  │   │  templates,  │   │                  │    │
│  └────────┬───────┘   │  tags PHI)   │   └──────────────────┘    │
│           │           └──────▲───────┘                           │
│           │ trigger          │                                   │
│           ▼                  │ write                             │
│  ┌─────────────────────────────────────┐                         │
│  │ Cloud Function: processRecording    │                         │
│  │  1. Read audio                      │                         │
│  │  2. Call Deepgram → transcript      │──► Deepgram API         │
│  │  3. Call Claude → draft JSON        │──► Anthropic API        │
│  │  4. Write draft, delete audio       │                         │
│  └─────────────────────────────────────┘                         │
└──────────────────────────────────────────────────────────────────┘
```

### 8.2 Data flow

The data flow for a single recording, from capture to filed:

1. Mobile app generates a v4 UUID (`recording_id`). Creates a local entry: `{ uuid, tag, template_id, precise_time, status: "recording" }`.

2. User dictates. On stop, audio blob is written to IndexedDB queue with the same UUID.

3. Upload worker reads queue, uploads audio to `gs://bucket/recordings/{uuid}.webm` with metadata `{ clinician_id, template_id, date_iso }`. On success, deletes from local queue.

4. Cloud Storage upload triggers `processRecording` Cloud Function. Function reads audio, calls Deepgram with the template's keyword list, receives transcript.

5. Function writes `transcript` to Firestore at `recordings/{uuid}` with status `"transcribed"`. Audio blob is deleted from Cloud Storage.

6. Function then calls Claude Sonnet 4 with the appropriate per-template prompt, schema, and few-shot examples. Receives filled JSON.

7. Function writes draft to Firestore at `drafts/{uuid}` with status `"ready"` and fields populated.

8. Web app, subscribed to the drafts collection for this clinician, receives the new draft via Firestore listener. UI updates.

9. Clinician reviews, edits (each edit writes to `drafts/{uuid}` with timestamped revision), copies to clipboard.

10. Clinician clicks "Mark Filed." A function deletes `recordings/{uuid}`, `drafts/{uuid}`, and the local tag entry. Optionally writes a minimal audit record to `filed_log/{uuid}` (no content, just metadata: clinician_id, date, template_id) for usage analytics.

### 8.3 Why Firebase

The tech stack decision (detailed in §15) lands on Firebase because: realtime sync via Firestore listeners is precisely what the capture-on-phone / review-on-web pattern needs; offline-first behavior is built into the Firestore SDK; Firebase Auth handles authentication out of the box; Cloud Functions provide a clean trigger-on-upload pattern for the processing pipeline; the entire stack runs free on the Spark tier for a single practice, and pay-as-you-go scales linearly to many practices with negligible fixed cost.

---

## 9. Data Model

### 9.1 Firestore collections

All clinician-scoped documents live under `/clinicians/{clinician_id}/...`. Practice-scoped documents (templates, staff lists) live under `/practices/{practice_id}/...`. Security rules enforce that a clinician can only read/write her own documents and the templates / staff lists for her practice.

**`/clinicians/{clinician_id}`**
The clinician's profile and settings.
```
{
  email: string,
  display_name: string,
  role: "clinician" | "admin",
  practice_id: string,
  default_template_id: string | null,
  created_at: timestamp,
  // No PHI in this document.
}
```

**`/clinicians/{clinician_id}/notes/{note_id}`**
The unified note document. Replaces the earlier split of `recordings/` + `drafts/`. One doc covers the full lifecycle from `+ New Note` to `filed`.
```
{
  note_id: string (uuid v4),               // Random v4. Never derived from PHI.
  template_id: string,
  template_version: number,
  date_iso: string,                        // Day-level only, e.g. "2026-05-19".
                                           // Precise timestamps live in patient_tags only.
  status: "new"                            // Created via "+ New Note", no audio yet.
        | "recording"                      // An audio segment is uploading.
        | "transcribing"                   // STT in flight on the latest segment.
        | "drafting"                       // LLM filling fields from the transcript.
        | "ready"                          // AI fill complete, awaiting dentist review.
        | "edited"                         // Dentist has made edits since the last AI fill.
        | "filed"                          // Terminal (note doc is then hard-deleted).
        | "error",                         // Pipeline error; see error_message.

  // Transcript accumulates across augment recordings.
  transcript: string,                      // Empty string when no audio yet. Appended on each segment.

  // Field values. Keyed by field name in the template.
  // Each value combines an optional picklist part and an optional free-text qualifier.
  field_values: {
    [field_name]: {
      picklist: string | string[] | number | boolean | null,
      qualifier: string | null,            // Free-text tail rendered on the same line.
      ai_confidence: "high" | "inferred" | "missing" | null,
      source: "ai" | "user" | "ai+user"    // Provenance. "user" never gets overwritten by AI.
    }
  },

  // Live preview, rendered by applying the template's format string to field_values.
  // Stored so the web app can show it without re-rendering client-side, and so audit
  // can capture what was on the clipboard at file time.
  final_note_text: string,

  error_message: string | null,
  created_at: timestamp,                   // Processing timestamp, NOT appointment time.
  updated_at: timestamp,
  // No PHI in this document. No patient name, no appointment time.
}
```

**`/clinicians/{clinician_id}/notes/{note_id}/segments/{segment_id}`**
An audio segment within a note. Multiple segments exist when the dentist augments. Each segment is short-lived: the audio blob is in Cloud Storage and is deleted after STT; this doc records segment metadata and the per-segment transcript chunk for traceability.
```
{
  segment_id: string (uuid v4),
  sequence: number,                        // 1, 2, 3... in order of recording.
  storage_path: string | null,             // Cleared after audio deletion.
  transcript_chunk: string,                // STT output for this segment.
  duration_ms: number,
  status: "uploading" | "transcribing" | "done" | "error",
  error_message: string | null,
  created_at: timestamp,
}
```

**`/clinicians/{clinician_id}/patient_tags/{note_id}`**
The PHI tag, isolated in its own subcollection with stricter security rules (no list permission). Stored encrypted-at-rest by Firestore. Deleted on Mark Filed.
```
{
  note_id: string,
  tag: string,                             // "Sarah J — #14 — 9:15"
  precise_time: timestamp | null,          // Optional. Never replicated elsewhere.
  created_at: timestamp,
  // THIS DOCUMENT CONTAINS PHI. Treat with special care.
  // Never logged. Never sent to LLM. Never sent to STT. Never read by Cloud Functions.
}
```

**`/practices/{practice_id}/templates/{template_id}`**
A template definition. Practice-scoped, shared across all clinicians in the practice.
```
{
  template_id: string,
  name: string,                            // "Cementation", "Periodic Exam / Adult Prophy"
  version: number,
  fields: [
    {
      name: string,                        // e.g. "calculus"
      label: string,                       // e.g. "Calculus" (rendered in note)
      required: boolean,
      picklist: {
        kind: "single" | "multi" | null,   // null = no picklist part on this field
        options: string[] | null,          // For single/multi picklists.
        source: "inline" | "providers" | "assistants" | null,
                                           // "providers"/"assistants" pull options from
                                           // /practices/{pid}/{providers,assistants}.
        default: any | null
      } | null,
      qualifier: {
        allowed: boolean,                  // If true, this field carries a free-text tail.
        placeholder: string | null         // Hint shown in the qualifier text input.
      } | null,
      numeric: { min: number, max: number } | null,
                                           // Set when the field is a number (e.g. tooth_number).
    }
  ],
  format_string: string,                   // See §11.4 for grammar.
  few_shot_examples: [
    { transcript: string, expected_field_values: object }
  ],
  keywords: string[],                      // Deepgram boost list, e.g. ["WNL:1.5", "USS:1.5", ...]
  system_prompt_override: string | null,
  created_at: timestamp,
  updated_at: timestamp,
}
```

Older versions of a template are retained at `/practices/{practice_id}/templates/{template_id}/versions/{version}` so notes can re-render against the version that created them.

**`/practices/{practice_id}/providers/{provider_id}` and `/practices/{practice_id}/assistants/{assistant_id}`**
Practice-level staff lists. Providers and assistants pulled by template fields with `picklist.source: "providers" | "assistants"`.
```
{
  display_name: string,                    // "Dr. Parul Aggarwal, DDS" or "Veronica"
  credential: string | null,               // "DDS", "RDH", license number, etc.
  active: boolean,
  created_at: timestamp,
}
```

**`/audit/{practice_id}/{event_id}`**
Content-free audit records for usage analytics. No PHI, no field values, no transcript.
```
{
  event_type: "note_created" | "note_filed" | "template_edited" | "signin",
  clinician_id: string,
  note_id: string | null,
  template_id: string | null,
  date_iso: string,                        // Day-level.
  created_at: timestamp,
}
```
Retained for 90 days.

### 9.2 Cloud Storage layout

```
gs://<project>-audio/
  notes/{note_id}/segments/{segment_id}    ← deleted within seconds of successful STT;
                                              24h lifecycle rule as safety net.
```

That's the entire Storage footprint. No long-lived audio. Object metadata: `{ clinician_id, note_id, segment_id }`; Storage Security Rules enforce that `clinician_id` in metadata equals the authenticated user.

### 9.3 PHI classification

| Entity | Classification | Where it lives | Sent to STT/LLM? |
|---|---|---|---|
| Audio segment | De-identified clinical | Cloud Storage (ephemeral, seconds) | Sent to STT only |
| Per-segment transcript chunk | De-identified clinical | Firestore `notes/{nid}/segments/{sid}` | n/a (input to next stage) |
| Combined transcript | De-identified clinical | Firestore `notes/{nid}.transcript` | Sent to LLM |
| Field values | De-identified clinical | Firestore `notes/{nid}.field_values` | n/a (output of LLM, edited by user) |
| Assembled final note text | De-identified clinical | Firestore `notes/{nid}.final_note_text` | n/a (output) |
| Patient tag | **PHI** | Firestore `patient_tags/{nid}` | **Never** |
| Precise timestamp | PHI-adjacent (identifying with schedule) | Firestore `patient_tags/{nid}` only | **Never** |
| Clinician profile | Workforce data | Firestore `clinicians/{cid}` | n/a |
| Template definition | Configuration | Firestore `practices/{pid}/templates/{tid}` | Sent to LLM as prompt |
| Staff lists (providers, assistants) | Workforce data | Firestore `practices/{pid}/{providers,assistants}` | Sent to LLM as picklist options |

The PHI surface area in this system is exactly one subcollection (`patient_tags`). That's the entire footprint. This is the single most important architectural property of the design.

### 9.4 State machine

A note moves through statuses in roughly this order. Not every transition is required — a note that's filled entirely by picklist (no voice) skips the audio/STT/drafting states.

```
+ New Note          →  new
record start        →  recording
audio uploaded      →  transcribing
STT complete        →  drafting
LLM fill complete   →  ready
dentist edits       →  edited        (loops back to ready on next AI fill via augment)
dentist Mark Filed  →  filed         (terminal; note doc hard-deleted, audit row written)
pipeline failure    →  error         (recoverable: retry returns the note to its prior status)
```

Augment recording on a `ready` note moves it back to `recording` → `transcribing` → `drafting` → `ready`; previously-set field values from the user are preserved (per `source: "user"` provenance).

A scheduled Cloud Function deletes notes (and their segments, transcripts, field values, and patient tags) 30 days after creation if they were never explicitly filed.

---

## 10. Key Components

### 10.1 Web app (MVP)

**Technology:** React + Vite + TypeScript. Hosted on Firebase Hosting.

**Key APIs used:**
- `MediaRecorder` for browser-microphone audio capture with `getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 16000 } })`.
- Firebase JS SDK: Auth, Firestore (real-time listeners), Storage.
- Clipboard API (`navigator.clipboard.writeText`) for Copy Note.

**Screens (MVP):**
1. **Sign-in.**
2. **Notes list.** Organized by date; columns: template name, patient tag (joined from `patient_tags`), status, age. Filter by status and template. `+ New Note` button.
3. **Note workspace** (the main screen). Three panes:
   - Header: template name, patient tag (editable inline), status, age.
   - Left/center: field list. Each field rendered as a row with (a) a picklist control (dropdown or multi-select) if the template defines one, and (b) a free-text qualifier input if the template allows one. Picklist source can be inline options, the practice's `providers` list, or the practice's `assistants` list. Fields the AI inferred are marked.
   - Right: live preview of the assembled `final_note_text` exactly as it will be pasted. Below the preview: Copy Note, Mark Filed, and a collapsible Transcript & Audio segments panel.
   - Top right: Record / Stop button, with sub-actions for Re-record (clean) and Augment.
4. **Template editor (admin only).** List of templates; form-based create/edit with field builder, format-string editor, keyword list editor, few-shot example editor. Versioned — saves bump `version` and archive the prior version under `versions/`.
5. **Settings.** Practice info, providers list, assistants list (admin-editable), user management, sign out.

### 10.2 Mobile PWA (v1.1)

Deferred from MVP. When added: same lifecycle as the web app, same Firebase backend, same Firestore source of truth. Adds an `IndexedDB`-backed upload queue (via the `idb` library) for offline operatories, a touch-optimized recording UI with large mic button, and template selection optimized for one-tap operation. The data model in §9 already accommodates this with no schema changes; the mobile client is purely additive.

### 10.3 Cloud Function: processSegment

**Trigger:** `onObjectFinalized` on Cloud Storage path `notes/*/segments/*`.

**Runtime:** Node.js 20 on Cloud Functions 2nd gen. Memory: 512 MB. Timeout: 120 seconds. Min instances: 0 (cold starts are tolerable for this async pipeline; bump to 1 if startup latency becomes a complaint).

**Steps:**
1. Parse `clinician_id`, `note_id`, `segment_id` from object metadata. Verify metadata `clinician_id` matches the path.
2. **Idempotency:** if the segment doc already has `status: "done"`, return immediately. If `status` is `"transcribing"` and the started-at timestamp is fresh (< 60s), return; if stale, proceed.
3. Read the parent note doc; read the template doc (by `template_id` + `template_version`) from `/practices/{pid}/templates/{tid}/versions/{v}` (or current version doc if v is current).
4. Download audio blob from Cloud Storage into memory.
5. Call Deepgram `transcribeFile` with `model: "nova-3-medical"`, `smart_format: true`, `punctuate: true`, `keywords: [...template.keywords]`.
6. Write the per-segment transcript chunk to `notes/{nid}/segments/{sid}.transcript_chunk` with `status: "done"`. Append the chunk to the parent note's `transcript`.
7. Delete the audio blob from Cloud Storage. Clear `storage_path` on the segment doc.
8. Set the parent note's `status: "drafting"`.
9. Build the LLM prompt: system prompt with the template's schema, prior user-set field values (so the model knows what *not* to overwrite), few-shot examples, and the full combined transcript.
10. Call Anthropic API with Claude Sonnet 4.6, tool-use enabled with the template's field-value schema. Prompt caching markers on the system prompt and few-shot examples.
11. Parse the tool call result. Validate. On schema violation, retry once with a corrective prompt.
12. Merge the LLM's output into the note's `field_values`. For each field the AI returns: if the existing value has `source: "user"`, do not overwrite; otherwise, set to AI value with `source: "ai"` and the appropriate `ai_confidence`.
13. Render `final_note_text` by applying the template's format string to the merged `field_values`.
14. Update the note doc with the merged field values, the new `final_note_text`, and `status: "ready"`.

Errors at any step write `status: "error"` with a human-readable `error_message` to the note doc, surfaced in the UI for clinician-initiated retry. Errors do not advance the status machine past the failing stage.

### 10.4 STT integration (Deepgram)

**Provider:** Deepgram Nova-3 Medical, batch (prerecorded) mode.

**API key storage:** Firebase Secret Manager (`firebase functions:secrets:set DEEPGRAM_API_KEY`).

**SDK:** `@deepgram/sdk` (Node).

**Configuration:**
- Model: `nova-3-medical`
- Smart formatting and punctuation: enabled
- Keyword boosting: per-template list, weights 1.5-2.0
- Diarization: disabled (single-speaker dictation)
- Profanity filter: disabled (no need; clinical content)

**Cost monitoring:** Deepgram console usage alerts at 80% of monthly budget threshold.

**Fallback:** thin provider abstraction so we can swap to Whisper-via-Groq or AssemblyAI without rewriting pipeline logic.

### 10.5 LLM integration (Anthropic Claude)

**Provider:** Anthropic API. Claude Sonnet 4.6 as workhorse. Claude Opus 4.7 as escalation for complex templates (configurable per-template; not used in MVP). Pin the exact model ID at implementation time; verify the current Sonnet via Anthropic docs.

**API key storage:** Firebase Secret Manager (`ANTHROPIC_API_KEY`).

**SDK:** `@anthropic-ai/sdk` (Node).

**Prompt structure (per template):**
- System prompt: role definition, schema description, "do not invent" guardrails, confidence-marking rules. Cached.
- Tool definition: JSON schema for the template's field values, where each field returns `{ picklist?, qualifier?, confidence }`. Cached.
- Few-shot examples: 2-3 `(transcript, expected_field_values)` pairs as prior `tool_use` turns. Cached.
- User message: the full combined transcript, plus any field values the dentist has already explicitly set (so the model can fill the rest without contradicting her).

**Prompt caching:** enable Anthropic's prompt caching on the system prompt + tool schema + few-shot examples. These are stable per template and benefit hugely from caching. Request Zero Data Retention from Anthropic for the account (even though content is de-identified, this is good hygiene).

**Output handling:** parse the `tool_use` block from the response. Validate against schema. On schema violation, retry once with a corrective prompt; if still failing, set note status to `error`.

### 10.6 Template system

Templates live in Firestore under `/practices/{practice_id}/templates/{template_id}`. The MVP ships with **~10 pre-built templates** provided by the pilot dentist and hand-built by the developer during onboarding. The exact list is TBD; templates so far captured from the practice include **Cementation** (see `cementation_template.txt` at repo root) and **Periodic Exam / Adult Prophy** (sample note captured in the design conversation).

Each template needs:
- Field definitions: ~10-20 fields per template, each with an optional picklist (single/multi/source-referenced) and an optional free-text qualifier slot.
- Format string that produces the dentist's exact note style, including her clinical shorthand (WNL, BWs, PAs, USS, OHI, etc.).
- 2-3 few-shot examples: `(transcript, expected_field_values)` pairs from real recordings the dentist makes during onboarding.
- Dental keyword list tuned to terms she actually uses.

Provider and assistant fields draw their options from practice-level staff lists (`/practices/{pid}/providers`, `/practices/{pid}/assistants`) rather than embedding the lists in every template.

The template editor in the web app is functional but minimal in MVP. A richer visual editor is v2.

---

## 11. Template System Deep Dive

The template system is the heart of the product. The core abstraction: each field has an optional **picklist part** (single-select, multi-select, or sourced from a practice staff list) and an optional **free-text qualifier**, rendered together on one line by the format string.

### 11.1 Example template: Periodic Exam / Adult Prophy

Drawn from a real note from the practice. Output should match this format exactly:

```
Note created by Parul Aggarwal on 12/13/2025
Appt Type: Periodic Exam, Adult Prophy
Patient Chief Concern: Cleaning and Checkup
Soft Tissue Exam: WNL
TMJ Exam: WNL
X-rays and Images: 4 BWs and 2 PAs
Prophy Tx: Ultrasonic (USS), Handscale, Polish with fluoride paste, Floss
The patient's overall Oral Hygiene is: Fair
Plaque: Moderate generalized
Calculus: Heavy, more all lowers, Heavy AL
Bleeding: Heavy generalized
Stain: Minimal
Probing: Spot probed. Lots of 4mm, some 5mm around #2,3,30,31
OHI: Electric Toothbrush, Manual Toothbrush, Waterpik

Dr. Exam: PPE established.
Next Visit: 3 months PM
RDH EB 25612
Dr. Parul Aggarwal, DDS
```

**Fields (abridged):**

| Field name | Picklist part | Qualifier? | Notes |
|---|---|---|---|
| `appt_type` | multi: `["Periodic Exam", "Adult Prophy", "Child Prophy", "Limited Exam", "Comprehensive Exam"]` | no | |
| `chief_concern` | none | yes | Pure free-text. |
| `soft_tissue` | single: `["WNL", "Lesion noted", "See note"]` | yes | Qualifier used when not WNL. |
| `tmj` | single: `["WNL", "Click noted", "Tenderness", "See note"]` | yes | |
| `xrays` | multi: `["FMX", "Pano", "BWs", "PAs", "None"]` | yes | Qualifier carries counts (`4 BWs and 2 PAs`). |
| `prophy_tx` | multi: `["Ultrasonic (USS)", "Handscale", "Polish with fluoride paste", "Polish without fluoride", "Floss"]` | no | |
| `oral_hygiene` | single: `["Excellent", "Good", "Fair", "Poor"]` | no | |
| `plaque` | single: `["None", "Minimal", "Moderate generalized", "Moderate localized", "Heavy"]` | yes | |
| `calculus` | single: `["None", "Minimal", "Moderate", "Heavy"]` | yes | Real example: picklist `Heavy` + qualifier `more all lowers, Heavy AL`. |
| `bleeding` | single: `["None", "Minimal", "Localized", "Generalized", "Heavy generalized"]` | yes | |
| `stain` | single: `["None", "Minimal", "Moderate", "Heavy"]` | yes | |
| `probing` | single: `["WNL", "Spot probed", "Full perio chart"]` | yes | Qualifier carries the actual readings. |
| `ohi` | multi: `["Electric Toothbrush", "Manual Toothbrush", "Floss", "Interdental Brush", "Waterpik", "Mouth Rinse"]` | no | |
| `dr_exam` | none | yes | Short free-text from Dr. (`PPE established.`). |
| `next_visit` | single: `["3 months Prophy", "4 months Prophy", "6 months Prophy", "3 months PerMaint", "4 months PerMaint", "6 months PerMaint", "SRP", "Restorative", "Referred to Specialist"]` | no | |
| `provider` | sourced from `providers` | no | Renders as `Dr. Parul Aggarwal, DDS`. |
| `hygienist` | sourced from `providers` (filtered to RDH) | no | Renders as `RDH EB 25612`. |

**Format string (sketch — final grammar in §11.3):**

```
Note created by {{provider.display_name}} on {{date}}
Appt Type: {{appt_type | join:", "}}
Patient Chief Concern: {{chief_concern}}
Soft Tissue Exam: {{soft_tissue}}
TMJ Exam: {{tmj}}
X-rays and Images: {{xrays.qualifier | default:xrays.picklist | join:" and "}}
Prophy Tx: {{prophy_tx | join:", "}}
The patient's overall Oral Hygiene is: {{oral_hygiene}}
Plaque: {{plaque}}{{plaque.qualifier ? ", " + plaque.qualifier}}
Calculus: {{calculus}}{{calculus.qualifier ? ", " + calculus.qualifier}}
Bleeding: {{bleeding}}
Stain: {{stain}}
Probing: {{probing}}{{probing.qualifier ? ". " + probing.qualifier}}
OHI: {{ohi | join:", "}}

Dr. Exam: {{dr_exam}}
Next Visit: {{next_visit}}
{{hygienist.display_name}}
{{provider.display_name}}
```

**Keyword list (representative):** `["WNL:1.5", "USS:1.5", "BWs:1.5", "PAs:1.5", "FMX:1.5", "PerMaint:1.5", "SRP:1.5", "PPE:1.5", "OHI:1.5", "Waterpik:1.5", "Ultrasonic:1.5", "Handscale:1.5", "Prophy:1.5", "perio:1.5", "distolingual:1.5", "mesiobuccal:1.5"]`

**Few-shot example (one of three):**

Transcript: *"Periodic exam and adult prophy. Cleaning and checkup. Soft tissue and TMJ within normal limits. Four bitewings and two PAs. Ultrasonic, handscale, polish with fluoride paste, floss. Oral hygiene fair. Moderate generalized plaque. Heavy calculus, more on the lowers and lingual. Heavy generalized bleeding. Minimal stain. Spot probed, lots of fours, some fives around two three thirty thirty-one. Electric toothbrush, manual, Waterpik. PPE established. Three months perio maintenance."*

Expected field values:
```json
{
  "appt_type":      { "picklist": ["Periodic Exam", "Adult Prophy"], "qualifier": null,                              "confidence": "high" },
  "chief_concern":  { "picklist": null,                              "qualifier": "Cleaning and Checkup",            "confidence": "high" },
  "soft_tissue":    { "picklist": "WNL",                             "qualifier": null,                              "confidence": "high" },
  "tmj":            { "picklist": "WNL",                             "qualifier": null,                              "confidence": "high" },
  "xrays":          { "picklist": ["BWs", "PAs"],                    "qualifier": "4 BWs and 2 PAs",                 "confidence": "high" },
  "prophy_tx":      { "picklist": ["Ultrasonic (USS)", "Handscale", "Polish with fluoride paste", "Floss"], "qualifier": null, "confidence": "high" },
  "oral_hygiene":   { "picklist": "Fair",                            "qualifier": null,                              "confidence": "high" },
  "plaque":         { "picklist": "Moderate generalized",            "qualifier": null,                              "confidence": "high" },
  "calculus":       { "picklist": "Heavy",                           "qualifier": "more all lowers, Heavy AL",       "confidence": "high" },
  "bleeding":       { "picklist": "Heavy generalized",               "qualifier": null,                              "confidence": "high" },
  "stain":          { "picklist": "Minimal",                         "qualifier": null,                              "confidence": "high" },
  "probing":        { "picklist": "Spot probed",                     "qualifier": "Lots of 4mm, some 5mm around #2,3,30,31", "confidence": "high" },
  "ohi":            { "picklist": ["Electric Toothbrush", "Manual Toothbrush", "Waterpik"], "qualifier": null,       "confidence": "high" },
  "dr_exam":        { "picklist": null,                              "qualifier": "PPE established.",                "confidence": "high" },
  "next_visit":     { "picklist": "3 months PerMaint",               "qualifier": null,                              "confidence": "high" }
}
```

### 11.2 Confidence marking

Each field returned by the LLM carries an `ai_confidence`:

- **high:** the field was explicitly stated in the transcript.
- **inferred:** the field was reasonably inferred from context but not stated outright (e.g. provider defaulting to the signed-in clinician when not mentioned).
- **missing:** the field was not mentioned at all. The field is left empty (or carrying the user's prior pick if she set it manually).

The UI marks inferred and missing fields so the dentist's eye is drawn to anything not high-confidence. Color is used but never alone — icons accompany it for accessibility.

### 11.3 Format string semantics

The format string supports:

- **Plain substitution:** `{{field_name}}` is replaced by the field's rendered value (picklist + qualifier joined per the field's rendering rule).
- **Sub-paths:** `{{field_name.picklist}}`, `{{field_name.qualifier}}`, `{{field_name.display_name}}` (for sourced references like provider/assistant).
- **Conditional fragments:** `{{ field ? "literal text" + field.qualifier }}` renders the right-hand expression only if the left-hand condition is truthy.
- **Filters:** `{{field | upper}}`, `{{field | lower}}`, `{{field | join:", "}}` for arrays, `{{field | default:N/A}}` for fallbacks.

If a required field is missing, the format string renders `[MISSING: field_name]` inline rather than blocking the note. The dentist can fill it in manually before copying.

We will adopt a single grammar at implementation time (Handlebars-compatible is the leading candidate). The examples in this document use `{{ }}` syntax to disambiguate from JSON sample data; the final renderer in `shared/src/format.ts` will codify the exact grammar.

---

## 12. Security & Compliance

### 12.1 PHI posture (recap)

The architectural goal is to keep PHI out of the AI pipeline. The dentist dictates clinical content only. The patient tag, the one piece of PHI in the system, lives in an isolated subcollection that is never sent to STT or LLM providers.

This means the audio, transcripts, and drafts are de-identified clinical content. Under HIPAA Safe Harbor analysis, content without any of the 18 specified identifiers is not PHI. This dramatically reduces compliance complexity.

### 12.2 UUIDs are random

All `recording_id` values are v4 random UUIDs generated client-side. They are not hashes of names or times. This is non-negotiable: derived identifiers from PHI are still PHI under Safe Harbor; random UUIDs are not.

### 12.3 Date granularity

The backend stores recording dates at day-level granularity only (`2026-05-19`). Precise timestamps live alongside the patient tag in the PHI subcollection. Precise time + clinician + day reveals the patient via schedule lookup, so we keep precise time tied to the tag.

### 12.4 Authentication and authorization

Firebase Authentication handles user management. Email + password to start. MFA (TOTP via Firebase Auth) is required before onboarding any external customer. Magic-link authentication is a v2 consideration for simpler clinician onboarding.

Authorization is enforced by Firestore Security Rules. The principal rule: a clinician can read/write only documents under `/clinicians/{cid}/...` where `cid == auth.uid`. Admin users can additionally manage templates at the practice level. Cloud Storage rules enforce that audio uploads can only go to paths matching the authenticated user's UID.

Security rules are tested with the Firebase emulator before deployment. This is non-optional.

### 12.5 Audit logging

A minimal audit log is kept in `/audit/{practice_id}/{event_id}` for events: clinician sign-in, draft created, draft edited, draft filed, template modified. No content. No PHI. Just `{ event_type, clinician_id, recording_id, timestamp }`. Retained for 90 days.

### 12.6 Data deletion

The "Mark Filed" action triggers immediate deletion of the recording, draft, and tag for that UUID. A scheduled Cloud Function additionally sweeps records older than 30 days (configurable) that were never explicitly filed, deleting them with notification to the clinician.

Clinicians can also bulk-delete their data via a settings action. This is straightforward because all data is keyed on `clinician_id` and `recording_id`.

### 12.7 Vendor security

Deepgram and Anthropic API calls are over TLS. API keys are stored in Firebase Secret Manager, not in source code. Both providers have published security practices and SOC 2 reports available for review.

Even though we don't currently need BAAs, both providers offer them. This is a future option if the product evolves to support full-encounter recording (which would put PHI back into the pipeline).

### 12.8 Compliance posture summary

The system is designed to be **non-PHI by architecture** in MVP. This is not a HIPAA-covered application from the AI provider perspective, because no PHI leaves the Firestore PHI subcollection. The dental practice itself remains a covered entity and must handle the PMS-side notes per their own compliance program — that's outside this product's responsibility.

If a practice's compliance posture requires belt-and-suspenders, they can additionally execute a BAA with the developer entity for the patient_tag storage, since that subcollection does contain PHI. This is straightforward paperwork.

---

## 13. Cost Analysis

Detailed monthly cost for one dentist seeing 15 patients/day, 22 days/month (330 notes/month).

### 13.1 Variable costs by recording length

**Deepgram Nova-3 Medical with Keyterm Prompting** at approximately $0.0077/min base + $0.0017/min keyterm = $0.0094/min effective rate (verify current rates before commit):

| Avg recording length | Min/month | Monthly cost |
|---|---|---|
| 75 seconds | 413 | $3.88 |
| 3 minutes | 990 | $9.31 |
| 5 minutes | 1,650 | $15.51 |
| 7.5 minutes | 2,475 | $23.27 |
| 10 minutes | 3,300 | $31.02 |

**Claude Sonnet 4 with prompt caching** (~1,700 cached input tokens, 200-1,600 transcript tokens, 400 output tokens):

| Avg transcript length | Per note | Monthly |
|---|---|---|
| 200 tokens (~75 sec) | $0.007 | $2.31 |
| 800 tokens (~5 min) | $0.009 | $2.97 |
| 1,600 tokens (~10 min) | $0.013 | $4.29 |

### 13.2 Fixed costs

| Item | Monthly |
|---|---|
| Firebase (Spark free tier for 1 practice) | $0 |
| Firebase (Blaze pay-as-you-go at scale, ~20 practices) | $5-10 |
| Domain | $1 |
| Error monitoring (Sentry free tier) | $0 |
| Uptime monitoring (BetterStack free tier) | $0 |
| Transactional email (Resend free tier) | $0 |
| **Total fixed** | **$1-11** |

### 13.3 All-in monthly cost per dentist

Assuming **5-minute average recordings** as a working assumption (subject to revision after pilot data):

| Component | Cost |
|---|---|
| Deepgram Nova-3 Medical with keyterms | $15.51 |
| Claude Sonnet 4 with caching | $2.97 |
| Firebase | $0 (single practice on Spark) |
| Domain, monitoring, email | $1 |
| **TOTAL** | **~$19.48/month per dentist** |

At **10-minute average recordings**: ~$36/month per dentist.
At **3-minute average recordings**: ~$13/month per dentist.

### 13.4 Cost scaling

Variable cost per note: **~$0.06** at 5-minute recordings. At any subscription price above $20/month per dentist, gross margin is positive and improves with scale. Competitive AI scribe products in dentistry charge $200-500/month per provider; human scribes cost $1,500-3,000/month. Pricing room is substantial.

### 13.5 Cost optimization opportunities (v2+)

A few levers for later:

**Client-side voice activity detection (VAD)** to trim silence before upload. Real clinical recordings include pauses, instrument noise, and silent periods. VAD trimming can reduce billable STT minutes by 30-50%.

**Smaller LLM for simple templates.** Templates with fewer than 6 fields and no narrative could run on Claude Haiku 4.5 or GPT-4o-mini at ~10x lower cost. Worth benchmarking accuracy first.

**Self-hosted Whisper for STT.** If volume grows substantially, running Whisper-large-v3 on a GPU box becomes cost-competitive with cloud STT around 50,000 minutes/month total volume (~25 dentists). Adds ops burden; only worth it at scale.

---

## 14. Decisions Made

This section captures decisions that have been made, with rationale. Future contributors should not re-litigate these without strong reason.

### 14.1 Web-only MVP; symmetric mobile PWA in v1.1

**Decision:** MVP is a single web app handling the full lifecycle (create / record / fill picklist / edit qualifiers / review / copy / mark filed). v1.1 adds a mobile PWA with the *same* capabilities — not the asymmetric capture-only role originally specified. Cross-device handoff is provided by Firestore acting as the source of truth from the moment of `+ New Note`.

**Rationale (web-only MVP):** A single surface dramatically reduces MVP scope — no PWA install flow to debug, no iOS Safari `MediaRecorder` quirks, no offline IndexedDB queue, no two-device tag-sync race. The dentist is at her workstation between patients anyway, which is also where the PMS picklist + free-text typing happens today; adding recording to the same surface keeps the entire workflow in one place. The mobile PWA was the highest-friction part of the original design; deferring it shortens the path to a pilot.

**Rationale (symmetric mobile in v1.1):** The original asymmetric split (phone records, web reviews) assumed work flows one direction. In practice work flows both directions: the dentist may start a recording at her workstation and pick it up on her phone, or vice versa. Symmetric surfaces with Firestore as the source of truth are simpler than asymmetric surfaces with bespoke sync. The earlier reasoning about ergonomic differences still holds — the mobile UI will optimize for chairside one-tap operation — but capability sets are the same on both surfaces.

### 14.2 PWA-first for mobile

**Decision:** Build the mobile capture as a Progressive Web App. Defer native iOS/Android apps to v2 or v3.

**Rationale:** A PWA gets us 80% of native capability for 20% of the work. MediaRecorder, IndexedDB, Service Workers, Web Push, and Firebase SDKs all work in modern mobile browsers. No app store submission, no separate codebases for iOS and Android, no provisioning profiles. We can ship in days rather than weeks. The downsides are real but manageable: no lock-screen widget, no Apple Watch app, no Action Button integration on iPhone — these become reasons to do native later. None block the MVP.

### 14.3 Copy-to-clipboard instead of keyboard simulation

**Decision:** The final note is placed on the clipboard for the clinician to paste into Dentrix. Do not simulate keyboard input or inject text via OS-level hooks.

**Rationale:** Keyboard simulation requires a native desktop app (Tauri or Electron), OS-level permissions, and runs into accessibility-API quirks on macOS, Smart Card / Group Policy restrictions on Windows, and antivirus false positives. Copy-paste is universal, works in any browser, works in any PMS (browser-based or native), requires no special permissions, and is invisible to security software. The one-click "Copy Note" + manual paste is one extra action for the clinician but eliminates entire classes of deployment problems.

### 14.4 No PMS integration

**Decision:** The product does not integrate with Dentrix, Open Dental, Eaglesoft, CareStack, Curve Dental, or any other PMS. It produces note text on the clipboard.

**Rationale:** Each major dental PMS has either a proprietary API requiring vendor certification (expensive, time-consuming, sometimes impossible for a solo developer), no API at all, or a different API for each version. Integration would consume the bulk of engineering time without proportional product benefit, since the dentist is reviewing each note anyway — copy-paste is one extra click. The product remains PMS-agnostic, which is also a sales advantage: it works with anything.

### 14.5 De-identified pipeline by design

**Decision:** Architect the system so that audio, transcripts, and AI-generated drafts are **not PHI**. The dentist dictates clinical content only; patient identifiers live in a separate tag field that never reaches STT or LLM.

**Rationale:** This is the single most consequential decision in the project. It collapses the HIPAA compliance surface from "this entire system is PHI" to "one tiny subcollection is PHI." It eliminates the need for BAAs with AI providers at MVP stage. It opens up the choice of best-in-class providers regardless of HIPAA-eligibility. It makes logs and analytics safe. It makes the product easier to debug and easier to demo. The cost is asking the clinician to develop the habit of not saying patient names in dictation — which is a small ask given the value, and which we reinforce with UI design (separate tag field) and (in v2) a PHI scanner safety net.

### 14.6 UUID is a random v4, not derived from PHI

**Decision:** `recording_id` is a v4 random UUID, generated client-side at the moment of recording. It is never derived from name, time, or any other identifying information.

**Rationale:** Under HIPAA Safe Harbor, identifiers derived from PHI (even via hashing) are themselves PHI. A random UUID is not. Using `hash(name + time)` would defeat the entire de-identification posture because anyone who knew the patient's name and approximate appointment time could recompute the hash and look up the recording. Random UUIDs preserve the property that the backend has no way to map a recording back to a patient without going through the PHI subcollection (which it shouldn't).

### 14.7 Firebase as the backend stack

**Decision:** Use Firebase (Firestore, Cloud Functions, Cloud Storage, Authentication, Hosting) as the entire backend.

**Rationale:** The capture-on-phone / review-on-web pattern needs realtime sync between devices — Firestore listeners are precisely this and require no custom code. Offline-first capture is built into the Firestore SDK and IndexedDB. Auth, file storage, and serverless compute are all native services with no glue. The free tier covers a single practice's usage entirely. Vendor lock-in is real but acceptable for a single-product, vertical SaaS — and we lose less than we'd lose stitching together Vercel + Supabase + Auth0 + custom realtime. Postgres would be more portable but offers nothing the use case needs that Firestore doesn't.

### 14.8 Deepgram Nova-3 Medical for STT

**Decision:** Use Deepgram Nova-3 Medical (batch mode) as the speech-to-text provider for MVP.

**Rationale:** Best accuracy on clinical jargon, including dental terminology, of the major providers tested. Strong keyword-boost feature (Keyterm Prompting) which is the single largest accuracy lever. Sub-5-second latency on typical recordings. BAA available if we ever need it. Reasonable cost. Clean SDK and good docs. The thin provider-abstraction layer in the backend lets us swap to alternatives without rewriting if Deepgram proves wrong.

### 14.9 Claude Sonnet 4.6 for template-fill

**Decision:** Use Claude Sonnet 4.6 via the Anthropic API as the workhorse LLM for template field-fill. Use tool-use for structured output. Use prompt caching. Pin the exact model ID at implementation time and re-verify on each upgrade.

**Rationale:** Excellent at structured extraction, reliable JSON output via tool-use, strong clinical language handling, good cost-quality balance. Tool-use guarantees schema-conforming output; the response is unambiguous. Prompt caching reduces the cost of stable per-template system prompts by ~30%. Sonnet is the sweet spot — Opus is overkill for this task, Haiku is plausible but accuracy needs more verification before we trust it on harder templates. The provider abstraction also makes GPT-4o or Gemini 2.5 Pro swappable for comparison.

### 14.10 Per-template prompts and few-shot examples

**Decision:** Each template has its own dedicated system prompt and 2-3 few-shot examples in the LLM prompt. Do not use a single universal prompt.

**Rationale:** A composite restoration note and a hygiene recall note have very different vocabulary, structure, and reasoning requirements. A universal prompt that tries to handle all templates is mediocre at all of them. Per-template prompts let us tune accuracy where it matters — and the few-shot examples (drawn from the clinician's actual past notes during onboarding) are the highest-leverage accuracy improvement we can make. The cost is more configuration to maintain; the benefit is materially better output.

### 14.11 Strict JSON via tool-use

**Decision:** Use Anthropic's tool-use feature (or OpenAI's structured outputs / JSON mode) to constrain LLM output to a JSON schema matching the template. Do not parse free-form LLM text.

**Rationale:** Tool-use guarantees schema-conforming output. There is no parsing ambiguity, no malformed JSON, no hallucinated fields. The model is literally constrained to produce valid output. Free-form text parsing is fragile, error-prone, and adds latency through retry loops. Tool-use is also forward-compatible with structured outputs in other providers.

### 14.12 Batch STT, not streaming

**Decision:** Use Deepgram's batch (prerecorded) transcription endpoint, not the streaming endpoint.

**Rationale:** The clinician is not watching the transcript appear in real-time — she's already walking to the next patient. Batch is simpler to implement (one HTTP call, one response), slightly cheaper, and equally accurate. Streaming buys us nothing for this UX. We may revisit if a real-time "see what was transcribed" affordance becomes valuable in v2 or v3.

### 14.13 Hardcoded templates for MVP

**Decision:** Ship MVP with ~10 pre-built templates created in collaboration with the pilot dentist. Defer the visual template editor.

**Rationale:** The template editor is a real interaction-design challenge — field types, picklist option sets, qualifier slots, format strings, few-shot examples are not trivial to expose in a UI. Building it well takes time we'd rather spend on the core record-and-review loop. The pilot dentist already uses ~10 templates in her PMS picklist workflow; the developer hand-builds those during onboarding (an afternoon's work per template) and edits them via a minimal form-based admin UI or direct Firestore console for MVP. The visual editor is a v2 priority once we know what edits clinicians actually need to make.

### 14.14 Explicit template selection

**Decision:** The clinician selects the template at capture time via a chip tap or quick-search. Do not auto-detect the template from the dictation.

**Rationale:** Auto-detection is harder and less reliable than explicit selection. A wrong template selection is silent — the dentist won't realize the AI is filling a "hygiene recall" template from a composite dictation until she opens the review panel. Explicit selection takes one extra tap but eliminates this class of error. Auto-detect is an attractive v2 feature once we have data to train on.

### 14.15 Defer the PHI scanner to v2

**Decision:** No PHI detector in MVP. Rely on user discipline (don't say patient names) and UI design (separate tag field) as primary safeguards.

**Rationale:** The PHI scanner is a third line of defense, not a first. The first line is the dentist's habit; the second is the data model that keeps tag and audio separate. A scanner adds complexity (Presidio dependency or extra LLM call), occasional false positives that annoy the clinician, and policy decisions about redact-vs-reject-vs-flag. In MVP we ship without it and observe how often accidental name mentions actually happen. If the rate is non-trivial, we add Presidio plus a daily report in v2.

### 14.16 Delete audio after STT

**Decision:** Audio blobs are deleted from Cloud Storage immediately after successful transcription, within seconds. A 24-hour lifecycle rule on the bucket serves as a safety net.

**Rationale:** Audio has no further use once the transcript exists. It is the largest blob in the system (~225 KB per recording at 75 seconds, ~2 MB at 10 minutes), the most sensitive even when de-identified, and the most embarrassing if leaked. Aggressive deletion shrinks the data footprint, simplifies the breach posture, and reinforces the de-identified-by-design property.

### 14.17 Mobile shows finished content (when v1.1 lands)

**Decision (revised):** When the mobile PWA is added in v1.1, it has the *same* capabilities as the web app — including review and editing of finished notes. The earlier decision to restrict mobile to "status only" is reversed.

**Rationale:** With Firestore as the source of truth and cross-device handoff a core requirement, an asymmetric capability split creates more friction than data-surface tightening saves. The mobile UI should still default to a capture-optimized view (large mic button, recent notes) and require an explicit action to open the review panel — keeping the *happy path* focused on capture, while not locking the dentist out of editing on her phone when she needs to.

### 14.18 Patient tag stored in Firestore subcollection from the start

**Decision (revised):** The patient tag lives in the `patient_tags` Firestore subcollection from the moment a note is created. Firestore's offline persistence handles device-local caching; we do not maintain a separate local-only store.

**Rationale:** "Local-first, optionally synced" was the original framing for an asymmetric capture/compose split. With symmetric surfaces and Firestore as the source of truth, the tag must be in Firestore for the other device to see it. Firestore's built-in offline persistence covers the "tag visible without network" case, and the isolated subcollection with stricter security rules (no list permission) keeps PHI corralled to one place. This is simpler than the original two-tier model and equivalent on the data surface.

---

## 15. Decisions Rejected

This section captures alternatives that were considered and explicitly rejected, with reasoning. These are documented to prevent re-litigation and to give future contributors the context for why the design is the way it is.

### 15.1 Direct PMS integration (Dentrix, Open Dental, etc.) — REJECTED

**Proposal:** Build native integrations with Dentrix Ascend (and possibly others) so notes are written directly into the patient chart without copy-paste.

**Why rejected:** Dentrix Ascend's official API requires vendor partnership and certification, which is a months-long process with significant fees and ongoing maintenance obligations. The same is true for most major dental PMSes — they are walled gardens. Open Dental has a more open API but only ~5% market share. Each version of each PMS has different integration surfaces, breaking on upgrades. The engineering time spent on integration would dwarf the time spent on the core product, and the benefit (one click rather than two) is marginal. Copy-paste keeps the product PMS-agnostic, which is also a sales advantage.

### 15.2 Keyboard simulation / desktop app — REJECTED

**Proposal:** Build a desktop app (Tauri or Electron) that registers a global hotkey, captures audio, runs the pipeline, and uses OS-level keyboard simulation to type the note into whatever field is focused in the PMS.

**Why rejected:** This was the original design and is technically elegant — it works with any PMS, any field, any app. But it carries a long tail of operational problems: macOS Accessibility API permissions that the user has to manually grant in System Settings, Windows Group Policy restrictions that prevent the install in many practice environments, antivirus false positives (anything that simulates keyboard input looks suspicious), Smart Card login interference, and the cross-platform development burden (Mac, Windows, both x64 and ARM). Copy-paste sidesteps all of this. The web app + clipboard approach loses the "automatic" feel but gains universal compatibility.

### 15.3 Local Whisper on the dentist's laptop — REJECTED

**Proposal:** Run Whisper (large or medium) locally on the dentist's workstation, fully air-gapped, no cloud dependency.

**Why rejected:** The pilot dentist's workstation is already loaded — Dentrix Ascend is a heavy browser-based application that consumes substantial CPU and memory. Adding Whisper + Ollama on top would degrade both. Mid-range office workstations don't have GPUs adequate for real-time Whisper-large. The privacy benefit is real but unnecessary since we've already designed the pipeline to be de-identified. We may revisit this for a "privacy-premium" tier in v3 if there's market demand.

### 15.4 Office mini-PC with GPU as STT/LLM server — REJECTED for MVP

**Proposal:** Sell a small GPU box (or recommend one) that sits on the practice's office network and runs Whisper + a local LLM. Mobile and web clients talk to it over LAN or via a tunnel.

**Why rejected for MVP:** Operational burden. Selling, supporting, and maintaining hardware in dozens of dental offices is a different business than running a SaaS. Updates, security patches, power outages, network reconfigurations — all become support tickets. The economics also don't work at small scale: a single GPU box that can serve one practice costs $1,000-2,000, which would take a year of subscription revenue to amortize. We may revisit at scale or as a premium tier for compliance-sensitive practices in v3.

### 15.5 Browser-based Whisper (WASM) — REJECTED

**Proposal:** Run Whisper directly in the mobile browser via WebAssembly (`whisper.cpp` compiled to WASM, or `transformers.js`). Audio never leaves the device.

**Why rejected:** Performance and accuracy are both inadequate. On a mid-range Android phone, `whisper-base` takes 45-60 seconds to transcribe a 60-second clip. Accuracy on dental jargon with `whisper-tiny` or `whisper-base` is poor — common terms like "distolingual" or "Class II MOD" are routinely mangled. iOS Safari has WASM memory constraints that make `whisper-small` borderline. First-load download size is 75-250 MB. This is an attractive v3 feature for a privacy-premium tier (it would let us claim "audio never leaves the device") but unsuitable for the primary product.

### 15.6 Native iOS/Android app — REJECTED for MVP

**Proposal:** Build a native iOS app (Swift) and Android app (Kotlin) from day one. Take advantage of platform features like Apple Watch, Action Button on iPhone, lock-screen widgets, deeper background audio.

**Why rejected for MVP:** Doubles or triples the engineering surface. Two codebases to maintain plus the PWA web codebase for the compose side. App Store submission delays. Native is genuinely better for the capture use case (Apple Watch tap-to-record is a killer feature) and we'll likely build it in v2 once the product is proven. For MVP, a well-built PWA gives us 80% of the experience at 30% of the cost.

### 15.7 Web Speech API in the browser — REJECTED

**Proposal:** Use the browser's built-in `webkitSpeechRecognition` / `SpeechRecognition` Web Speech API for STT instead of a paid provider.

**Why rejected:** The API is flaky across browsers (Safari support is partial, Firefox doesn't support it at all). It routes audio through Google's or Apple's servers with no privacy guarantee or BAA option. Accuracy on dental jargon is poor and there's no way to provide keyword boosting. Latency is unpredictable. Free is not free enough to be worth the unreliability and unclear data handling.

### 15.8 OpenAI Whisper API as primary STT — REJECTED for MVP

**Proposal:** Use OpenAI's Whisper API (`whisper-1`) as the primary STT provider. Cheaper than some alternatives, good general accuracy, simple integration.

**Why rejected:** Worse than Deepgram Nova-3 Medical specifically on clinical and dental terminology. No keyword-boost feature (only a free-form `prompt` parameter that biases recognition less effectively). Historically no BAA available (was a factor when PHI in the pipeline was being considered; less relevant now). Kept as a fallback provider via the abstraction layer.

### 15.9 Streaming STT — REJECTED for MVP

**Proposal:** Use Deepgram's streaming endpoint so the dentist can see the transcript appearing in real time as she dictates.

**Why rejected:** The dentist isn't watching her phone while dictating — she's moving on. The transcript visible during recording adds no value, complicates the SDK integration, slightly increases cost, and requires holding a WebSocket connection open. Batch is simpler and equally accurate. May revisit if a "review while still in the operatory" workflow becomes a real ask.

### 15.10 UUID derived from name + time — REJECTED

**Proposal:** Generate `recording_id` as `hash(patient_name + appointment_time)` so the same patient encounter always maps to the same identifier.

**Why rejected:** Catastrophic privacy mistake. Under HIPAA Safe Harbor, identifiers derived from PHI are themselves PHI, even when hashed. Anyone who knew the patient's name and approximate appointment time could recompute the identifier and look up the recording — defeating the entire de-identification posture. Random v4 UUIDs preserve the property that the backend cannot map a recording back to a patient without going through the PHI subcollection.

### 15.11 Patient tag stored in backend in plain text alongside other data — REJECTED

**Proposal:** Just store the patient tag as a regular field on the recording document, like any other metadata.

**Why rejected:** This would commingle PHI with the rest of the data model, expanding the PHI surface from a single subcollection to the entire database. The whole point of the design is to corral PHI into the smallest possible area. The cost of the isolated subcollection (a few extra security rule lines, slightly more code to fetch tags separately) is trivial compared to the compliance benefit.

### 15.12 Patient tag sent to the LLM for personalization — REJECTED

**Proposal:** Pass the patient tag to the LLM so the generated narrative can reference the patient by name ("Sarah tolerated the procedure well").

**Why rejected:** Would pull PHI into the LLM API call. The narrative is for the clinician's reference and gets pasted into the PMS chart which already has the patient's name. Personalizing the AI-generated text adds zero clinical value and breaks the PHI-free pipeline.

### 15.13 Universal generic LLM prompt — REJECTED

**Proposal:** Use a single system prompt that handles all templates, with the template definition passed in as part of the prompt.

**Why rejected:** Per-template prompts with template-specific few-shot examples are materially more accurate. The variance in vocabulary, structure, and reasoning across templates (a hygiene recall vs. a crown prep) is large enough that a generic prompt is mediocre at all of them. Per-template prompts cost a small amount of extra configuration to maintain but produce noticeably better extraction.

### 15.14 LLM generates narrative without ground-truth fields — REJECTED

**Proposal:** Have the LLM generate the entire narrative paragraph directly from the transcript, in parallel with field extraction.

**Why rejected:** Risk of clinical hallucination. The LLM might invent a material, shade, dosage, or finding that isn't in the transcript. The hybrid approach (extract fields first, then generate narrative constrained to be consistent with the extracted fields) gives natural prose while structurally preventing the model from introducing details outside the source material. This is a correctness-over-cleverness call.

### 15.15 Automatic template detection from dictation — REJECTED for MVP

**Proposal:** Skip the template-selection step. Have the LLM auto-detect the template from the dictation content.

**Why rejected:** Wrong template selection is silent — the clinician doesn't see the error until reviewing the draft, at which point she's done extra work for nothing. Explicit selection at capture time is one extra tap that eliminates this class of error. Auto-detection is attractive for v2 once we have data showing how often clinicians dictate the same content from the same template, and we can validate the detector against real recordings.

### 15.16 Vercel + Supabase as alternative backend — REJECTED for MVP

**Proposal:** Use Vercel for hosting and Supabase (managed Postgres + auth + realtime) for backend.

**Why rejected:** This is a fine stack and was seriously considered. Reasons to prefer Firebase: realtime sync is more mature (Firestore listeners are a first-class feature; Supabase Realtime is newer and less battle-tested), offline-first mobile support is native in the Firestore SDK while Supabase needs more glue, and the entire Firebase ecosystem (Auth + Storage + Functions + Hosting) integrates seamlessly. Postgres would be more portable and SQL more familiar to many developers — these are real losses. Net: Firebase is the better fit for *this product*, even though Vercel+Supabase would be the better fit for a more traditional web app.

### 15.17 Postgres / SQL backend — REJECTED for MVP

**Proposal:** Use a relational database (Postgres, MySQL) with explicit schema and migrations.

**Why rejected:** The data model is document-shaped, not relational. There are no complex joins. The query patterns (drafts by clinician + date, templates by clinician, tags by recording) are all simple lookups. Firestore handles them as well or better than SQL would. Vendor lock-in is a real concern but acceptable for a vertical SaaS — if we ever migrate to Postgres, the data is small enough to script-migrate in a few hours.

### 15.18 Long-term audio retention — REJECTED

**Proposal:** Keep audio recordings for 30-90 days as a "show me the source" affordance during review.

**Why rejected:** Once the transcript exists, audio has no clinical or product purpose. Keeping it expands the data footprint by orders of magnitude (audio is ~100x larger than transcript) and creates a more sensitive blob to protect. The transcript itself is the artifact. Aggressive deletion is the right call.

### 15.19 Mobile app shows finished notes — REVISED: now planned for v1.1

**Original proposal:** Let the dentist review and approve drafts on her phone in addition to or instead of the web app.

**Original rationale for rejection:** Phone screens are small and ill-suited to careful note review; phones are shared more than workstations and lost more often; keeping the phone surface focused on capture-only tightens the data footprint and the UX.

**Revised stance (2026-05-19):** The mobile PWA, when added in v1.1, will support full review and editing — the same capability set as the web app. Cross-device handoff (work flows in both directions between phone and workstation) is a core requirement; an asymmetric capability split creates more friction than data-surface tightening saves. See §14.1 and §14.17 for the broader decision.

### 15.20 Real-time human transcription review during capture — REJECTED

**Proposal:** Have a remote human (medical transcriptionist) listen in real-time and clean up the transcript as it's produced.

**Why rejected:** Adds operational complexity (a roster of human transcriptionists, scheduling, quality assurance), substantially increases cost, and creates a real PHI surface (a third-party human listening to clinical content). The whole point of AI scribing is that the human cost is eliminated. May revisit as a premium tier in v3 for complex cases.

### 15.21 Chaining multiple templates per encounter — REJECTED for MVP

**Proposal:** A new-patient exam might include the exam itself, a hygiene visit, and a radiograph review. Let the dentist dictate the whole encounter and have the LLM split content across multiple templates.

**Why rejected for MVP:** Multi-template chaining is a real product feature but raises hard questions about boundary detection (where does one template end and another begin in a continuous dictation?) and accuracy verification. Solving it well takes substantial design work. For MVP, the dentist captures each procedure as a separate recording — three taps instead of one. Real but small UX cost. We add chaining in v2 once we have data on how the basic case behaves.

### 15.22 Visual template editor — REJECTED for MVP

**Proposal:** A drag-and-drop visual UI for non-technical clinicians to build and edit templates.

**Why rejected for MVP:** Building a good visual editor for a system with this many degrees of freedom (field types, validation, format strings with conditionals, few-shot examples) is a significant interaction-design project. The pilot dentist's templates can be hand-built by the developer during onboarding and edited via a minimal form-based admin UI or direct Firestore edits in MVP. The visual editor is a clear v2 priority once we know what edits clinicians actually want to make and what edit patterns are common.

### 15.23 BAAs with Deepgram and Anthropic at MVP stage — REJECTED

**Proposal:** Execute BAAs with the STT and LLM providers anyway, as a defense-in-depth measure.

**Why rejected:** Unnecessary given the de-identified-by-design pipeline. Adds paperwork without changing the compliance posture meaningfully. We have the option to execute BAAs later if the product evolves to handle PHI (e.g., full-encounter recording in v3).

### 15.24 Recording full encounter (5-10+ minutes including conversation) — DEFERRED, NOT YET DECIDED

**Proposal:** Have the system record the entire dentist-patient interaction, not just the post-procedure dictation. Let the AI sort out clinical content from conversation.

**Status:** This was discussed and not fully resolved. The user shifted from 75-second dictation to 5-10 minute recordings during planning. The implications are significant:

- PHI almost certainly enters the recordings (patient names spoken naturally, personal context, etc.)
- The de-identified-by-design pipeline collapses
- BAAs become required
- The PHI scanner becomes load-bearing, not optional
- Costs increase 8-17x for STT

The current spec assumes a **middle path of approximately 3-5 minute recordings** focused on substantive dictation, with the dentist trained to keep PHI out of the audio. This balance is provisional and should be re-evaluated after pilot data. If the dentist's preferred workflow is to record the entire encounter, the architecture needs to shift to a "PHI in the pipeline" posture with BAAs and stricter controls.

**This is an open question for the pilot phase. See §16.**

---

## 16. Open Questions

Genuine unresolved questions that the pilot phase should answer:

### 16.1 Recording duration target

How long does the dentist actually want to record? The original assumption (75 seconds, focused dictation) keeps the system architecturally clean. The user expressed interest in longer recordings (5-10 minutes). The middle path (~3 minutes) is a compromise. Pilot data will clarify the right answer, but the decision affects PHI posture, costs, and UX.

### 16.2 Hygienist and assistant access

In small practices, hygienists also document. Do they get their own accounts? Their own templates? Their own pipelines, or shared with the dentist? MVP assumes single-clinician usage; multi-user practices are v2.

### 16.3 Apple Watch and Action Button integration

These are obvious value-adds for the capture surface. Native iOS is needed (PWAs can't drive these). Worth building when we move to native, but not before.

### 16.4 Patient tag retention policy

Right now the plan is to delete the tag on "Mark Filed." Some clinicians may want to retain a history of "what notes did I file for which patient" for their own reference. Possible solutions: keep tag locally on the phone indefinitely (encrypted), purge from backend on filed. Needs pilot input.

### 16.5 Filed-note archive

Should filed notes be retained anywhere? The dentist already has them in the PMS. But she may want to search "did I see a Filtek MOD patient last month?" Retained drafts could enable this. Cost is real (storage isn't free at scale, and retained drafts are a more attractive breach target). Default for MVP: delete on filed. Configurable in v2.

### 16.6 Practice administrator dashboard

Multi-dentist practices will want usage reports, quality metrics, and aggregate analytics. None of this is in MVP. What's the right level of analytics for v2 — basic usage counts, or full clinical metrics?

### 16.7 Pricing and packaging

What does the dentist pay? What's a free trial look like? Is there a per-seat model, a per-practice flat fee, a usage-based component? These are go-to-market questions, not engineering questions, but they shape the billing data model.

### 16.8 Onboarding and template creation flow

How does the developer (or eventually a customer-success function) collaborate with a new dentist to build her templates? This is a real operational process that needs design. For MVP, the developer hand-builds with one dentist. For v2, a guided onboarding wizard.

### 16.9 PHI scanner — when and how strict

If we add a PHI scanner in v2, what's the policy? Soft (auto-redact and continue) is workflow-friendly; strict (reject and re-record) is compliance-safer. Probably soft with a daily review summary, but worth pilot input.

### 16.10 Edit logging for audit

Should we keep a versioned history of clinician edits to drafts? Useful for showing the dentist "what the AI got wrong over time" as training data. Costs storage and adds complexity. Default off in MVP, opt-in in v2.

---

## 17. Roadmap

### 17.1 MVP — web-only (target: 100-150 engineering hours)

The minimum lovable product:

- **Web app** running in the workstation browser, with the full lifecycle: `+ New Note`, browser-microphone recording, augment / re-record flows, picklist editing, free-text qualifier editing, live preview of the assembled note, Copy Note, Mark Filed.
- **Cloud Functions pipeline:** Storage upload trigger → Deepgram STT (per-segment, with augment appending transcript) → Claude Sonnet 4.6 field-fill → Firestore note update.
- **Firebase Auth** with email + password; MFA (TOTP) wired and required before any external customer.
- **~10 hand-built templates** provided by the pilot dentist and authored by the developer during onboarding. Cementation and Periodic Exam / Adult Prophy are confirmed; the rest TBD.
- **Practice-level staff lists** (providers, assistants) for picklist sourcing.
- **Minimal admin UI** for template editing (form-based, not visual) and staff list editing.
- **Basic monitoring:** Sentry for errors, BetterStack for uptime, Anthropic and Deepgram usage alerts.
- **One pilot dentist** in active daily use.

Excluded from MVP:
- Mobile PWA (deferred to v1.1, see below)
- PHI scanner
- Visual template editor
- Multi-tenant (multiple practices on one backend instance)
- Multi-user within a practice beyond the pilot dentist (hygienists, assistants, admin role)
- Auto-detect template
- Native mobile apps
- Streaming STT
- Multi-template chaining
- Audit / edit-history viewer (audit rows are written; viewing them is v2)
- Analytics dashboard

### 17.2 v1.1 — mobile PWA (immediately after MVP pilot)

Adds the mobile capture surface. Symmetric capabilities with the web app: create / record / edit picklist / edit qualifiers / review / copy / mark filed. Cross-device handoff via Firestore (already the source of truth from MVP).

- **Mobile PWA** with browser-microphone recording, large mic button optimized for gloved hands, template selection optimized for one-tap operation, offline IndexedDB upload queue.
- **No schema changes** — the MVP data model already accommodates multi-device.
- **No new backend pipeline** — Cloud Functions and the LLM/STT integrations are unchanged.

### 17.3 v2 (post-pilot, after 2-3 months of MVP + v1.1 usage)

Driven by pilot feedback. Likely priorities:

- **PHI scanner** as safety net (Presidio + Haiku-based redundancy)
- **Visual template editor** so clinicians can self-serve
- **Multi-user within a practice** (hygienists, assistants, admin role)
- **Apple Watch capture** via native iOS app
- **Auto-detect template** from dictation
- **Practice administrator dashboard** with usage and quality metrics
- **Configurable retention** for filed notes
- **Onboarding wizard** for new practices to build templates
- **Picklist suggestions** from dictation alone (a stretch: dictate the whole encounter and have us suggest the PMS picklist answers in addition to producing the assembled note)

### 17.4 v3 (12+ months out)

Scale, premium tiers, and platform expansion:

- **Multi-template chaining** for full-encounter capture
- **Privacy-premium tier** with on-device or office-local STT for compliance-sensitive practices
- **Real-time human review** as a premium service for complex cases
- **Multi-practice management** for DSOs (dental service organizations)
- **Integration with major PMSes** where APIs allow it (Open Dental first, others as feasible)
- **Specialist templates** beyond general dentistry: orthodontics, oral surgery, periodontics
- **Multilingual support** for Spanish-language practices

---

## 18. Risks

The principal risks to project success:

**18.1 Clinical hallucination.** If the LLM fabricates clinical details that the dentist doesn't catch, the wrong information enters the chart. Mitigation: tool-use schema enforcement, "do not invent" prompt instructions, confidence marking that draws the eye to anything inferred, mandatory clinician review before any note leaves the web app. We should also build a pilot benchmark of 30+ real recordings with hand-graded ideal outputs and measure regression on every prompt/model change.

**18.2 STT errors on dental jargon.** If Deepgram mistranscribes "MOD" as "mode" or "Filtek" as "fill tech," the LLM has nothing good to work with. Mitigation: custom Keyterm Prompting list built with the pilot dentist, ongoing keyword tuning as we observe errors.

**18.3 PHI leakage despite design.** The dentist accidentally says a patient's name. The tag gets pasted into a logged URL. Some unforeseen path exposes identity. Mitigation: PHI scanner in v2, audit logging of access, principle of least privilege everywhere, defensive coding ("never pass tag to LLM" enforced by code structure not just convention), regular red-team review.

**18.4 Adoption resistance.** Dentist tries it for a week, finds the review-and-correct step more effort than just writing the note herself, stops using it. Mitigation: invest heavily in prompt quality so the LLM is right 90%+ of the time on real recordings, make the review panel as fast as possible (keyboard navigation, default-accept patterns), benchmark with the pilot dentist before launch.

**18.5 Provider availability or pricing changes.** Deepgram, Anthropic, or Firebase changes pricing or API terms unfavorably. Mitigation: thin abstraction layers, periodic benchmarking of alternative providers, financial planning that doesn't assume current pricing forever.

**18.6 Regulatory shift.** State dental boards or HHS issues new guidance on AI scribes that requires features we don't have. Mitigation: stay engaged with the regulatory conversation, design for de-identification (which is conservative), maintain optionality to add BAAs and audit features quickly.

**18.7 Competitive entry.** A well-funded competitor enters the same niche with better marketing. Mitigation: ship fast, build a moat of template quality and clinician customization, focus on the small-practice segment that big competitors deprioritize.

---

## 19. Glossary

**BAA (Business Associate Agreement):** Contract under HIPAA that obligates a vendor handling PHI to specific privacy and security practices. Required when a covered entity (e.g., dental practice) shares PHI with a vendor.

**Deepgram Nova-3 Medical:** Speech-to-text model from Deepgram, optimized for clinical and medical audio.

**Firestore:** NoSQL document database in Firebase. Used as the primary backend store.

**HIPAA Safe Harbor:** De-identification standard under HIPAA. Data with all 18 specified identifiers removed is considered de-identified and not PHI.

**Keyterm Prompting:** Deepgram feature that boosts recognition probability for specified terms. Used here for dental vocabulary.

**Operatory:** Dental treatment room. A typical practice has 2-6 operatories.

**PHI (Protected Health Information):** Health information that identifies an individual, as defined by HIPAA.

**PMS (Practice Management System):** Software dental practices use to manage patient charts, scheduling, billing. Examples: Dentrix, Dentrix Ascend, Open Dental, Eaglesoft, CareStack, Curve Dental.

**PWA (Progressive Web App):** Web app that uses modern browser features (offline, install-to-home-screen, push notifications) to feel native.

**SOAP note:** Subjective, Objective, Assessment, Plan — the standard structure for clinical notes.

**STT (Speech-to-Text):** Transcription. Synonymous with ASR (Automatic Speech Recognition).

**Tool-use / structured outputs:** LLM feature that constrains the model's output to a specified JSON schema, eliminating parse errors and hallucinated fields.

**UUID v4:** 128-bit random identifier. Used to identify recordings without revealing any information about them.

---

## 20. Document Status and Next Steps

This specification represents the state of design as of 2026-05-19, after a multi-session planning conversation. It is intended to be a complete handover document for a developer (human or AI) picking up the project.

**Immediate next steps for the implementer:**

1. Read this spec and the companion `CLAUDE.md` end to end.
2. Set up Firebase project (separate dev and prod).
3. Sign up for Deepgram, generate API key, run a curl test to confirm.
4. Sign up for Anthropic, generate API key.
5. Build the data model in Firestore (collections, security rules).
6. Build the mobile PWA capture surface.
7. Build the `processRecording` Cloud Function with provider abstraction.
8. Build the web compose surface, starting with the drafts list and review panel.
9. Sit with the pilot dentist for an afternoon: build 3-5 templates, capture ~30 real recordings to use as the benchmark suite, refine keyword lists.
10. Pilot in real clinical use for 2-4 weeks before iterating.

The companion `CLAUDE.md` document captures coding conventions, invariants, gotchas, and project structure that any contributor (human or AI) should read before writing code.