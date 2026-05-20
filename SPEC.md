# Dental Scribe — Product & Technical Specification

**Status:** Pre-MVP design specification
**Version:** 0.1 (initial handover document)
**Last updated:** 2026-05-19
**Project name:** "Dental Scribe" is a working title. Final naming TBD.

---

## 1. Executive Summary

Dental Scribe is an AI-powered clinical documentation tool designed for small dental practices. It replaces the manual chore of writing SOAP-format clinical notes after every patient encounter with a two-part workflow: the dentist captures a short voice recording on her phone immediately after a procedure, and later — between patients or at end of session — reviews a pre-filled, structured note on a web app and copies it into her Practice Management System (PMS, e.g. Dentrix Ascend).

The system is deliberately architected to keep Protected Health Information (PHI) out of the AI pipeline. The dentist dictates clinical content only ("composite on tooth 14, MO surface, one carpule lidocaine with epi…"); patient identity is captured separately as a short text tag that is never sent to the speech-to-text or language model providers. This dramatically simplifies the HIPAA posture, reduces ongoing compliance burden, and unlocks the use of best-in-class general-purpose AI providers without requiring Business Associate Agreements at MVP stage.

The target operating cost is approximately **$20-36 per dentist per month** at typical clinical volume (15 patients per day, 5-10 minute recordings), making the product economically viable at any price point above $30/month per provider. The MVP is achievable in roughly **100-150 hours of focused engineering work** by a single competent developer.

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

### 4.1 The capture/compose split

The product is split into two surfaces that share a backend:

**Capture (mobile PWA):** runs on the clinician's phone. Optimized for one-tap operation, gloved hands, noisy operatory environment. Captures audio and a short text tag identifying the patient and procedure. Uploads to the backend. Does not display finished notes.

**Compose (web app):** runs on the workstation. Optimized for review and editing. Displays a list of pending drafts, the structured fields the AI filled in, the generated narrative, and the formatted final note. Provides a one-click "copy" button that places the final note text on the system clipboard, ready to paste into Dentrix Ascend (or any other PMS).

The split is deliberate (see §15 for the decision rationale). Briefly: capture and compose have different ergonomic, hardware, and timing requirements that are awkward to satisfy in a single app.

### 4.2 End-to-end user flow

The canonical flow, from a composite restoration on tooth 14:

1. **Pre-encounter setup (one-time).** Dr. Patel has configured ~15 templates covering the procedures she does regularly. Each template is a YAML file (or admin UI) listing field names, types, validation, and a format string for the final note text. This setup happens once during onboarding and is updated occasionally.

2. **During the encounter.** Dr. Patel completes the composite procedure on the patient. The patient is still in the chair or just stepping out.

3. **Capture.** Dr. Patel takes her phone from her scrubs pocket. The PWA is already open (or launches from a lock-screen shortcut). She taps the template chip "Composite," optionally types a short tag ("Sarah J — #14"), taps the mic button, and dictates for ~60-90 seconds:
   > "Composite on tooth 14, MO surface. Gave one carpule of lidocaine 2% with epi. Rubber dam isolation. Removed caries, bonded with Scotchbond Universal, placed Filtek in 2mm increments, cured 20 seconds each. Adjusted occlusion with articulating paper. Patient tolerated well."
   She taps the mic button again to stop. The recording is queued. She moves to the next patient.

4. **Background processing.** The phone uploads the audio blob to Cloud Storage. A Cloud Function triggers on upload, sends the audio to Deepgram Nova-3 Medical for transcription with custom dental keyword boosting, receives the transcript, then sends transcript + template schema + few-shot examples to Claude Sonnet 4 via the Anthropic API. Claude returns structured JSON with each template field filled in plus a generated narrative. The result is written to Firestore as a "ready" draft. Total processing time: typically 5-15 seconds.

5. **Review (between patients or at lunch).** Dr. Patel walks to a workstation, opens the web app. She sees a list of pending drafts from the day. She clicks the composite draft. The review panel shows each field — tooth number, surfaces, anesthesia, materials, etc. — with confidence indicators (high / inferred / missing). The shade field shows "A2 (inferred — not stated)" in yellow. She corrects it to A1, glances over the narrative, clicks "Copy Note."

