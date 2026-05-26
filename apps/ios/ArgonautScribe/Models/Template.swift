import Foundation
import FirebaseFirestore

/// Mirrors /practices/{pid}/templates/{tid} in Firestore.
struct Template: Identifiable, Codable {
    @DocumentID var id: String?
    let templateId: String
    let name: String
    let version: Int
    let fields: [TemplateField]
    let formatString: String
    let fewShotExamples: [FewShotExample]
    let keywords: [String]
    let systemPromptOverride: String?
    @ServerTimestamp var createdAt: Timestamp?
    @ServerTimestamp var updatedAt: Timestamp?

    enum CodingKeys: String, CodingKey {
        case id
        case templateId = "template_id"
        case name
        case version
        case fields
        case formatString = "format_string"
        case fewShotExamples = "few_shot_examples"
        case keywords
        case systemPromptOverride = "system_prompt_override"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

struct TemplateField: Codable, Identifiable {
    var id: String { name }
    let name: String
    let label: String
    let required: Bool
    let picklist: PicklistSpec?
    let qualifier: QualifierSpec?
    let numeric: NumericSpec?
}

struct PicklistSpec: Codable {
    let kind: String          // "single" or "multi"
    let source: String        // "inline", "providers", "assistants"
    let options: [String]?
    let `default`: String?    // nullable default

    enum CodingKeys: String, CodingKey {
        case kind, source, options
        case `default` = "default"
    }
}

struct QualifierSpec: Codable {
    let allowed: Bool
    let placeholder: String?
}

struct NumericSpec: Codable {
    let min: Int
    let max: Int
}

struct FewShotExample: Codable {
    let transcript: String
    let expectedFieldValues: [String: FieldValue]

    enum CodingKeys: String, CodingKey {
        case transcript
        case expectedFieldValues = "expected_field_values"
    }
}
