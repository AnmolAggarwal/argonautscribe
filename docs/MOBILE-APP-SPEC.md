# Argonaut Scribe — iOS App Specification

**Status:** Design specification
**Version:** 0.1
**Last updated:** 2026-05-23
**Parent spec:** See `SPEC.md` for full product context, data model, and privacy invariants.

---

## 1. Overview

A native iOS app that provides the full Argonaut Scribe experience on iPhone and iPad. The app is a first-class client alongside the web app — same Firestore backend, same Cloud Functions, same data model. Changes made on one surface appear instantly on the other via Firestore real-time listeners.

The app is NOT a companion to the web app. It is a symmetric, standalone client. A dentist could use only the iOS app, only the web app, or both interchangeably within the same note.

---

## 2. Why Native (Not PWA)

The original plan was a PWA for v1.1. A native app is preferred for these reasons:

1. **App Store distribution** — discoverability, trust, and update management for practices that may onboard multiple clinicians.
2. **Reliable background audio** — PWA audio recording on iOS Safari has known issues with screen lock, background tabs, and interrupted sessions. Native `AVAudioSession` is rock-solid.
3. **Push notifications** — notify the clinician when a note finishes generating ("Note for 2:30 is ready for review").
4. **Offline resilience** — Firestore iOS SDK has mature offline persistence out of the box. PWA IndexedDB requires manual queue management.
5. **Apple Watch potential (v2)** — Action Button / complication to start/stop recording from the wrist. Only possible with a native app + WatchKit extension.
6. **Haptics and polish** — native UI frameworks (SwiftUI) deliver the tactile, fast experience clinicians expect from a professional tool.

---

## 3. Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Language | Swift 6 | Modern concurrency (async/await, actors), strong typing, first-class Apple platform support |
| UI | SwiftUI | Declarative, fast iteration, native look and feel, works across iPhone/iPad |
| Backend | Firebase iOS SDK | Firestore, Auth, Storage, Cloud Functions — same backend as web app |
| Audio | AVFoundation | `AVAudioRecorder` for capture, `AVAudioSession` for mic management |
| Auth | Firebase Auth (iOS SDK) | Email/password, same auth as web. SSO/biometric unlock as future enhancement |
| State | SwiftUI `@Observable` + Firestore listeners | Firestore is the source of truth; local state derives from listeners |
| Distribution | App Store (TestFlight for pilot) | Standard iOS distribution |
| Min iOS | 17.0 | Covers ~95% of active devices; enables latest SwiftUI features and `@Observable` macro |

---

## 4. Architecture

### 4.1 Shared backend — zero duplication

The iOS app uses the **exact same** Firestore collections, Cloud Functions, and Storage paths as the web app. No new backend code is needed. Specifically:

- **Auth:** Same Firebase Auth project. A clinician signs in on iOS and gets the same UID, same Firestore data.
- **Notes:** Read/write to `/clinicians/{uid}/notes/{noteId}`. Same document schema.
- **Segments:** Upload audio to Cloud Storage at `notes/{noteId}/segments/{segmentId}`. Same path, same security rules.
- **Patient tags:** Read/write to `/clinicians/{uid}/patient_tags/{noteId}`. Same PHI isolation.
- **Templates:** Read from `/practices/{pid}/templates/{tid}`. Same template definitions.
- **Generate:** Call the `generateNote` Cloud Function via Firebase callable. Same function, same response.

### 4.2 Real-time sync

Both clients subscribe to the same Firestore documents via `onSnapshot` (web) / `addSnapshotListener` (iOS). When one client writes, the other sees the change within ~1 second. Specific scenarios:

| Action on Device A | What Device B sees |
|---|---|
| Create a new note | Note appears in list within ~1s |
| Record and upload audio segment | Segment doc appears (audio in Storage) |
| Click Generate | Status changes to "generating" → "ready" as the Cloud Function runs |
| Edit a field value | Field updates in real-time (last-write-wins) |
| Edit patient tag | Tag updates in real-time |
| Mark Filed | Note disappears from list (doc deleted) |

No special sync logic is needed. Firestore handles it. The Cloud Function is the single writer for AI-generated fields; both clients are equal peers for user-set fields.

### 4.3 Offline behavior

The Firebase iOS SDK caches Firestore data locally by default. When offline:

- **Reading:** Notes list, field values, and templates are available from cache.
- **Writing field values:** Writes are queued locally and synced when connectivity returns.
- **Audio upload:** Segments are saved to the app's local storage and uploaded when online. A background `URLSession` task handles the upload so it completes even if the app is backgrounded.
- **Generate:** Disabled when offline (requires Cloud Function). Show clear UI state: "Connect to Wi-Fi to generate."
- **Patient tags:** Read from cache, writes queued.

