import SwiftUI
import FirebaseAuth
import FirebaseFirestore

struct NotesListView: View {
    @Environment(AuthService.self) private var auth
    @State private var notes: [Note] = []
    @State private var tags: [String: String] = [:]
    @State private var templates: [Template] = []
    @State private var isCreating = false
    @State private var showTemplatePicker = false
    @State private var listener: ListenerRegistration?
    @State private var tagListeners: [ListenerRegistration] = []

    private var todayIso: String {
        ISO8601DateFormatter.dayOnly.string(from: Date())
    }

    private var todayNotes: [Note] { notes.filter { $0.dateIso == todayIso } }
    private var olderNotes: [Note] { notes.filter { $0.dateIso != todayIso } }

    private var templateNames: [String: String] {
        Dictionary(uniqueKeysWithValues: templates.map { ($0.templateId, $0.name) })
    }

    var body: some View {
        List {
            if notes.isEmpty {
                ContentUnavailableView(
                    "No notes yet",
                    systemImage: "note.text",
                    description: Text("Tap + to start your first note.")
                )
                .listRowBackground(Color.clear)
            } else {
                if !todayNotes.isEmpty {
                    Section("Today - \(todayNotes.count) note\(todayNotes.count == 1 ? "" : "s")") {
                        ForEach(todayNotes) { note in
                            noteRow(note)
                        }
                    }
                }
                if !olderNotes.isEmpty {
                    Section("Earlier") {
                        ForEach(olderNotes) { note in
                            noteRow(note)
                        }
                    }
                }
            }
        }
        .navigationDestination(for: String.self) { noteId in
            NoteWorkspaceView(noteId: noteId)
        }
        .navigationTitle("Argonaut Scribe")
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("Sign Out") {
                    try? auth.signOut()
                }
                .font(.caption)
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    handleNewNote()
                } label: {
                    Image(systemName: "plus")
                }
                .disabled(isCreating)
            }
        }
        .confirmationDialog("Choose Template", isPresented: $showTemplatePicker) {
            ForEach(templates) { template in
                Button(template.name) {
                    Task { await createNote(templateId: template.templateId, version: template.version) }
                }
            }
            Button("Cancel", role: .cancel) {}
        }
        .task { await loadTemplates() }
        .onAppear { startListening() }
        .onDisappear { stopListening() }
    }

    // MARK: - Note row

    @ViewBuilder
    private func noteRow(_ note: Note) -> some View {
        NavigationLink(value: note.noteId) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    let tag = tags[note.noteId]
                    Text(tag ?? "Untitled")
                        .font(.headline)
                        .foregroundStyle(tag != nil ? .primary : .secondary)
                        .italic(tag == nil)

                    Text("\(templateNames[note.templateId] ?? note.templateId) - \(note.dateIso)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                StatusBadge(status: note.status)
            }
        }
    }

    // MARK: - Actions

    private func handleNewNote() {
        guard !isCreating else { return }
        if templates.count == 1, let t = templates.first {
            Task { await createNote(templateId: t.templateId, version: t.version) }
        } else if templates.count > 1 {
            showTemplatePicker = true
        }
    }

    private func createNote(templateId: String, version: Int) async {
        guard let uid = auth.user?.uid, let clinician = auth.clinician else { return }
        isCreating = true
        defer { isCreating = false }
        do {
            _ = try await FirestoreService.createNote(
                clinicianUid: uid,
                practiceId: clinician.practiceId,
                templateId: templateId,
                templateVersion: version
            )
        } catch {
            print("Create note failed: \(error.localizedDescription)")
        }
    }

    private func loadTemplates() async {
        guard let clinician = auth.clinician else { return }
        do {
            templates = try await FirestoreService.fetchTemplates(practiceId: clinician.practiceId)
        } catch {
            print("Fetch templates failed: \(error.localizedDescription)")
        }
    }

    // MARK: - Listeners

    private func startListening() {
        guard let uid = auth.user?.uid else { return }
        let query = FirestoreService.notesQuery(clinicianUid: uid)
        listener = query.addSnapshotListener { snap, error in
            guard let snap else { return }
            notes = snap.documents.compactMap { try? $0.data(as: Note.self) }
            updateTagListeners()
        }
    }

    private func updateTagListeners() {
        guard let uid = auth.user?.uid else { return }
        // Remove old listeners.
        tagListeners.forEach { $0.remove() }
        tagListeners = []

        // One listener per note for its patient tag.
        for note in notes {
            let ref = FirestoreService.patientTagRef(clinicianUid: uid, noteId: note.noteId)
            let l = ref.addSnapshotListener { snap, _ in
                if let data = try? snap?.data(as: PatientTag.self) {
                    tags[note.noteId] = data.tag.isEmpty ? nil : data.tag
                }
            }
            tagListeners.append(l)
        }
    }

    private func stopListening() {
        listener?.remove()
        tagListeners.forEach { $0.remove() }
        tagListeners = []
    }
}

// MARK: - Status Badge

struct StatusBadge: View {
    let status: String

    private var style: (Color, Color, String) {
        switch status {
        case "new":        return (.gray.opacity(0.15), .gray, "New")
        case "generating": return (.blue.opacity(0.15), .blue, "Generating")
        case "ready":      return (.green.opacity(0.15), .green, "Ready")
        case "edited":     return (.yellow.opacity(0.15), .orange, "Edited")
        case "error":      return (.red.opacity(0.15), .red, "Error")
        case "filed":      return (.gray.opacity(0.15), .gray, "Filed")
        default:           return (.gray.opacity(0.15), .gray, status.capitalized)
        }
    }

    var body: some View {
        let (bg, fg, label) = style
        Text(label)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(bg, in: Capsule())
            .foregroundStyle(fg)
    }
}