6. **Paste into PMS.** She switches to her Dentrix Ascend browser tab (already open to the patient's chart), clicks in the Clinical Notes field, presses Ctrl+V. The fully-formatted note appears in the field. She saves the chart entry as she normally would.

7. **Mark filed.** She clicks "Mark Filed" in the web app. The draft, transcript, and any remaining audio data are deleted from the backend.

### 4.3 Key product properties

A few non-negotiable properties the design preserves:

The dentist always reviews and approves notes before they enter the PMS. The system never writes directly into the chart. This keeps clinical responsibility unambiguously human and avoids the regulatory complexity of being a "device" that produces clinical records autonomously.

PHI is kept out of the AI pipeline. The dentist dictates clinical content only. Patient identifiers live in a separately-classified tag field that never reaches the STT or LLM providers. This is enforced by the data model and backend code, not by user discipline alone (although user discipline is the first line of defense).

The system is PMS-agnostic. It produces final note text and places it on the clipboard. Whatever the dentist does with that text — paste into Dentrix, paste into Open Dental, paste into a Google Doc — is outside the product's concern.

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

### 6.1 Mobile capture (PWA)

The mobile capture surface must:

Allow the clinician to record an audio clip from the device microphone using the browser's MediaRecorder API. Audio is encoded as WebM/Opus on Chrome/Edge or MP4/AAC on Safari, at 16 kHz mono. Browser-native echo cancellation, noise suppression, and automatic gain control are enabled.

Allow the clinician to optionally tag the recording with a short free-text label (e.g. "Sarah J — #14"). The tag is stored locally on the device by default and synchronized to the web app on the same authenticated session. The tag is never transmitted to STT or LLM providers.

Allow the clinician to optionally choose a template before recording, presented as a row of recent-template chips ("Composite," "Hygiene Recall," "Crown Prep") plus a search affordance for the full list. If no template is chosen, the backend defaults to a "general" template or attempts auto-detection (deferred to v2).

Queue recordings locally (in IndexedDB) if upload fails or the device is offline. Retry upload when connectivity returns. Indicate queue status visibly.

Show a status indicator for each recording: queued, uploading, transcribing, drafting, ready. The phone does not display draft contents — reviewing and editing happens on the web app.

Authenticate the clinician via Firebase Authentication (email + password to start; magic link or MFA before any external customer).

### 6.2 Web compose

The web compose surface must:

Authenticate the clinician (same Firebase Auth backend).

Display a list of pending and recently-filed drafts, organized by date, with patient tag (joined from local sync) and template name visible. Drafts in "ready" state are clearly distinguished from drafts still processing.

Open a review panel for each draft showing all extracted fields with confidence indicators (high / inferred / missing), the AI-generated narrative paragraph, and the assembled final note as it will appear when pasted. The transcript should be available alongside (collapsible) so the clinician can verify any field against the source.

Allow inline editing of any field. Edits to fields automatically update the assembled final note. Edits to the narrative are kept as the clinician's authored version.

Provide a "Copy Note" button that places the final formatted note text on the system clipboard.

Provide a "Mark Filed" action that triggers deletion of the audio (if not already deleted), transcript, and draft from the backend. (Configurable retention is a v2 feature — see §17.)

Provide a template editor (admin role only) allowing creation and editing of templates: field definitions, types, validation rules, format strings, and few-shot examples.

### 6.3 Backend pipeline

The backend must:

Accept authenticated audio uploads from the mobile app, store them temporarily in Cloud Storage with a UUID-based path.

Trigger a Cloud Function on each new upload that orchestrates the processing pipeline: speech-to-text via Deepgram Nova-3 Medical, structured extraction via Claude Sonnet 4, persistence of the resulting draft to Firestore.

Delete audio blobs immediately after successful transcription (with a 24-hour lifecycle rule as a safety net for failed deletions).

Apply per-template prompt engineering: each template has its own system prompt, JSON schema for tool-use, and few-shot examples. The backend selects the correct prompt based on the template chosen at capture time (or the auto-detection result, in v2).

Enforce strict JSON output from the LLM using Anthropic's tool-use feature. Schema mismatches result in a retry or a flagged draft, not a malformed entry.

Log all LLM calls and STT calls (without PHI) for cost monitoring, accuracy benchmarking, and debugging.

Surface processing errors to the clinician via draft state ("error — see details"), with retry affordance.

### 6.4 Templates

Templates are first-class entities. The template system must support:

**Field types:** short text, long text (narrative), single-choice (with defined options), multi-choice (with defined options), number, boolean, date, derived/auto-filled (e.g. today's date).

**Validation:** required vs. optional, allowed value ranges for numbers, allowed value sets for choices.

**Format strings:** each template includes a format string with `{field_name}` placeholders that produces the final note text by substitution. Format strings can include conditional fragments (e.g. show occlusal adjustment line only if occlusal_adjusted is true).

**Few-shot examples:** each template carries 2-3 example (transcript, expected JSON) pairs used in the LLM prompt to improve accuracy.

**Versioning:** edits to a template create a new version. Drafts retain a reference to the template version used to create them, for audit and reproducibility. The current version is what's used for new captures.

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

All documents are scoped to a clinician unless otherwise noted. Security rules enforce that a clinician can only read/write documents belonging to her.

**`/clinicians/{clinician_id}`**
The clinician's profile and settings.
```
{
  email: string,
  display_name: string,
  role: "clinician" | "admin",
  practice_id: string,
  default_template: string | null,
  created_at: timestamp,
  // No PHI in this document.
}
```

**`/clinicians/{clinician_id}/recordings/{recording_id}`**
The recording metadata. Audio is in Cloud Storage; transcript is here after processing.
```
{
  recording_id: string (uuid v4),
  template_id: string,
  template_version: string,
  date_iso: string (day-level: "2026-05-19"),  // No precise time on backend.
  status: "uploading" | "transcribed" | "drafting" | "ready" | "filed" | "error",
  transcript: string | null,
  error: string | null,
  created_at: timestamp,
  // No PHI in this document. No name, no precise time.
}
```

**`/clinicians/{clinician_id}/drafts/{recording_id}`**
The AI-filled draft. Linked to its recording by shared UUID.
```
{
  recording_id: string,
  template_id: string,
  template_version: string,
  fields: {
    [field_name]: {
      value: any,
      confidence: "high" | "inferred" | "missing",
      edited_by_user: boolean
    }
  },
  narrative: string,
  final_note_text: string,  // The assembled output.
  status: "ready" | "edited" | "filed",
  created_at: timestamp,
  filed_at: timestamp | null,
  // No PHI in this document.
}
```

**`/clinicians/{clinician_id}/patient_tags/{recording_id}`**
The PHI tag, isolated in its own subcollection with stricter security rules. Stored encrypted-at-rest by Firestore. Deleted on file-and-mark-filed.
```
{
  recording_id: string,
  tag: string,                  // "Sarah J — #14 — 9:15"
  precise_time: timestamp,      // Real timestamp; never replicated elsewhere.
  created_at: timestamp,
  // THIS DOCUMENT CONTAINS PHI. Treat with special care.
  // Never logged. Never sent to LLM. Never sent to STT.
}
```

**`/clinicians/{clinician_id}/templates/{template_id}`** (or `/practices/{practice_id}/templates/{template_id}` for shared templates)
A template definition.
```
{
  template_id: string,
  name: string,                 // "Composite Restoration"
  version: number,
  fields: [
    {
      name: string,
      type: "short_text" | "long_text" | "single_choice" | "multi_choice" | "number" | "boolean" | "date" | "derived",
      required: boolean,
      options: string[] | null,  // For choice types
      min: number | null,        // For number type
      max: number | null,
      default: any | null
    }
  ],
  format_string: string,         // "Composite restoration on tooth {tooth_number}, surfaces {surfaces}..."
  few_shot_examples: [
    { transcript: string, expected_output: object }
  ],
  keywords: string[],            // For Deepgram keyword boost: ["Filtek:2", "Scotchbond:2", ...]
  system_prompt_override: string | null,
  created_at: timestamp,
  updated_at: timestamp,
}
```

### 9.2 Cloud Storage layout

```
gs://<project>-recordings/
  recordings/
    {recording_id}.webm   ← deleted within seconds of successful STT; 24h lifecycle rule as safety net
```

That's the entire Storage footprint. No long-lived audio.

### 9.3 PHI classification

| Entity | Classification | Where it lives | Sent to STT/LLM? |
|---|---|---|---|
| Audio recording | De-identified clinical | Cloud Storage (ephemeral) | Sent to STT only |
| Transcript | De-identified clinical | Firestore `/recordings/{uuid}` | Sent to LLM |
| Filled draft | De-identified clinical | Firestore `/drafts/{uuid}` | n/a (output) |
| Patient tag | PHI | Firestore `/patient_tags/{uuid}` | **Never** |
| Precise timestamp | PHI-adjacent (identifying with schedule) | Firestore `/patient_tags/{uuid}` only | **Never** |
| Clinician profile | Workforce data | Firestore `/clinicians/{uuid}` | n/a |
| Template | Configuration | Firestore `/templates/{uuid}` | Sent to LLM as part of prompt |

The PHI surface area in this system is exactly one subcollection (`patient_tags`). That's the entire footprint. This is the single most important architectural property of the design.

---

## 10. Key Components

### 10.1 Mobile capture PWA

**Technology:** Progressive Web App, built with React or Svelte (preference for whichever the developer is fastest in). Vite for build tooling. Hosted on Firebase Hosting.

**Key APIs used:**
- `MediaRecorder` for audio capture with `getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 16000 } })`.
- `IndexedDB` (via a wrapper like `idb`) for local recording queue.
- Firebase JS SDK: Auth, Firestore (offline-enabled), Storage.

**Screens (MVP):**
1. Sign-in screen.
2. Main capture screen: tag field, template chip row, large mic button, status row showing pending uploads.
3. Pending queue detail (for retrying failed uploads).
4. Settings (sign out, manage templates link to web app).

The mobile PWA deliberately does not show finished notes. This keeps the surface focused and avoids accidentally caching PHI-adjacent content on shared devices.

### 10.2 Web compose app

**Technology:** React (Next.js) or SvelteKit. Hosted on Firebase Hosting. Same Firebase Auth and Firestore SDK as mobile.

**Screens (MVP):**
1. Sign-in screen.
2. Drafts list: organized by date, showing tag, template name, status, age. Filterable.
3. Review panel: opens for a single draft. Field-by-field view with confidence indicators, inline editing, transcript side panel, narrative editor, final note preview, copy button, mark-filed button.
4. Template editor (admin only): list of templates, create/edit form with field builder, format string editor, few-shot example editor.
5. Settings: user management (admin), template export/import, sign out.

### 10.3 Cloud Function: processRecording

**Trigger:** `onObjectFinalized` on Cloud Storage path `recordings/*`.

**Runtime:** Node.js 20 on Cloud Functions 2nd gen. Memory: 512 MB. Timeout: 120 seconds. Min instances: 0 (cold starts are tolerable for this async pipeline; bump to 1 if startup latency becomes a complaint).

**Steps:**
1. Parse `recording_id` and `clinician_id` from object metadata.
2. Read template document from Firestore.
3. Download audio blob from Cloud Storage into memory.
4. Call Deepgram `transcribeFile` with `model: "nova-3-medical"`, `smart_format: true`, `punctuate: true`, `keywords: [...template.keywords]`.
5. Write transcript to `/clinicians/{cid}/recordings/{rid}` with `status: "transcribed"`.
6. Delete audio blob from Storage.
7. Build LLM prompt: system prompt with schema, user message with transcript and template instructions, few-shot examples in conversation history.
8. Call Anthropic API with Claude Sonnet 4, tool-use enabled with the template's field schema as the tool input schema.
9. Parse the tool call result. Validate against schema.
10. Render `final_note_text` by substituting fields into `format_string`.
11. Write draft to `/clinicians/{cid}/drafts/{rid}` with `status: "ready"`.

Errors at any step write `status: "error"` with a human-readable error message to the recording doc, surfaced in the UI for clinician-initiated retry.

### 10.4 STT integration (Deepgram)

**Provider:** Deepgram Nova-3 Medical, batch mode.

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

**Provider:** Anthropic API, Claude Sonnet 4 as workhorse, Claude Opus 4.7 as escalation for complex templates (configurable per-template; not used in MVP).

**API key storage:** Firebase Secret Manager (`ANTHROPIC_API_KEY`).

**SDK:** `@anthropic-ai/sdk` (Node).

**Prompt structure (per template):**
- System prompt: role definition, schema definition, confidence-marking rules, "do not invent" guardrails.
- Tool definition: JSON schema matching the template's field list. This forces structured output.
- Few-shot examples: 2-3 `(transcript, tool_use_input)` pairs in conversation history.
- User message: the actual transcript to process.

**Prompt caching:** enable Anthropic's prompt caching on the system prompt and few-shot examples. These are stable per template and benefit hugely from caching. Reduces LLM cost by ~30%.

**Output handling:** parse the `tool_use` block from the response. Validate against schema. On schema violation, retry once with a corrective prompt; if still failing, write the recording as an error.

### 10.6 Template system

Templates live in Firestore as documents. The MVP ships with 3-5 pre-built templates that the developer creates by hand in collaboration with Dr. Patel:

1. Composite Restoration
2. Hygiene Recall / Cleaning
3. Crown Preparation
4. Comprehensive New Patient Exam
5. Extraction (Simple)

Each template needs:
- Field definitions (probably 8-15 fields per template)
- Format string for the final note
- 2-3 few-shot transcript examples with expected outputs (recorded by Dr. Patel during onboarding)
- Custom keyword list for STT (built from Dr. Patel's vocabulary)

The template editor in the web app is functional but minimal in MVP. A richer visual editor is v2.

---

## 11. Template System Deep Dive

The template system is the heart of the product. A worked example:

### 11.1 Example template: Composite Restoration

**Fields:**
- `tooth_number` (number, required, 1-32)
- `surfaces` (multi_choice, required, options: ["M", "O", "D", "B", "L", "I"])
- `anesthesia_type` (single_choice, options: ["Lidocaine 2% with epi", "Articaine 4% with epi", "Mepivacaine 3%", "None"])
- `anesthesia_carpules` (number, options: 0, 0.5, 1, 1.5, 2)
- `isolation` (single_choice, options: ["Rubber dam", "Cotton rolls", "Isolite", "None"])
- `bonding_agent` (short_text)
- `composite_material` (short_text)
- `shade` (short_text, optional)
- `cure_time_seconds` (number, default: 20)
- `occlusal_adjusted` (boolean)
- `patient_tolerance` (single_choice, options: ["Well", "Moderate", "Poor"])
- `narrative` (long_text, AI-generated)

**Format string:**
```
Composite restoration, tooth #{tooth_number}, surfaces {surfaces}.
Anesthesia: {anesthesia_carpules} carpule(s) {anesthesia_type}.
Isolation: {isolation}.
Etch and bond with {bonding_agent}. Restored with {composite_material}{shade?, shade {shade}} in incremental fashion, cured {cure_time_seconds} seconds per layer.
{occlusal_adjusted?Occlusion adjusted with articulating paper.}
Patient tolerated procedure {patient_tolerance|lower}.

{narrative}
```

(Syntax sketch — actual implementation can use Handlebars, mustache, or a small custom interpolator.)

**Keyword list:** `["Filtek:2", "Scotchbond:2", "MOD:2", "MO:1.5", "DO:1.5", "BL:1.5", "lidocaine:1.5", "articaine:1.5", "epi:1.5", "rubber dam:1.5", "Isolite:1.5", "distolingual:1.5", "mesiobuccal:1.5", "occlusion:1.5", "articulating:1.5"]`

**Few-shot example (one of three):**

Transcript: *"Composite on 14, MO. One carpule lido with epi. Rubber dam. Scotchbond Universal, Filtek shade A2, two-mil increments, 20 seconds each. Articulating paper to adjust. Tolerated well."*

Expected output:
```json
{
  "tooth_number": 14,
  "surfaces": ["M", "O"],
  "anesthesia_type": "Lidocaine 2% with epi",
  "anesthesia_carpules": 1,
  "isolation": "Rubber dam",
  "bonding_agent": "Scotchbond Universal",
  "composite_material": "Filtek",
  "shade": "A2",
  "cure_time_seconds": 20,
  "occlusal_adjusted": true,
  "patient_tolerance": "Well",
  "narrative": "Performed composite restoration on tooth #14, mesial-occlusal surfaces. Local anesthesia administered (one carpule of lidocaine 2% with epinephrine). Operative field isolated with rubber dam. Caries removed; tooth prepared and etched. Scotchbond Universal applied per manufacturer instructions. Filtek composite, shade A2, placed in 2mm increments with 20-second light cure per layer. Occlusion verified and adjusted with articulating paper. Patient tolerated the procedure well."
}
```

### 11.2 The narrative field

The narrative is a hybrid generation: the LLM is given the extracted fields as ground truth and instructed to write a clinical paragraph consistent with those facts. The prompt says: *"Your narrative must be consistent with the extracted fields. Do not introduce clinical details not present in the transcript or fields."* This prevents the model from inventing materials, shades, or findings.

The clinician can edit the narrative directly in the review panel. Edits are preserved.

### 11.3 Confidence marking

Each extracted field comes back with a confidence value:
- **high:** the field was explicitly stated in the transcript.
- **inferred:** the field was reasonably inferred from context but not stated outright (e.g., shade defaulting to A2 when not mentioned, based on practice patterns).
- **missing:** the field was not mentioned at all and is left empty.

The UI color-codes these green / yellow / red, with icons alongside for non-color-only accessibility. The clinician's eye is drawn to anything not high-confidence.

### 11.4 Format string semantics

The format string supports:
- Plain substitution: `{field_name}` is replaced by the field value.
- Conditional fragments: `{field?...content...}` only renders if field is truthy.
- Filters: `{field|upper}`, `{field|lower}`, `{field|join:, }` for arrays.
- Default values: `{field|default:N/A}`.

If a required field is missing, the format string renders a `[MISSING: field_name]` placeholder rather than blocking the note. The clinician can fill it in manually before copying.

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

### 14.1 Two surfaces: mobile capture + web compose

**Decision:** Split the product into a mobile PWA for capture and a web app for compose. Do not build a single app that does both.

**Rationale:** Capture and compose have fundamentally different ergonomic constraints. Capture happens chairside, possibly with gloved hands, in a noisy environment, with the clinician about to move to another patient — it demands one-tap operation and zero ceremony. Compose happens at a workstation between patients or end-of-day, with time to review carefully and edit — it demands a rich UI with field-level editing and a transcript reference. A single app would compromise both. The split also lets us optimize each surface for the device it runs on (phone vs. desktop) and the bandwidth/latency profile it has (mobile/cellular vs. office wifi).

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

### 14.9 Claude Sonnet 4 for template-fill

**Decision:** Use Claude Sonnet 4 via the Anthropic API as the workhorse LLM for template extraction and narrative generation. Use tool-use for structured output. Use prompt caching.

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

**Decision:** Ship MVP with 3-5 pre-built templates created in collaboration with the pilot dentist. Defer the visual template editor.

**Rationale:** The template editor is a real interaction-design challenge — field types, validation, format strings, few-shot examples are not trivial to expose in a UI. Building it well takes time we'd rather spend on the core capture-and-review loop. The pilot dentist's templates can be hand-crafted by the developer during onboarding (an afternoon's work per template) and edited via a minimal admin UI or direct Firestore console for MVP. The visual editor is a v2 priority once we know what edits clinicians actually need to make.

### 14.14 Explicit template selection

**Decision:** The clinician selects the template at capture time via a chip tap or quick-search. Do not auto-detect the template from the dictation.

**Rationale:** Auto-detection is harder and less reliable than explicit selection. A wrong template selection is silent — the dentist won't realize the AI is filling a "hygiene recall" template from a composite dictation until she opens the review panel. Explicit selection takes one extra tap but eliminates this class of error. Auto-detect is an attractive v2 feature once we have data to train on.

### 14.15 Defer the PHI scanner to v2

**Decision:** No PHI detector in MVP. Rely on user discipline (don't say patient names) and UI design (separate tag field) as primary safeguards.

**Rationale:** The PHI scanner is a third line of defense, not a first. The first line is the dentist's habit; the second is the data model that keeps tag and audio separate. A scanner adds complexity (Presidio dependency or extra LLM call), occasional false positives that annoy the clinician, and policy decisions about redact-vs-reject-vs-flag. In MVP we ship without it and observe how often accidental name mentions actually happen. If the rate is non-trivial, we add Presidio plus a daily report in v2.

### 14.16 Delete audio after STT

**Decision:** Audio blobs are deleted from Cloud Storage immediately after successful transcription, within seconds. A 24-hour lifecycle rule on the bucket serves as a safety net.

**Rationale:** Audio has no further use once the transcript exists. It is the largest blob in the system (~225 KB per recording at 75 seconds, ~2 MB at 10 minutes), the most sensitive even when de-identified, and the most embarrassing if leaked. Aggressive deletion shrinks the data footprint, simplifies the breach posture, and reinforces the de-identified-by-design property.

### 14.17 Mobile shows status, not content

**Decision:** The mobile capture surface displays pending recording status but not draft contents. Review and editing happens only on the web app.

**Rationale:** Phones are shared more than workstations, are lost more, and the small screen is poorly suited to careful note review anyway. Keeping draft content off the phone tightens the data surface. The phone's job is "capture" — clean separation from "compose."

### 14.18 Tag is local-first, optionally synced

**Decision:** The patient tag is stored locally on the capture device. It is synced to the web app via an authenticated channel, and stored in an isolated Firestore subcollection (`patient_tags`) with stricter security rules.

**Rationale:** Keeping the PHI footprint as small and as access-controlled as possible. The tag is the only piece of PHI in the system, so we corral it. Pure device-local with no backend would be even tighter, but cross-device sync ergonomics suffer. The isolated subcollection is a reasonable compromise — the rest of the backend remains PHI-free.

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

### 15.19 Mobile app shows finished notes — REJECTED for MVP

**Proposal:** Let the dentist review and approve drafts on her phone in addition to or instead of the web app.

**Why rejected:** Phone screens are small and ill-suited to careful note review. Phones are shared more than workstations and lost more often. Keeping the phone surface focused on capture-only tightens the data footprint and the UX. We may add a "preview" of the finished note for quick verification in v2, but full review-and-edit stays on web.

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

### 17.1 MVP (target: 100-150 engineering hours)

The minimum lovable product:

- **Mobile PWA capture** with audio recording, tag field, template chip selection, offline queue, status indicators
- **Web compose app** with drafts list, review panel, field-level editing, narrative editing, copy-to-clipboard, mark-filed
- **Cloud Functions pipeline:** upload trigger → Deepgram STT → Claude Sonnet 4 template-fill → Firestore draft
- **Firebase Auth** with email + password, MFA available
- **3-5 hand-built templates:** composite, hygiene recall, crown prep, comprehensive exam, simple extraction
- **Minimal admin UI** for template editing (form-based, not visual)
- **Basic monitoring:** Sentry for errors, BetterStack for uptime, Anthropic and Deepgram usage alerts
- **One pilot dentist** in active daily use

Excluded from MVP:
- PHI scanner
- Visual template editor
- Multi-tenant (multiple practices on one backend instance)
- Multi-user within a practice (hygienists, assistants)
- Auto-detect template
- Native mobile apps
- Apple Watch
- Streaming STT
- Multi-template chaining
- Audit / edit history
- Analytics dashboard

### 17.2 v2 (post-pilot, after 2-3 months of MVP usage)

Driven by pilot feedback. Likely priorities:

- **PHI scanner** as safety net (Presidio + Haiku-based redundancy)
- **Visual template editor** so clinicians can self-serve
- **Multi-user within a practice** (hygienists, assistants, admin role)
- **Apple Watch capture** via native iOS app
- **Auto-detect template** from dictation
- **Practice administrator dashboard** with usage and quality metrics
- **Configurable retention** for filed drafts
- **Onboarding wizard** for new practices to build templates

### 17.3 v3 (12+ months out)

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