---

## 5. Screens

### 5.1 Sign In

- Email + password via Firebase Auth.
- "Sign in" button. No account creation in-app (admin creates accounts via web or Firebase console).
- Biometric unlock (Face ID / Touch ID) for returning sessions — stores Firebase auth refresh token in Keychain.
- Error states: wrong password, network error, account disabled.

### 5.2 Notes List (Home)

Mirrors the web app's notes list:

- **Header:** "Argonaut Scribe" + clinician name + sign out.
- **"+ New Note" button** — template picker if multiple templates exist.
- **Today section** — notes from today, showing: patient tag (primary, bold), template name + date (secondary), status badge.
- **Earlier section** — older notes.
- **Empty state** — "No notes yet. Tap + New Note to start."
- **Pull-to-refresh** — though Firestore listeners make this rarely needed.
- **Swipe actions** — swipe left to Mark Filed (with confirmation).

### 5.3 Note Workspace

The main screen. Mirrors the web workspace:

- **Header:** Template name, status badge, back button.
- **Patient tag input** — text field, saves on blur. PHI label visible.
- **Recording controls** — prominent mic button. Tap to start, tap to stop. Recording timer. Multiple segments supported.
- **Transcript** — collapsible section showing the combined transcript after Generate.
- **Fields** — scrollable list of field rows. Each row: label, picklist selector (action sheet or picker), qualifier text field. Tapping a picklist opens a native picker/action sheet. Multi-select uses checkmark list.
- **Preview** — the rendered note text. Tappable to expand full-screen.
- **Actions:** "Copy Note" (copies to system clipboard), "Mark Filed" (with confirmation alert).
- **Generate button** — appears when segments exist and status is not "generating". Calls the Cloud Function.

### 5.4 Settings (minimal for v1)

- Sign out.
- App version.
- Link to support / feedback.

---

## 6. Audio Recording

### 6.1 Capture

- `AVAudioRecorder` with AAC encoding (`.m4a`). Smaller files than WebM, excellent Deepgram support.
- Sample rate: 16kHz mono (optimized for speech, small file size).
- `AVAudioSession` category: `.record`, mode: `.measurement` for clean speech capture.
- Interrupt handling: if a phone call interrupts, pause recording and resume when the call ends. Save what was captured.

### 6.2 Segment model

Same as web: each recording creates a segment document in Firestore and uploads the audio file to Cloud Storage.

```
Segment document: /clinicians/{uid}/notes/{noteId}/segments/{segmentId}
Audio file: gs://bucket/notes/{noteId}/segments/{segmentId}
```

### 6.3 Upload

- Upload via Firebase Storage iOS SDK (`StorageReference.putData`).
- For large files or unreliable connections, use resumable uploads.
- If the app is backgrounded during upload, use a `URLSession` background task to complete it.
- On upload complete, update the segment document with `storage_path` and `status: "uploaded"`.

### 6.4 Permissions

- Request microphone permission on first recording attempt (not on app launch).
- If denied, show a clear message with a button to open Settings.

---

## 7. Privacy Invariants (same as web)

All privacy invariants from `CLAUDE.md` section 2 apply identically to the iOS app:

1. **Patient tag never enters STT or LLM context.** The iOS app writes tags to `patient_tags/{noteId}` only. The Cloud Function (which calls Deepgram and Claude) never reads that subcollection.
2. **UUIDs are random v4.** `UUID().uuidString` in Swift.
3. **Date is day-level only.** `note.date_iso` is `"2026-05-23"`, never a full timestamp.
4. **Audio is deleted after STT.** Handled by the Cloud Function, not the client. Client just uploads.
5. **No PHI in logs.** Use `os.Logger` with care. Never log patient tags or transcript content.
6. **Patient tag is never in push notification content.** Notifications say "Your note is ready for review", never "Sarah J's note is ready."

---

## 8. Push Notifications

### 8.1 When to notify

- **Note ready:** When a note transitions from `generating` to `ready`, send a push notification to the clinician's devices.
- **Note error:** When a note transitions to `error`, notify so the clinician can retry.

### 8.2 Implementation

- Firebase Cloud Messaging (FCM) via the iOS SDK.
- The iOS app registers for push notifications and stores the FCM token in the clinician's Firestore document (`/clinicians/{uid}.fcm_tokens`).
- A Firestore-triggered Cloud Function watches for status changes on notes and sends the push via FCM.
- Notification content: "Note ready for review" (no PHI, no patient tag, no template details). Tapping opens the note workspace.

