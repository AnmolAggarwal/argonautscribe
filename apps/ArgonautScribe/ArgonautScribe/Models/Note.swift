import Foundation
import FirebaseFirestore

/// Mirrors /clinicians/{uid}/notes/{noteId} in Firestore.
struct Note: Identifiable, Codable {
    @DocumentID var id: String?
    let noteId: String
    let templateId: String
    let templateVersion: Int
    let dateIso: String
    var status: String
    var transcript: String?
    var fieldValues: [String: FieldValue]
    var finalNoteText: String?
    var errorMessage: String?
    @ServerTimestamp var createdAt: Timestamp?
    @ServerTimestamp var updatedAt: Timestamp?

    enum CodingKeys: String, CodingKey {
        case id
        case noteId = "note_id"
        case templateId = "template_id"
        case templateVersion = "template_version"
        case dateIso = "date_iso"
        case status
        case transcript
        case fieldValues = "field_values"
        case finalNoteText = "final_note_text"
        case errorMessage = "error_message"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

/// A single field's value — picklist + qualifier + provenance.
struct FieldValue: Codable {
    var picklist: PicklistValue?
    var qualifier: String?
    var aiConfidence: String?
    var source: String?
    var mappingStatus: String?

    enum CodingKeys: String, CodingKey {
        case picklist
        case qualifier
        case aiConfidence = "ai_confidence"
        case source
        case mappingStatus = "mapping_status"
    }
}

/// Picklist can be a string, number, boolean, array of strings, or null.
/// We use an enum with associated values for type-safe decoding.
enum PicklistValue: Codable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case array([String])

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let arr = try? container.decode([String].self) {
            self = .array(arr)
            return
        }
        if let str = try? container.decode(String.self) {
            self = .string(str)
            return
        }
        if let num = try? container.decode(Double.self) {
            self = .number(num)
            return
        }
        if let b = try? container.decode(Bool.self) {
            self = .bool(b)
            return
        }
        throw DecodingError.typeMismatch(
            PicklistValue.self,
            .init(codingPath: decoder.codingPath, debugDescription: "Cannot decode PicklistValue")
        )
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let s): try container.encode(s)
        case .number(let n): try container.encode(n)
        case .bool(let b): try container.encode(b)
        case .array(let a): try container.encode(a)
        }
    }

    /// Human-readable string for display.
    var displayString: String {
        switch self {
        case .string(let s): return s
        case .number(let n):
            return n.truncatingRemainder(dividingBy: 1) == 0
                ? String(Int(n))
                : String(n)
        case .bool(let b): return b ? "Yes" : "No"
        case .array(let a): return a.joined(separator: ", ")
        }
    }
}
