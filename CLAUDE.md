# CLAUDE.md — Working Context for Dental Scribe

This document is the working-context file for anyone — human developer or AI assistant — picking up the Dental Scribe project. It complements `SPEC.md` (the product and technical specification) with the operational details you need to write code in this codebase.

**Read this entire document before writing any code.** Several of the rules below are load-bearing for the privacy posture of the system, and violating them would break the entire compliance design.

> **Status (2026-06-03):** Web MVP is functional (auth, notes CRUD, recording, Deepgram STT, Claude extraction, format-string rendering, deterministic validation with copy warnings, editable preview textarea, deploy to Firebase Hosting). Templates seeded to Firestore: Cementation, Restorations (formerly Crown Prep), General, Prophylaxis, New Patient Exam, SOAP Note. iOS native app has auth, notes CRUD, recording, field editing with review-level chips and validation. **Remaining for pilot:** few-shot examples from real dictations, deploy latest functions + hosting, TestFlight build.

---

## 1. One-Paragraph Project Summary

Dental Scribe is a clinical documentation tool for small dental practices. The dentist creates a note in the web app or iOS app, optionally taps through picklist fields for the procedure template AND/OR dictates the per-encounter specifics, reviews the AI-assembled structured note, and copies it as one block into her PMS — bypassing the PMS's own picklist wizard. The output is structured throughout (every line is `Label: value(s)` in her exact note style), not a free-text paragraph. The pipeline is: audio → Deepgram Nova-3 Medical → Claude Sonnet 4.6 (with tool-use, given the template schema and any picklist values the dentist already set) → merged field values → format-string render → clipboard → PMS. The architecture is deliberately designed to keep Protected Health Information out of the AI pipeline; the dentist dictates clinical content only, and patient identifiers live in a separate "tag" field that is never sent to any third-party API. The stack is Firebase end to end (Firestore, Cloud Functions, Cloud Storage, Auth, Hosting). **Two clients: web (React/Vite) + iOS (SwiftUI)**; both are symmetric first-class peers sharing the same backend.

For the full spec including user personas, requirements, data model, cost analysis, decisions made, decisions rejected, and roadmap, read `SPEC.md`.

---

## 2. Critical Invariants — Read These First

These are non-negotiable rules. Violating any of them breaks the privacy or compliance design of the system. If you find existing code that violates one, treat it as a bug to fix, not a precedent to follow.

### 2.1 The patient tag is never intentionally sent to third-party services

The patient tag (`tag`, `patient_tags/{recording_id}.tag`) is the **only** piece of structured PHI in the system. We do not intentionally send it to:

- The STT provider (Deepgram)
- The LLM provider (Anthropic / OpenAI / any other)
- Any third-party API
- Any log
- Any analytics platform
- Any error reporting service

When constructing prompts for Claude, never reference the `patient_tags` subcollection. The LLM call should receive: the transcript, the template schema, the few-shot examples, and the system prompt. That's it. If you find yourself reaching for the tag, stop and reconsider.

**Important caveat on audio:** While we never intentionally transmit patient identifiers, the audio recording itself may contain incidental patient name mentions in the dentist's dictation. This audio is sent to Deepgram for transcription. We mitigate this risk through: (1) HIPAA-appropriate BAAs with all third-party vendors, (2) immediate deletion of audio after STT completes, (3) a 24-hour lifecycle rule on the Storage bucket as a safety net, and (4) instructing clinicians to dictate clinical content only, not patient identifiers. The system is designed to minimize PHI exposure, not to guarantee zero incidental exposure — which is not achievable with voice-based input.

### 2.2 The patient tag never enters the STT request

Same rule, applied to the STT side. The audio file is sent to Deepgram. The keyword list from the template is sent to Deepgram. The tag is not sent. Audio may contain incidental patient name mentions — see §2.1 caveat.

### 2.3 UUIDs are random v4. Never derived from PHI.

`recording_id` is generated as a v4 random UUID on the capture device. Do not use `hash(name)`, `hash(name + time)`, `hash(anything)`. Under HIPAA Safe Harbor, identifiers derived from PHI are themselves PHI. Random UUIDs are not.

```typescript
// CORRECT
import { v4 as uuidv4 } from 'uuid';
const recordingId = uuidv4();

// WRONG. Do not do this.
const recordingId = sha256(patientName + appointmentTime);
```

### 2.4 Date stored on the backend is day-level only