### 8.3 New Cloud Function needed

```typescript
// functions/src/on-note-status-change.ts
export const onNoteStatusChange = onDocumentUpdated(
  "clinicians/{clinicianId}/notes/{noteId}",
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    // Only notify on transitions to "ready" or "error"
    if (before.status === after.status) return;
    if (after.status !== "ready" && after.status !== "error") return;

    const clinicianId = event.params.clinicianId;
    const clinicianDoc = await getFirestore().doc(`clinicians/${clinicianId}`).get();
    const tokens = clinicianDoc.data()?.fcm_tokens as string[] | undefined;
    if (!tokens || tokens.length === 0) return;

    const title = after.status === "ready" ? "Note ready" : "Note needs attention";
    const body = after.status === "ready"
      ? "Your note has been generated and is ready for review."
      : "There was an issue generating your note. Tap to retry.";

    await getMessaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: { noteId: event.params.noteId },
    });
  }
);
```

---

## 9. Data Flow Diagram

```
                    ┌──────────────┐
                    │   Firestore   │
                    │  (source of   │
                    │    truth)     │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────▼─────┐ ┌───▼────┐ ┌─────▼──────┐
        │  iOS App   │ │Web App │ │  Cloud Fns  │
        │  (SwiftUI) │ │(React) │ │ (generate,  │
        │            │ │        │ │  notify)    │
        └─────┬──────┘ └───┬────┘ └─────┬──────┘
              │            │            │
              │     ┌──────▼──────┐     │
              └────►│Cloud Storage│◄────┘
                    │  (audio,    │
                    │  ephemeral) │
                    └─────────────┘
```

Both clients are peers. Neither knows or cares whether the other exists. Firestore is the meeting point. The Cloud Function is the only server-side logic.

---

## 10. Project Structure

```
apps/
  ios/
    ArgonautScribe/
      App/
        ArgonautScribeApp.swift        # Entry point, Firebase configure
      Models/
        Note.swift                     # Firestore document model
        Template.swift                 # Template model
        PatientTag.swift               # PHI tag model
        Segment.swift                  # Audio segment model
        Clinician.swift                # Clinician profile model
      Views/
        SignInView.swift               # Login screen
        NotesListView.swift            # Home — notes list
        NoteWorkspaceView.swift        # Main workspace
        FieldRowView.swift             # Single field row (picklist + qualifier)
        RecordingControlsView.swift    # Mic button, timer, segment list
        TranscriptView.swift           # Collapsible transcript display
        NotePreviewView.swift          # Rendered note preview
      Services/
        AuthService.swift              # Firebase Auth wrapper
        FirestoreService.swift         # Firestore reads/writes, listeners
        StorageService.swift           # Audio upload to Cloud Storage
        AudioRecorderService.swift     # AVAudioRecorder wrapper
        NotificationService.swift      # FCM token registration
        RenderService.swift            # Format string renderer (port of shared/format.ts)
      Utilities/
        Constants.swift                # Practice ID, collection paths
        Extensions.swift               # Date formatting, etc.
      Resources/
        Assets.xcassets
    ArgonautScribe.xcodeproj
    ArgonautScribeTests/
    Podfile or Package.swift           # Firebase SDK dependency
```

---

## 11. Firebase SDK Dependencies

Using Swift Package Manager:

```swift
// Package.swift dependencies
.package(url: "https://github.com/firebase/firebase-ios-sdk.git", from: "11.0.0")

// Products needed:
// - FirebaseAuth
// - FirebaseFirestore
// - FirebaseStorage
// - FirebaseFunctions
// - FirebaseMessaging
```

---

## 12. Renderer Port

The format-string renderer (`shared/src/format.ts`) must be ported to Swift. It is a pure function (~80 lines) with no dependencies:

```swift
func render(template: Template, fieldValues: [String: FieldValue]) -> String {
    // If format_string exists, interpolate {field_name} placeholders.
    // Otherwise, fallback to "Label: value" per field.
    // Lines where all placeholders are empty are dropped.
    // Unreferenced fields with values are appended at the end.
}
```

Keep the Swift and TypeScript implementations in sync. Both are simple enough that manual sync is preferable to a shared codegen layer.

---

## 13. Testing Strategy

### 13.1 Unit tests

- Renderer: port the TypeScript tests to XCTest. Same inputs, same expected outputs.
- Models: Firestore document decoding/encoding.
- Audio: mock `AVAudioRecorder` for state machine tests.

