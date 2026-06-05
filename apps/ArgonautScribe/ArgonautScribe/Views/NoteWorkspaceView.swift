import SwiftUI
import FirebaseFirestore
import FirebaseAuth

struct NoteWorkspaceView: View {
    let noteId: String

    @Environment(AuthService.self) private var auth
    @State private var note: Note?
    @State private var template: Template?
    @State private var tag = ""
    @State private var copyState: CopyState = .idle
    @State private var showFiledAlert = false
    @State private var noteListener: ListenerRegistration?
    @State private var tagListener: ListenerRegistration?

    enum CopyState { case idle, copied }

    private var renderedNote: String {
        guard let template, let note else { return "" }
        return RenderService.render(template: template, fieldValues: note.fieldValues)
    }

    private var validation: ValidationResult {
        guard let template, let note else {
            return ValidationResult(safeToCopy: false, issues: [])
        }
        return ValidateService.validateNote(
            template: template, fieldValues: note.fieldValues, renderedNote: renderedNote
        )
    }

    var body: some View {
        Group {
            if let note, let template {
                noteContent(note: note, template: template)
            } else {
                ProgressView("Loading...")
            }
        }
        .navigationTitle(template?.name ?? "Note")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let note {
                ToolbarItem(placement: .topBarTrailing) {
                    StatusBadge(status: note.status)
                }
            }
        }
        .onAppear { startListening() }
        .onDisappear { stopListening() }
        .alert("Mark Filed?", isPresented: $showFiledAlert) {
            Button("Cancel", role: .cancel) {}
            Button("Delete & File", role: .destructive) {
                Task { await markFiled() }
            }
        } message: {
            Text("This deletes the note, transcript, audio, and patient tag. This cannot be undone.")
        }
    }

    // MARK: - Content

    @ViewBuilder
    private func noteContent(note: Note, template: Template) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                // Patient tag
                VStack(alignment: .leading, spacing: 4) {
                    Text("Patient tag (PHI — never sent to STT or LLM)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    TextField("e.g. Sarah J — #14", text: $tag)
                        .textFieldStyle(.roundedBorder)
                        .onSubmit { Task { await saveTag() } }
                        .onChange(of: tag) { _, _ in
                            // Debounced save could go here.
                        }
                }

                // Recording controls
                RecordingControlsView(noteId: noteId, noteStatus: note.status)

                // Transcript
                if let transcript = note.transcript, !transcript.isEmpty {
                    DisclosureGroup("Transcript") {
                        Text(transcript)
                            .font(.callout)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding()
                    .background(.gray.opacity(0.08), in: RoundedRectangle(cornerRadius: 8))
                }

                // Fields
                VStack(alignment: .leading, spacing: 8) {
                    Text("Fields")
                        .font(.headline)

                    ForEach(template.fields) { field in
                        FieldRowView(
                            field: field,
                            value: note.fieldValues[field.name],
                            onChange: { newValue in
                                Task { await saveField(fieldName: field.name, value: newValue) }
                            }
                        )
                    }
                }

                // Preview
                VStack(alignment: .leading, spacing: 8) {
                    Text("Preview")
                        .font(.headline)

                    Text(renderedNote.isEmpty ? "(empty — fill in fields to see the assembled note)" : renderedNote)
                        .font(.system(.callout, design: .monospaced))
                        .foregroundStyle(renderedNote.isEmpty ? .secondary : .primary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding()
                        .background(.gray.opacity(0.08), in: RoundedRectangle(cornerRadius: 8))
                }

                // Validation warnings
                if !validation.issues.isEmpty {
                    let blocking = validation.issues.filter { $0.severity == .blocking }
                    let warnings = validation.issues.filter { $0.severity == .warning }

                    if !blocking.isEmpty {
                        VStack(alignment: .leading, spacing: 4) {
                            ForEach(blocking, id: \.field) { issue in
                                Label(issue.message, systemImage: "xmark.circle.fill")
                                    .font(.caption)
                                    .foregroundStyle(.red)
                            }
                        }
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(.red.opacity(0.08), in: RoundedRectangle(cornerRadius: 8))
                    }

                    if !warnings.isEmpty {
                        VStack(alignment: .leading, spacing: 4) {
                            ForEach(warnings, id: \.field) { issue in
                                Label(issue.message, systemImage: "exclamationmark.triangle.fill")
                                    .font(.caption)
                                    .foregroundStyle(.orange)
                            }
                        }
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(.orange.opacity(0.08), in: RoundedRectangle(cornerRadius: 8))
                    }
                }

                // Actions
                HStack(spacing: 12) {
                    Button {
                        UIPasteboard.general.string = renderedNote
                        copyState = .copied
                        Task {
                            try? await Task.sleep(for: .seconds(1.5))
                            copyState = .idle
                        }
                    } label: {
                        Label(
                            copyState == .copied ? "Copied!" : "Copy Note",
                            systemImage: copyState == .copied ? "checkmark" : "doc.on.doc"
                        )
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(renderedNote.isEmpty || !validation.safeToCopy)

                    Button(role: .destructive) {
                        showFiledAlert = true
                    } label: {
                        Label("Mark Filed", systemImage: "archivebox")
                    }
                    .buttonStyle(.bordered)
                }
            }
            .padding()
        }
    }

    // MARK: - Persistence

    private func saveTag() async {
        guard let uid = auth.user?.uid else { return }
        try? await FirestoreService.writePatientTag(clinicianUid: uid, noteId: noteId, tag: tag)
    }

    private func saveField(fieldName: String, value: FieldValue) async {
        guard let uid = auth.user?.uid, let template, let note else { return }
        var nextValues = note.fieldValues
        nextValues[fieldName] = value
        let nextText = RenderService.render(template: template, fieldValues: nextValues)

        // Encode the value as a dictionary for Firestore.
        let picklistAny: Any = {
            guard let p = value.picklist else { return NSNull() }
            switch p {
            case .string(let s): return s
            case .number(let n): return n
            case .bool(let b): return b
            case .array(let a): return a
            }
        }()

        let dict: [String: Any] = [
            "picklist": picklistAny,
            "qualifier": value.qualifier ?? NSNull(),
            "ai_confidence": value.aiConfidence ?? NSNull(),
            "source": "user",
            "mapping_status": "exact",
        ]

        try? await FirestoreService.writeFieldValue(
            clinicianUid: uid,
            noteId: noteId,
            fieldName: fieldName,
            value: dict,
            finalNoteText: nextText
        )
    }

    private func markFiled() async {
        guard let uid = auth.user?.uid,
              let clinician = auth.clinician,
              let note else { return }
        try? await FirestoreService.markFiled(
            clinicianUid: uid,
            noteId: noteId,
            practiceId: clinician.practiceId,
            templateId: note.templateId
        )
    }

    // MARK: - Listeners

    private func startListening() {
        guard let uid = auth.user?.uid else { return }

        // Note listener
        let noteRef = FirestoreService.noteRef(clinicianUid: uid, noteId: noteId)
        noteListener = noteRef.addSnapshotListener { snap, _ in
            note = try? snap?.data(as: Note.self)
            if let note, template == nil {
                Task { await loadTemplate(for: note) }
            }
        }

        // Tag listener
        let tagRef = FirestoreService.patientTagRef(clinicianUid: uid, noteId: noteId)
        tagListener = tagRef.addSnapshotListener { snap, _ in
            if let data = try? snap?.data(as: PatientTag.self) {
                tag = data.tag
            }
        }
    }

    private func loadTemplate(for note: Note) async {
        guard let clinician = auth.clinician else { return }
        let templates = try? await FirestoreService.fetchTemplates(practiceId: clinician.practiceId)
        template = templates?.first { $0.templateId == note.templateId }
    }

    private func stopListening() {
        noteListener?.remove()
        tagListener?.remove()
    }
}