The `recordings/{uuid}.date_iso` field is `"2026-05-19"`, never `"2026-05-19T09:15:34"`. Precise timestamps live alongside the patient tag in the `patient_tags` subcollection, never replicated elsewhere. Precise time + clinician identity + schedule lookup = identifying.

### 2.5 Audio is deleted after STT

The Cloud Function deletes the audio blob from Cloud Storage immediately after a successful transcription. A 24-hour lifecycle rule on the Storage bucket acts as a safety net for failures. Do not add code paths that retain audio for any other purpose. If a use case for audio retention emerges, escalate the design decision — don't just leave the blob in place.

### 2.6 No PHI in logs

Cloud Function logs, Sentry events, analytics — none of these should contain the patient tag, the precise timestamp, or anything else that could identify a patient. Log `recording_id` only. If you need to log content for debugging, log the de-identified transcript or draft (not the tag).

```typescript
// CORRECT
console.log(`Processing recording ${recordingId} for clinician ${clinicianId}`);

// WRONG
console.log(`Processing recording for ${patientTag}`);  // PHI in logs
```

### 2.7 Templates and few-shot examples must not contain real patient names

When building templates and few-shot examples (which DO enter the LLM context), all example transcripts and example outputs must use fake names — or better, avoid names entirely. Use placeholders like "patient tolerated well" rather than "Sarah tolerated well." This applies to any sample data, fixtures, tests, or documentation.

### 2.8 Firestore Security Rules are non-optional

Every collection has rules. The default rule is `allow read, write: if false`. Explicit allow rules grant access only to the authenticated owner. Test rules against the Firebase Local Emulator before deploying. The Firestore console must never be a development workaround for missing rules.

### 2.9 Never read `patient_tags` from a Cloud Function