### 13.2 UI tests

- XCUITest for critical flows: sign in, create note, record, generate, copy, mark filed.
- Snapshot tests for key screens (optional, nice-to-have).

### 13.3 Integration tests

- Against Firebase Emulator Suite (Firestore, Auth, Storage emulators support iOS SDK connections).
- Verify real-time sync: write from web emulator, confirm iOS listener fires.

---

## 14. App Store Considerations

### 14.1 Review guidelines

- **4.2 Minimum Functionality:** The app must do more than wrap a website. It does — native audio recording, push notifications, offline support, biometric auth.
- **5.1.1 Data Collection and Storage:** Privacy nutrition label must accurately list: email (account), audio (ephemeral, deleted after processing), clinical notes (app functionality). No tracking. No advertising.
- **5.1.2 Health Data:** The app handles clinical notes but is NOT a medical device. It does not diagnose, treat, or make clinical recommendations. It is a documentation tool. The dentist reviews everything before use. Frame as "productivity" not "health."

### 14.2 Privacy nutrition label

| Data type | Usage | Linked to identity? |
|---|---|---|
| Email address | App functionality, account | Yes |
| Audio data | App functionality | No (ephemeral, deleted after STT) |
| User content (notes) | App functionality | Yes (clinician's notes) |
| Diagnostics | App functionality | No |

No data is used for tracking. No data is shared with third parties for advertising.

### 14.3 TestFlight

- Pilot with Dr. Patel's practice via TestFlight before App Store submission.
- TestFlight allows up to 10,000 external testers — more than enough.

---

## 15. Development Phases

### Phase 1: Core (2-3 weeks)

- [ ] Xcode project setup, Firebase SDK integration
- [ ] Auth flow (sign in, sign out, session persistence)
- [ ] Notes list with Firestore real-time listener
- [ ] Note workspace: field rows, picklist selectors, qualifier inputs
- [ ] Patient tag input
- [ ] Format-string renderer (Swift port)
- [ ] Note preview + Copy to clipboard

### Phase 2: Recording (1-2 weeks)

- [ ] Audio recording with AVAudioRecorder
- [ ] Segment management (multiple recordings per note)
- [ ] Upload to Cloud Storage
- [ ] Background upload handling
- [ ] Generate button (calls Cloud Function)
- [ ] Transcript display

### Phase 3: Polish (1 week)

- [ ] Push notifications (FCM)
- [ ] Offline handling and error states
- [ ] Biometric unlock
- [ ] iPad layout optimization
- [ ] Accessibility audit (VoiceOver, Dynamic Type)

### Phase 4: Ship (1 week)

- [ ] TestFlight beta with pilot practice
- [ ] Privacy policy page
- [ ] App Store assets (screenshots, description)
- [ ] App Store submission

**Total estimate: 5-7 weeks** for a developer experienced with SwiftUI and Firebase.

---

## 16. What Does NOT Change

The entire backend is shared. Adding the iOS app requires:

- **Zero Firestore schema changes** — same collections, same documents.
- **Zero security rule changes** — rules are UID-based, not platform-based.
- **Zero Cloud Function changes** — `generateNote` is called the same way from both clients.
- **One new Cloud Function** — `onNoteStatusChange` for push notifications (benefits web app too, if web push is added later).

The iOS app is a pure client-side addition to an existing backend.

---

## 17. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| App Store rejection for health category | Delays launch by weeks | Frame as productivity tool, not medical device. No diagnostic claims. |
| Renderer drift (Swift vs. TypeScript) | Notes render differently on iOS vs. web | Shared test vectors. Both renderers are <100 lines — easy to verify. |
| iOS mic permissions changes | Recording breaks on new iOS versions | Test on each iOS beta. AVFoundation is stable; low risk. |
| Firebase iOS SDK size (~30MB) | App binary larger than ideal | Acceptable for a professional tool. Not a consumer app competing on size. |
| Offline → online sync conflicts | Field values overwritten | Last-write-wins is the documented policy (SPEC section 20.3). Same as web. |

---

## 18. Future (Not in v1)

- **Apple Watch companion** — Action Button to start/stop recording. Tiny WatchKit app sends audio to the phone, phone uploads. v2.
- **Siri Shortcut** — "Hey Siri, start a new note" → opens app to recording screen. v2.
- **Widget** — today's notes count + quick-create on home screen. v2.
- **iPad split view** — notes list on left, workspace on right. v1.1.
- **Handoff** — start a note on iPhone, continue on iPad or web. Firestore already enables this; the UX needs polish. v1.1.
