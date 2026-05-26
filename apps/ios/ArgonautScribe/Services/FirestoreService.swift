import Foundation
import FirebaseFirestore
import FirebaseFunctions

/// Firestore reads/writes for notes, tags, templates, and segments.
/// All methods take explicit UIDs — no global auth state dependency.
enum FirestoreService {
    // nonisolated(unsafe): these Firebase singletons are internally thread-safe.
    nonisolated(unsafe) private static let db = Firestore.firestore()
    nonisolated(unsafe) private static let functions = Functions.functions(region: "us-central1")

    // MARK: - Notes

    static func notesQuery(clinicianUid: String) -> Query {
        db.collection("clinicians/\(clinicianUid)/notes")
            .order(by: "created_at", descending: true)
    }

    static func noteRef(clinicianUid: String, noteId: String) -> DocumentReference {
        db.document("clinicians/\(clinicianUid)/notes/\(noteId)")
    }

    static func createNote(
        clinicianUid: String,
        practiceId: String,
        templateId: String,
        templateVersion: Int
    ) async throws -> String {
        let noteId = UUID().uuidString.lowercased()
        let dateIso = ISO8601DateFormatter.dayOnly.string(from: Date())

        let data: [String: Any] = [
            "note_id": noteId,
            "template_id": templateId,
            "template_version": templateVersion,
            "date_iso": dateIso,
            "status": "new",
            "transcript": NSNull(),
            "field_values": [String: Any](),
            "final_note_text": NSNull(),
            "error_message": NSNull(),
            "created_at": FirebaseFirestore.FieldValue.serverTimestamp(),
            "updated_at": FirebaseFirestore.FieldValue.serverTimestamp(),
        ]

        try await noteRef(clinicianUid: clinicianUid, noteId: noteId).setData(data)
        return noteId
    }

    // MARK: - Field values

    static func writeFieldValue(
        clinicianUid: String,
        noteId: String,
        fieldName: String,
        value: [String: Any],
        finalNoteText: String
    ) async throws {
        let ref = noteRef(clinicianUid: clinicianUid, noteId: noteId)
        try await ref.updateData([
            "field_values.\(fieldName)": value,
            "final_note_text": finalNoteText,
            "status": "edited",
            "updated_at": FirebaseFirestore.FieldValue.serverTimestamp(),
        ])
    }

    // MARK: - Patient tags (PHI)

    static func patientTagRef(clinicianUid: String, noteId: String) -> DocumentReference {
        db.document("clinicians/\(clinicianUid)/patient_tags/\(noteId)")
    }

    static func writePatientTag(clinicianUid: String, noteId: String, tag: String) async throws {
        try await patientTagRef(clinicianUid: clinicianUid, noteId: noteId).setData([
            "note_id": noteId,
            "tag": tag,
            "created_at": FirebaseFirestore.FieldValue.serverTimestamp(),
        ], merge: true)
    }

    // MARK: - Templates

    static func templatesCollection(practiceId: String) -> CollectionReference {
        db.collection("practices/\(practiceId)/templates")
    }

    static func fetchTemplates(practiceId: String) async throws -> [Template] {
        let snap = try await templatesCollection(practiceId: practiceId).getDocuments()
        return snap.documents.compactMap { try? $0.data(as: Template.self) }
    }

    // MARK: - Segments

    static func segmentsCollection(clinicianUid: String, noteId: String) -> CollectionReference {
        db.collection("clinicians/\(clinicianUid)/notes/\(noteId)/segments")
    }

    static func createSegment(
        clinicianUid: String,
        noteId: String,
        segmentId: String,
        sequence: Int
    ) async throws {
        let ref = segmentsCollection(clinicianUid: clinicianUid, noteId: noteId).document(segmentId)
        try await ref.setData([
            "segment_id": segmentId,
            "note_id": noteId,
            "sequence": sequence,
            "status": "recording",
            "storage_path": NSNull(),
            "content_type": "audio/m4a",
            "transcript_chunk": NSNull(),
            "error_message": NSNull(),
            "created_at": FirebaseFirestore.FieldValue.serverTimestamp(),
        ])
    }

    static func updateSegmentUploaded(
        clinicianUid: String,
        noteId: String,
        segmentId: String,
        storagePath: String
    ) async throws {
        let ref = segmentsCollection(clinicianUid: clinicianUid, noteId: noteId).document(segmentId)
        try await ref.updateData([
            "status": "uploaded",
            "storage_path": storagePath,
        ])
    }

    // MARK: - Generate (Cloud Function)

    static func generateNote(noteId: String) async throws {
        let callable = functions.httpsCallable("generateNote")
        _ = try await callable.call(["noteId": noteId])
    }

    // MARK: - Mark Filed

    static func markFiled(
        clinicianUid: String,
        noteId: String,
        practiceId: String,
        templateId: String
    ) async throws {
        let callable = functions.httpsCallable("markFiled")
        _ = try await callable.call([
            "noteId": noteId,
            "practiceId": practiceId,
            "templateId": templateId,
        ])
    }
}

// MARK: - Helpers

extension ISO8601DateFormatter {
    /// Day-level only: "2026-05-23"
    nonisolated(unsafe) static let dayOnly: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withFullDate, .withDashSeparatorInDate]
        return f
    }()
}
