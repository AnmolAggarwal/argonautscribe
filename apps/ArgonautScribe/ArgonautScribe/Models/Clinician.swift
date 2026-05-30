import Foundation
import FirebaseFirestore

/// Mirrors /clinicians/{uid} in Firestore.
struct Clinician: Codable {
    let email: String
    let displayName: String
    let role: String
    let practiceId: String
    let defaultTemplateId: String?
    @ServerTimestamp var createdAt: Timestamp?

    enum CodingKeys: String, CodingKey {
        case email
        case displayName = "display_name"
        case role
        case practiceId = "practice_id"
        case defaultTemplateId = "default_template_id"
        case createdAt = "created_at"
    }
}
