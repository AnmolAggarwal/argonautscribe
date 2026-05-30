import Foundation
import FirebaseFirestore

/// Mirrors /clinicians/{uid}/patient_tags/{noteId} in Firestore.
/// THIS DOCUMENT CONTAINS PHI. Never log, never send to LLM/STT.
struct PatientTag: Codable {
    let noteId: String
    var tag: String
    var preciseTime: Timestamp?
    @ServerTimestamp var createdAt: Timestamp?

    enum CodingKeys: String, CodingKey {
        case noteId = "note_id"
        case tag
        case preciseTime = "precise_time"
        case createdAt = "created_at"
    }
}
