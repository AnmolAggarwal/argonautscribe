import Foundation

struct ValidationIssue {
    let field: String
    let label: String
    let severity: Severity
    let message: String

    enum Severity { case blocking, warning }
}

struct ValidationResult {
    let safeToCopy: Bool
    let issues: [ValidationIssue]
}

enum ValidateService {

    static func validateNote(
        template: Template,
        fieldValues: [String: FieldValue],
        renderedNote: String
    ) -> ValidationResult {
        var issues: [ValidationIssue] = []

        for field in template.fields {
            guard let value = fieldValues[field.name] else {
                if field.required {
                    issues.append(.init(
                        field: field.name, label: field.label, severity: .blocking,
                        message: "\(field.label) is required but has no value."
                    ))
                }
                continue
            }

            if field.required
                && value.mappingStatus == "missing"
                && value.source != "user"
                && value.picklist == nil
                && (value.qualifier == nil || value.qualifier == "")
            {
                issues.append(.init(
                    field: field.name, label: field.label, severity: .blocking,
                    message: "\(field.label) is required but was not mentioned in the dictation."
                ))
            }

            if value.mappingStatus == "unmapped", field.picklist?.options != nil {
                issues.append(.init(
                    field: field.name, label: field.label, severity: .warning,
                    message: "\(field.label) was dictated but doesn't match any option. Review: \"\(value.qualifier ?? "")\""
                ))
            }
        }

        let artifacts = ["null", "undefined", "[object Object]", "NaN"]
        for artifact in artifacts {
            if renderedNote.contains(artifact) {
                issues.append(.init(
                    field: "_rendered", label: "Rendered note", severity: .blocking,
                    message: "Note text contains \"\(artifact)\" — rendering error."
                ))
                break
            }
        }

        return ValidationResult(
            safeToCopy: !issues.contains { $0.severity == .blocking },
            issues: issues
        )
    }

    static func reviewLevel(fieldRequired: Bool, value: FieldValue?) -> ReviewLevel {
        guard let value else { return fieldRequired ? .red : .none }
        if value.source == "user" { return .none }
        if value.mappingStatus == "unmapped" { return .red }
        if value.mappingStatus == "missing" && fieldRequired { return .red }
        if value.mappingStatus == "missing" && !fieldRequired { return .none }
        if value.aiConfidence == "inferred" { return .yellow }
        return .none
    }
}

enum ReviewLevel {
    case none, yellow, red
}
