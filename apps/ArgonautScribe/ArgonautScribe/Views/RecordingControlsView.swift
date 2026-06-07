import SwiftUI
import FirebaseFirestore
import FirebaseAuth

/// Mic button, timer, segment list, and Generate button.
struct RecordingControlsView: View {
    let noteId: String
    let noteStatus: String

    @Environment(AuthService.self) private var auth
    @State private var recorder = AudioRecorderService()
    @State private var segments: [Segment] = []
    @State private var segmentListener: ListenerRegistration?
    @State private var isUploading = false
    @State private var isGenerating = false
    @State private var permissionDenied = false
    @State private var showReRecordAlert = false

    private var canGenerate: Bool {
        !segments.isEmpty
        && segments.contains { $0.status == "uploaded" || $0.status == "done" }
        && noteStatus != "generating"
        && !isGenerating
    }

    private var uploadedCount: Int {
        segments.filter { $0.status == "uploaded" || $0.status == "done" }.count
    }

    private var micLabel: String {
        if recorder.isRecording { return "Stop" }
        return segments.isEmpty ? "Record" : "Record More"
    }

    @State private var isPulsing = false

    var body: some View {
        VStack(spacing: 12) {
            // Mic button + label
            HStack(spacing: 16) {
                Button {
                    Task { await toggleRecording() }
                } label: {
                    VStack(spacing: 4) {
                        ZStack {
                            if recorder.isRecording {
                                Circle()
                                    .fill(Color.red.opacity(0.2))
                                    .frame(width: 64, height: 64)
                                    .scaleEffect(isPulsing ? 1.3 : 1.0)
                                    .opacity(isPulsing ? 0 : 0.6)
                                    .animation(.easeInOut(duration: 1.0).repeatForever(autoreverses: false), value: isPulsing)
                            }
                            Image(systemName: recorder.isRecording ? "stop.circle.fill" : "mic.circle.fill")
                                .font(.system(size: 48))
                                .foregroundStyle(recorder.isRecording ? .red : Theme.gold)
                        }
                        Text(micLabel)
                            .font(.caption.weight(.medium))
                            .foregroundStyle(recorder.isRecording ? .red : Theme.gold)
                    }
                }
                .disabled(isUploading)
                .onChange(of: recorder.isRecording) { _, recording in
                    isPulsing = recording
                }

                if recorder.isRecording {
                    Text(formatDuration(recorder.duration))
                        .font(.system(.title3, design: .monospaced))
                        .foregroundStyle(.red)
                }

                Spacer()

                // Recording count + re-record
                if !segments.isEmpty && !recorder.isRecording {
                    VStack(spacing: 4) {
                        Text("\(uploadedCount) recording\(uploadedCount == 1 ? "" : "s")")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Button("Re-record") {
                            showReRecordAlert = true
                        }
                        .font(.caption2)
                        .foregroundStyle(.red)
                    }
                }

                // Generate button
                if canGenerate {
                    Button {
                        Task { await generate() }
                    } label: {
                        if isGenerating {
                            ProgressView()
                                .tint(.white)
                        } else {
                            Label("Generate", systemImage: "sparkles")
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Theme.plum)
                    .disabled(isGenerating)
                }

                if noteStatus == "generating" {
                    HStack(spacing: 6) {
                        ProgressView()
                        Text("Generating...")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            if permissionDenied {
                Text("Microphone access denied. Open Settings to enable.")
                    .font(.caption)
                    .foregroundStyle(.red)
            }

            if isUploading {
                HStack(spacing: 6) {
                    ProgressView()
                    Text("Uploading audio...")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding()
        .background(.gray.opacity(0.05), in: RoundedRectangle(cornerRadius: 12))
        .onAppear { startListening() }
        .onDisappear { segmentListener?.remove() }
        .alert("Re-record?", isPresented: $showReRecordAlert) {
            Button("Cancel", role: .cancel) {}
            Button("Discard & Re-record", role: .destructive) {
                Task { await reRecord() }
            }
        } message: {
            Text("This deletes all recordings and generated notes. You'll start fresh.")
        }
    }

    // MARK: - Recording

    private func toggleRecording() async {
        if recorder.isRecording {
            await stopAndUpload()
        } else {
            let granted = await AudioRecorderService.requestPermission()
            if granted {
                permissionDenied = false
                try? recorder.start()
            } else {
                permissionDenied = true
            }
        }
    }

    private func stopAndUpload() async {
        guard let uid = auth.user?.uid,
              let fileURL = recorder.stop() else { return }

        let segmentId = UUID().uuidString.lowercased()
        let sequence = segments.count

        isUploading = true
        defer { isUploading = false }

        do {
            // Create segment doc.
            try await FirestoreService.createSegment(
                clinicianUid: uid,
                noteId: noteId,
                segmentId: segmentId,
                sequence: sequence
            )

            // Upload audio.
            let storagePath = try await StorageService.uploadSegment(
                noteId: noteId,
                segmentId: segmentId,
                fileURL: fileURL,
                clinicianUid: uid
            )

            // Mark uploaded.
            try await FirestoreService.updateSegmentUploaded(
                clinicianUid: uid,
                noteId: noteId,
                segmentId: segmentId,
                storagePath: storagePath
            )
        } catch {
            print("Upload failed: \(error.localizedDescription)")
        }
    }

    // MARK: - Generate

    private func generate() async {
        isGenerating = true
        defer { isGenerating = false }
        do {
            try await FirestoreService.generateNote(noteId: noteId)
        } catch {
            print("Generate failed: \(error.localizedDescription)")
        }
    }

    // MARK: - Re-record

    private func reRecord() async {
        guard let uid = auth.user?.uid else { return }
        do {
            try await FirestoreService.deleteAllSegments(clinicianUid: uid, noteId: noteId)
        } catch {
            print("Re-record failed: \(error.localizedDescription)")
        }
    }

    // MARK: - Listener

    private func startListening() {
        guard let uid = auth.user?.uid else { return }
        let col = FirestoreService.segmentsCollection(clinicianUid: uid, noteId: noteId)
        segmentListener = col.order(by: "sequence").addSnapshotListener { snap, _ in
            segments = snap?.documents.compactMap { try? $0.data(as: Segment.self) } ?? []
        }
    }

    // MARK: - Helpers

    private func formatDuration(_ t: TimeInterval) -> String {
        let mins = Int(t) / 60
        let secs = Int(t) % 60
        return String(format: "%d:%02d", mins, secs)
    }
}