The `patient_tags` subcollection should only be accessed by the authenticated client (the dentist's phone or web app). Cloud Functions, which run with admin privileges and could bypass security rules, must not read this collection. This keeps the PHI access boundary clean: the only place patient identifiers exist in code paths is between the authenticated client and the isolated subcollection.

If a Cloud Function appears to need tag data, that's a design smell — refactor so the tag stays client-side.

### 2.10 The dentist always reviews before notes leave the web app

There is no path where the AI-generated note enters the PMS without the clinician explicitly clicking "Copy Note" or equivalent. The system never writes directly into a chart. This preserves clinical responsibility as unambiguously human and keeps us out of "device" regulatory territory.

---

## 3. Tech Stack Summary

**Backend:**
- Firebase (Firestore, Cloud Functions 2nd gen, Cloud Storage, Authentication, Hosting)
- Node.js 20 runtime for Cloud Functions
- TypeScript throughout

**Web Frontend:**
- React (Vite for build)
- Firebase JS SDK for Auth, Firestore, Storage
- TypeScript

**iOS App** (`apps/ArgonautScribe/`):
- Swift 6 + SwiftUI (min iOS 17), Xcode project (not SPM — see §9.13)
- Firebase iOS SDK (Auth, Firestore, Storage, Functions) — no Messaging (crashes on simulator)
- AVFoundation for audio recording
- `GoogleService-Info.plist` is gitignored — must be added manually per machine
- See `docs/MOBILE-APP-SPEC.md` for full spec

**External APIs:**
- Deepgram (`@deepgram/sdk`) for speech-to-text
- Anthropic (`@anthropic-ai/sdk`) for LLM

**Tooling:**
- ESLint + Prettier with shared config
- Vitest or Jest for unit tests
- Firebase Emulator Suite for local development
- GitHub Actions for CI/CD
- Sentry for error monitoring

---

## 4. Repository Structure

Actual layout as built:

```
ArgonautScribe/
├── apps/
│   ├── web/                     # Web app (React/Vite)
│   │   ├── src/
│   │   │   ├── screens/         # NotesList, NoteWorkspace, SignIn
│   │   │   ├── components/      # FieldRow, RecordingPanel
│   │   │   ├── lib/             # firebase.ts, auth.tsx, notes.ts, segments.ts, recorder.ts
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   └── package.json
│   └── ArgonautScribe/          # iOS app (SwiftUI) — Xcode project, NOT SPM
│       ├── ArgonautScribe.xcodeproj
│       └── ArgonautScribe/
│           ├── App/             # ArgonautScribeApp.swift, RootView.swift
│           ├── Models/          # Note, Template, Clinician, PatientTag, Segment (Swift ports)
│           ├── Views/           # SignInView, NotesListView, NoteWorkspaceView, FieldRowView, RecordingControlsView
│           ├── Services/        # AuthService, FirestoreService, StorageService, AudioRecorderService, RenderService, ValidateService
│           ├── Utilities/       # Constants.swift
│           ├── Assets.xcassets  # App icon (1024x1024)
│           └── GoogleService-Info.plist  # GITIGNORED — add manually
├── functions/                   # Cloud Functions (Node.js 20, TypeScript)
│   ├── src/
│   │   ├── index.ts             # Exports generateNote, markFiled
│   │   ├── generate-note.ts     # Main pipeline: STT → LLM → merge → validate → render
│   │   ├── mark-filed.ts        # Delete note + audit event
│   │   ├── merge.ts             # AI field values merged with user-set values
│   │   ├── render.ts            # Format-string renderer (CJS copy)
│   │   ├── validate.ts          # Deterministic validator (CJS copy)
│   │   ├── types.ts             # Local type mirrors (CJS can't import shared TS)
│   │   ├── adapters/
│   │   │   ├── deepgram.ts      # Deepgram Nova-3 Medical STT
│   │   │   └── anthropic.ts     # Claude Sonnet 4.6 tool-use extraction
│   │   └── prompts/
│   │       ├── build.ts         # System prompt, few-shot messages, user message
│   │       └── schema.ts        # Template → JSON Schema for Claude tool
│   └── package.json
├── shared/                      # Shared types + logic (web app imports via pnpm workspace)
│   ├── src/
│   │   ├── index.ts             # Re-exports everything
│   │   ├── types.ts             # All Firestore document types (source of truth)
│   │   ├── constants.ts
│   │   ├── format.ts            # Format-string renderer ({field_name} → value)
│   │   ├── validate.ts          # validateNote(), reviewLevel()
│   │   └── fixtures/            # Template definitions
│   │       ├── cementation-template.ts
│   │       ├── crown-prep-template.ts  # Display name: "Restorations"
│   │       ├── general-template.ts
│   │       ├── new-patient-exam-template.ts
│   │       ├── prophylaxis-template.ts
│   │       ├── soap-template.ts
│   │       └── toy-template.ts
│   └── package.json
├── scripts/
│   └── seed.ts                  # Seeds templates to Firestore
├── firestore/
│   ├── firestore.rules
│   └── storage.rules
├── SPEC.md
├── CLAUDE.md
├── docs/
│   ├── ADR/
│   └── MOBILE-APP-SPEC.md
├── firebase.json
├── .firebaserc
└── package.json                 # pnpm workspace root
```

pnpm workspaces link `@argonaut/shared` into `apps/web` and `functions`. The iOS app does **not** use the shared package — it has hand-written Swift model ports that must be kept in sync manually (see §9.12).

---

## 5. Coding Conventions

### 5.1 Language

TypeScript everywhere. No JavaScript. Strict mode on (`"strict": true` in tsconfig). No `any` types except at API boundaries where unavoidable, and always with a comment explaining why.

### 5.2 Style

- Prefer prose-style code: clear variable names, small functions, comments that explain *why* not *what*.
- No clever one-liners that take more time to read than write.
- Async/await throughout. No raw promise chaining unless the linter genuinely requires it.
- Use `const` aggressively; `let` only when reassignment is intentional; never `var`.

### 5.3 Naming

- `recording_id` (snake_case) in Firestore documents and API payloads.
- `recordingId` (camelCase) in TypeScript code.
- Boolean fields are named affirmatively: `isReady`, `hasError`, `occlusalAdjusted` — not `notReady` or `noError`.
- File names are kebab-case: `process-recording.ts`, `template-renderer.ts`.

### 5.4 Error handling

Cloud Functions: always catch and write the error state to Firestore so the clinician sees it in the UI. Never let an error vanish silently. Use a structured error type:

```typescript
type RecordingError = {
  stage: "upload" | "stt" | "llm" | "render";
  message: string;
  retryable: boolean;
};
```

Client code: handle Firebase errors explicitly. Never `catch (e) {}` without at least logging.

### 5.5 Logging

Use structured logging in Cloud Functions:

```typescript
logger.info("Recording processed", {
  recordingId,
  clinicianId,
  templateId,
  durationMs,
  // No tag, no patient identifiers, no transcript content in logs.
});
```

`firebase-functions/logger` provides `info`, `warn`, `error`, `debug`. Use `debug` for verbose dev-only logging.

### 5.6 Configuration

All secrets via Firebase Secret Manager:
- `DEEPGRAM_API_KEY`
- `ANTHROPIC_API_KEY`

All non-secret config via Firebase Remote Config or environment files. Never hardcode model names, endpoints, or thresholds.

---

## 6. Common Tasks

### 6.1 Adding a new template

1. Sit with the clinician for 30-60 minutes.
2. List the fields she'd want in the note, with types and options.
3. Draft the format string with `{field}` placeholders.
4. Have her dictate 3-5 example procedures of this type. Hand-write the ideal extracted output for each.
5. Build the keyword list from terms she uses (materials, anatomy, abbreviations).
6. Create the template document in Firestore under `/practices/{pid}/templates/{tid}` (or via admin UI when it exists).
7. Add the example transcripts and outputs to the few-shot section of the template.
8. Add the recordings to the benchmark suite for ongoing accuracy testing.
9. Run the benchmark to confirm baseline accuracy.

### 6.2 Calling Deepgram from a Cloud Function

```typescript
import { createClient } from "@deepgram/sdk";
import { defineSecret } from "firebase-functions/params";

const deepgramKey = defineSecret("DEEPGRAM_API_KEY");

export async function transcribe(
  audioBuffer: Buffer,
  keywords: string[]
): Promise<string> {
  const deepgram = createClient(deepgramKey.value());
  const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
    audioBuffer,
    {
      model: "nova-3-medical",
      smart_format: true,
      punctuate: true,
      keywords, // e.g. ["Filtek:2", "Scotchbond:2", ...]
    }
  );

  if (error) {
    throw new RecordingError("stt", error.message, /*retryable*/ true);
  }

  return result.results.channels[0].alternatives[0].transcript;
}
```

### 6.3 Calling Claude from a Cloud Function

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { defineSecret } from "firebase-functions/params";

const anthropicKey = defineSecret("ANTHROPIC_API_KEY");

export async function fillTemplate(
  transcript: string,
  template: Template
): Promise<FilledDraft> {
  const client = new Anthropic({ apiKey: anthropicKey.value() });

  const tool = {
    name: "fill_clinical_note",
    description: "Extract structured fields from a dental encounter transcript.",
    input_schema: buildSchemaFromTemplate(template),
  };

  const response = await client.messages.create({
    model: "claude-sonnet-4-6", // Pin model version. Update intentionally; verify the current Sonnet ID via Anthropic docs at the time of any change.
    max_tokens: 2000,
    system: buildSystemPrompt(template),
    tools: [tool],
    tool_choice: { type: "tool", name: "fill_clinical_note" },
    messages: [
      ...buildFewShotMessages(template),
      { role: "user", content: `Transcript:\n${transcript}` },
    ],
    // Enable prompt caching on the system prompt and few-shots.
    // See Anthropic docs for the exact cache_control syntax current at implementation time.
  });

  const toolUse = response.content.find((c) => c.type === "tool_use");
  if (!toolUse) {
    throw new RecordingError("llm", "No tool use in response", /*retryable*/ true);
  }

  return validateAndCoerce(toolUse.input, template);
}
```

### 6.4 Adding a new field type to the template system

If clinicians need a field type not currently supported (e.g., "time of day," "duration"):

1. Add the type to the `FieldType` union in `shared/src/templates.ts`.
2. Add schema generation for it in `buildSchemaFromTemplate`.
3. Add rendering for it in the format string interpolator.
4. Add a UI component for it in the web compose review panel.
5. Add a UI component for it in the template editor.
6. Update tests.

### 6.5 Running the accuracy benchmark

```bash
cd benchmarks/
pnpm run benchmark -- --template composite
```

The benchmark loads all `recordings/composite/*.webm` files, runs them through the pipeline, compares to `expected/composite/*.json`, and reports per-field accuracy plus a summary score. Run this whenever changing prompts, models, or template definitions.

### 6.6 Validation and mapping_status

Every `FieldValue` carries a `mapping_status` field set by Claude during extraction:

- `"exact"` — value matches a picklist option verbatim. No review needed.
- `"unmapped"` — value was heard clearly in the transcript but doesn't match any picklist option. Placed in qualifier for doctor review (e.g. dentist said "Dr. Patel" but picklist has "Dr. Parul Aggarwal, DDS"). Shows a **red** review chip.
- `"missing"` — field was not mentioned in the transcript at all. If required, shows **red**; if optional, shows **none**.

When a user manually selects a picklist value, set `mapping_status: "exact"` (it's definitionally exact).

**Deterministic validator** (`shared/src/validate.ts`): Runs after Claude returns field values and before the dentist sees the Copy button. Checks:

1. Required field missing entirely → **blocking**
2. Required field has `mapping_status: "missing"` with no value → **blocking**
3. Picklist field has `mapping_status: "unmapped"` → **warning**
4. Rendered note contains artifacts (`null`, `undefined`, `[object Object]`, `NaN`) → **blocking**

Returns `{ safe_to_copy: boolean, issues: ValidationIssue[] }`. Blocking issues disable the Copy button. Warnings show a yellow box but allow copy.

**`reviewLevel()`** derives per-field UI color from the metadata:
- `"none"` (green) — exact match or user-set
- `"yellow"` — inferred confidence, probably fine
- `"red"` — unmapped or missing required, must review

---

## 7. Firestore Security Rules

The principles:

1. Default deny.
2. Clinicians can only read/write their own data.
3. Admin role can additionally manage templates at the practice level.
4. `patient_tags` subcollection has stricter rules: writable only by the owning clinician, never readable in bulk.
5. Cloud Functions, which bypass security rules via admin credentials, must respect the same boundaries by code convention (see §2.9).

Sketch:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /clinicians/{cid} {
      allow read, write: if request.auth != null && request.auth.uid == cid;

      match /notes/{nid} {
        allow read, write: if request.auth != null && request.auth.uid == cid;

        match /segments/{sid} {
          allow read, write: if request.auth != null && request.auth.uid == cid;
        }
      }

      match /patient_tags/{nid} {
        // Tighter: read only by self, no list queries.
        allow get: if request.auth != null && request.auth.uid == cid;
        allow create, update: if request.auth != null && request.auth.uid == cid;
        allow delete: if request.auth != null && request.auth.uid == cid;
        // Note: deliberately no 'list' permission. Tags are fetched one at a time
        // by note_id when the note row appears in the list.
      }
    }

    match /practices/{pid} {
      match /templates/{tid} {
        allow read: if request.auth != null && belongsToPractice(request.auth.uid, pid);
        allow write: if request.auth != null && isAdminOfPractice(request.auth.uid, pid);

        match /versions/{vid} {
          allow read: if request.auth != null && belongsToPractice(request.auth.uid, pid);
          allow write: if request.auth != null && isAdminOfPractice(request.auth.uid, pid);
        }
      }

      match /providers/{prov} {
        allow read: if request.auth != null && belongsToPractice(request.auth.uid, pid);
        allow write: if request.auth != null && isAdminOfPractice(request.auth.uid, pid);
      }

      match /assistants/{asst} {
        allow read: if request.auth != null && belongsToPractice(request.auth.uid, pid);
        allow write: if request.auth != null && isAdminOfPractice(request.auth.uid, pid);
      }
    }

    match /audit/{pid}/events/{eid} {
      // Append-only audit log, content-free. Reads gated to practice members.
      allow read: if request.auth != null && belongsToPractice(request.auth.uid, pid);
      allow create: if request.auth != null && belongsToPractice(request.auth.uid, pid);
      allow update, delete: if false;
    }

    // Helper functions
    function belongsToPractice(uid, pid) {
      return get(/databases/$(database)/documents/clinicians/$(uid)).data.practice_id == pid;
    }

    function isAdminOfPractice(uid, pid) {
      let clinician = get(/databases/$(database)/documents/clinicians/$(uid)).data;
      return clinician.practice_id == pid && clinician.role == "admin";
    }
  }
}
```

Test these against the Firebase Emulator before deploying. The `firebase emulators:exec` command with a test suite of "should allow X, should deny Y" cases is the standard pattern.

---

## 8. Testing Approach

### 8.1 Unit tests

- Pure functions (format string renderer, schema builder, field validators) have full unit coverage.
- Run with Vitest. Fast, in-memory.

### 8.2 Integration tests

- Cloud Functions tested against the Firebase Emulator Suite.
- Use the emulator for Firestore, Auth, Storage.
- STT and LLM calls are mocked at the adapter boundary using stub responses.

### 8.3 Accuracy benchmarks

- A curated set of 30+ recordings per template with hand-graded expected outputs.
- Run as a separate CI job (slow, costs real API money in small amounts).
- Track per-field accuracy over time. Regressions block deployment.

### 8.4 Security rules tests

- `@firebase/rules-unit-testing` against the emulator.
- Test cases: "a clinician can read her own drafts," "a clinician cannot read another clinician's drafts," "patient_tags cannot be list-queried," etc.

### 8.5 End-to-end tests

- Playwright or Cypress for the web compose surface.
- XCUITest for critical iOS flows (sign in, create note, record, generate, copy, mark filed).
- Manual testing of the iOS app on real devices is unavoidable for audio capture — the Simulator doesn't accurately model mic permissions and background behavior.

---

## 9. Gotchas and Pitfalls

Practical issues to be aware of:

### 9.1 Cloud Function cold starts

First invocation after idle can take 2-5 seconds. For an async pipeline this is fine, but if you ever build a synchronous path, set min instances to 1. Costs a few dollars per month per warm function.

### 9.2 Firestore listener costs

A web app that subscribes to a large notes collection and refreshes frequently can run up document-read costs. Use single-document listeners where possible, or query-with-limit and pagination. For the notes list, limit to the current day or last 50 notes.

### 9.3 Firestore offline cache

The Firestore SDK caches reads locally. This is great for offline, but means a stale note might briefly show up after a "mark filed" delete. Use `serverTimestamp()` and check freshness, or invalidate the cache explicitly after critical writes.

### 9.4 Browser MediaRecorder quirks

- Safari produces MP4/AAC; Chrome produces WebM/Opus. Both work with Deepgram.
- iOS Safari requires a user gesture (button tap) to start `getUserMedia`. Cannot start recording programmatically without one.
- iOS Safari may pause MediaRecorder when the screen locks. Test thoroughly with the screen locked mid-recording.

### 9.5 PWA install prompts

The "install to home screen" prompt is browser-controlled. You can detect eligibility but not force it. Provide clear instructions in onboarding.

### 9.6 Anthropic prompt caching expiration

Default cache TTL is short (5 minutes at time of writing; verify current). If recordings are sparse, cache hits drop. Consider extended caching or cache warming. Affects cost, not correctness.

### 9.7 Deepgram audio format support

Wide format support, but very large files (>100 MB) require the streaming endpoint. For our use case (audio under 5 MB always), this is never a concern.

### 9.8 Firestore document size limit

1 MB per document. A very long transcript could approach this. Validate length before writing; if a recording produced an absurdly long transcript (over 50 KB), something went wrong upstream — flag it as an error rather than truncating silently.

### 9.9 Tag synchronization across devices

With both web and iOS clients, a note created on one device needs its patient tag visible on the other. Firestore real-time listeners handle this automatically. UX: show "Untitled" in the notes list if the tag doc hasn't arrived yet. Don't block note display on tag arrival.

### 9.11 iOS-specific: background audio upload

When the iOS app is backgrounded during an audio upload, a `URLSession` background task must complete the upload. If the upload fails, the segment stays in local storage with `status: "pending_upload"` and retries on next app launch. Never lose audio.

### 9.12 Renderer sync (Swift ↔ TypeScript)

The format-string renderer exists in two places: `shared/src/format.ts` (web + Cloud Function) and `Services/RenderService.swift` (iOS). Both are <100 lines. Keep them in sync manually — shared test vectors (same inputs, same expected outputs) catch drift. If you change the TypeScript renderer, update the Swift one in the same PR.

### 9.13 iOS app uses Xcode project, not SPM

The iOS app was migrated from a Swift Package Manager executable target to a proper
`.xcodeproj`. SPM executable targets don't produce proper iOS app bundles — no bundle ID,
no Info.plist, no `Bundle.main` resource access. If you see references to `apps/ios/` or
`Package.swift` for the iOS app, those are stale. The app lives at
`apps/ArgonautScribe/ArgonautScribe.xcodeproj`.

### 9.14 Swift 6 concurrency patterns

Firebase SDK types aren't `Sendable`. The patterns we use:
- `nonisolated(unsafe)` on Firebase singleton statics (`db`, `storage`, `functions`)
- `@MainActor` on service classes that touch UI state
- `@unchecked Sendable` on `AudioRecorderService` (manually thread-safe)
- `MainActor.assumeIsolated` inside Timer callbacks on `@MainActor` classes
- Fully qualify `FirebaseFirestore.FieldValue.serverTimestamp()` to avoid collision with
  our model's `FieldValue` type
- `AuthService` has no `deinit` — it's a singleton that never deallocates, and Swift 6
  prohibits accessing `@MainActor`-isolated properties from `nonisolated deinit`

### 9.15 iOS 26 SDK removed SwiftUI modifiers

`.keyboardType()` and `.textInputAutocapitalization()` were removed in iOS 26 SDK.
Use `.textContentType(.emailAddress)` instead — it gives the right keyboard automatically.

### 9.16 FirebaseMessaging crashes on simulator

`FIRMessagingAuthKeychain` throws a nil insertion exception on simulator. We removed the
FirebaseMessaging dependency entirely — it's not needed for MVP (no push notifications yet).

### 9.10 Template version drift

A clinician edits a template after some notes have been created from the previous version. Old notes retain a `template_version` reference, and the prior version is preserved at `/practices/{pid}/templates/{tid}/versions/{v}`. The review panel must render an old note against the version that created it, not the current version. Store the template version on every note.

---

## 10. Out of Scope (For Now)

Things that are explicitly NOT in current scope. If you find yourself building any of these, stop and check the spec / re-litigate the decision:

- PMS integration of any kind
- Android app (iOS first; Android if demand warrants)
- Apple Watch / Action Button integration (v2 — requires native app, which we now have)
- PHI scanner / redactor (v2)
- Visual template editor (v2)
- Multi-template chaining (v2)
- Auto-detect template from dictation (v2)
- Practice administrator dashboard / analytics (v2)
- Real-time human review (v3)
- On-device or office-local STT (v3)
- Multi-language (v3)
- Patient-facing anything (never)

See `SPEC.md` §15 for the full list of rejected proposals and §17 for the roadmap.

---

## 11. Where Things Live

A pointer guide to the codebase (once it exists):

| Question | Where to look |
|---|---|
| How does audio get uploaded? | Web: `apps/web/src/lib/segments.ts`. iOS: `Services/StorageService.swift` |
| How does the offline queue work? | Web: not implemented (always online on workstation). iOS: Firestore SDK offline persistence + background `URLSession` for uploads |
| Where is the iOS app spec? | `docs/MOBILE-APP-SPEC.md` |
| Where is the iOS format-string renderer? | `apps/ArgonautScribe/ArgonautScribe/Services/RenderService.swift` (Swift port of `shared/src/format.ts`) |
| Where is the generateNote Cloud Function? | `functions/src/generate-note.ts` — STT + LLM + merge + validate + render |
| How is the LLM prompt built? | `functions/src/prompts/build.ts` (system prompt, few-shot messages, user message) |
| How is the LLM tool schema built? | `functions/src/prompts/schema.ts` (template fields → JSON Schema for Claude tool-use) |
| Where does AI merge happen? | `functions/src/merge.ts` — merges AI field values with user-set values, respects source provenance |
| Where is the deterministic validator? | `shared/src/validate.ts` (source of truth) + `functions/src/validate.ts` (CJS copy) |
| Where are template format strings rendered? | `shared/src/format.ts` |
| Where are template fixtures? | `shared/src/fixtures/` — cementation, crown-prep (Restorations), general, prophylaxis, new-patient-exam, soap, toy |
| Where are the few-shot examples per template? | In template fixture files and seeded to Firestore via `scripts/seed.ts` |
| Where are security rules? | `firestore/firestore.rules`, `firestore/storage.rules` |
| Where do I add a new template? | Create a fixture in `shared/src/fixtures/`, export from `shared/src/index.ts`, add to `scripts/seed.ts` |
| Where do I run the accuracy benchmark? | `benchmarks/runner.ts` (not yet populated) |
| Where are decision records kept? | `docs/ADR/` (use Architecture Decision Record format for any non-trivial decision) |
| Where is the web note workspace? | `apps/web/src/screens/NoteWorkspace.tsx` — field editing, preview, copy, validation warnings |
| Where are field row components? | `apps/web/src/components/FieldRow.tsx` — picklist + qualifier + review-level chips |

### 11.1 Session Memory Files

Claude Code persists project knowledge across sessions in memory files at
`.claude/projects/.../memory/`. These are **not** checked into git — they live
locally and are auto-loaded by Claude at session start.

| File | What it captures |
|---|---|
| `MEMORY.md` | Index of all memory files with one-line descriptions |
| `user-profile.md` | Anmol's role, working style, the pilot practice and its staff |
| `discuss-before-editing.md` | Talk through design before proposing code changes — don't jump to edits |
| `product-reframe-picklist-and-paragraph.md` | The real dental workflow: PMS picklist + typed paragraph; our product targets the structured note, not prose |
| `project-status-2026-05-30.md` | Full inventory of what's built (web, functions, shared, iOS), key architecture decisions, and remaining items for pilot |
| `validation-and-mapping-status.md` | `mapping_status` field design, deterministic validator, what was adopted vs rejected from ChatGPT's review |
| `ios-app-patterns.md` | Xcode project (not SPM), Swift 6 concurrency patterns, SDK compatibility gotchas, model/renderer sync |
| `feedback-no-xcode-builds.md` | Never run xcodebuild from Claude Code; user builds manually to save tokens |

When making significant architectural decisions or learning new project context, create or
update memory files so future sessions don't re-derive the same knowledge.

---

## 12. Workflow for AI Assistants Working on This Project

If you are an AI assistant (Claude, etc.) helping a developer on this codebase, here is what helps:

### 12.1 Always check the invariants first

Before writing any code that touches user data, audio, transcripts, or LLM calls, re-read §2 of this document. Many of the invariants are easy to violate accidentally.

### 12.2 Default to small, reviewable changes

This is a privacy-sensitive product. Prefer small PRs that one human can review carefully. Do not refactor large sections of code without explicit request.

### 12.3 Flag privacy-relevant decisions

If a task seems to require touching the `patient_tags` subcollection, the LLM prompt construction, or anything that crosses the PHI boundary, stop and explain the implications before writing code. Get explicit user confirmation.

### 12.4 Don't invent test data with real-sounding patient names

When writing tests or examples, use synthetic data. "Patient" or "TestPatient" or numbered placeholders. Never "John Smith" or "Sarah Johnson" — those exist as real people somewhere and end up in screenshots and bug reports.

### 12.5 Match the existing style

Read 2-3 existing files before adding a new one. Match naming conventions, error handling patterns, logging style.

### 12.6 Update tests in the same change

A new function comes with new tests. A modified function comes with updated tests. Untested code in this codebase is a bug.

### 12.7 Update this file when invariants change

If a core invariant in §2 changes through a deliberate design decision (recorded in `docs/ADR/`), update §2 of this document. CLAUDE.md must stay accurate; outdated instructions are worse than no instructions.

### 12.8 Never make live API calls without explicit permission

Do NOT make calls to external paid APIs (Anthropic, Deepgram, OpenAI) from scripts, curl, or test code unless the user explicitly asks you to. These calls cost real money. If the user wants to test an API integration, prepare the script/command and let them run it manually, or ask before executing.

### 12.9 Never run xcodebuild

Do NOT run `xcodebuild`, `swift build`, or any iOS compile step from Claude Code. The user builds the iOS app manually in Xcode. Xcode builds are slow, produce huge output, and waste tokens. After editing Swift files, describe what changed and let the user build.

### 12.10 If unsure, ask

Better to ask a clarifying question than to guess at user intent. Especially for: privacy-relevant changes, schema changes that affect Firestore documents in production, prompt changes that affect LLM accuracy.

---

## 13. Decision Log Pointer

All non-trivial design decisions are recorded as Architecture Decision Records (ADRs) in `docs/ADR/`. The format is:

```
docs/ADR/NNNN-short-title.md
```

Each ADR captures: context, decision, rationale, consequences, alternatives considered. When making a new significant decision, create a new ADR rather than just adjusting code.

The major decisions made during initial design are captured in `SPEC.md` §14 (Decisions Made) and §15 (Decisions Rejected). New decisions go in `docs/ADR/`.

---

## 14. Contact and Escalation

(Placeholder — fill in once the project has a real owner.)

- Project lead: TBD
- Pilot clinician: Dr. Patel (placeholder name)
- Cloud / Firebase account owner: TBD
- Deepgram account owner: TBD
- Anthropic account owner: TBD

---

## 15. Final Reminders

The product's privacy posture rests on a small number of architectural decisions made deliberately. Most of them are invisible in any single file — they only make sense when you see how the pieces fit together. Read `SPEC.md` end to end before making any non-trivial change. Re-read §2 of this document before any privacy-relevant change.

The dentist trusts this product with her professional reputation. The patient (whose name is not in our system) trusts the dentist. We are not in the loop of clinical decisions, but a single mistake — a hallucinated material, a leaked name, a wrong tooth number — can hurt someone. Take the work seriously.