import Foundation
import FirebaseFirestore

/// Mirrors /clinicians/{uid}/notes/{noteId}/segments/{segmentId} in Firestore.
struct Segment: Identifiable, Codable {
    @DocumentID var id: String?
    let segmentId: String
    let noteId: String
    let sequence: Int
    var status: String       // "recording", "uploading", "uploaded", "transcribing", "done", "error"
    var storagePath: String?
    var contentType: String?
    var transcriptChunk: String?
    var errorMessage: String?
    @ServerTimestamp var createdAt: Timestamp?

    enum CodingKeys: String, CodingKey {
        case id
        case segmentId = "segment_id"
        case noteId = "note_id"
        case sequence
        case status
        case storagePath = "storage_path"
        case contentType = "content_type"
        case transcriptChunk = "transcript_chunk"
        case errorMessage = "error_message"
        case createdAt = "created_at"
    }
}
