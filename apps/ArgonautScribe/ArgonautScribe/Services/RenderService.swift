import Foundation

/// Format-string renderer — Swift port of shared/src/format.ts.
/// Keep in sync with the TypeScript version. Both are <100 lines.
enum RenderService {

    static func render(template: Template, fieldValues: [String: FieldValue]) -> String {
        if !template.formatString.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return renderWithFormatString(template: template, fieldValues: fieldValues)
        }
        return renderFallback(template: template, fieldValues: fieldValues)
    }

    // MARK: - Format-string renderer

    private static func renderWithFormatString(
        template: Template,
        fieldValues: [String: FieldValue]
    ) -> String {
        // Build lookup: field_name -> rendered text.
        var rendered: [String: String] = [:]
        for field in template.fields {
            rendered[field.name] = renderFieldValue(fieldValues[field.name])
        }

        // Track which fields are referenced in the format string.
        var referenced = Set<String>()

        let lines = template.formatString.components(separatedBy: "\n")
        var output: [String] = []

        let regex = try! NSRegularExpression(pattern: #"\{(\w+)\}"#)

        for line in lines {
            let range = NSRange(line.startIndex..., in: line)
            let matches = regex.matches(in: line, range: range)

            if matches.isEmpty {
                // Static line — always include.
                output.append(line)
                continue
            }

            // Track referenced fields.
            for match in matches {
                if let fieldRange = Range(match.range(at: 1), in: line) {
                    referenced.insert(String(line[fieldRange]))
                }
            }

            // Check if ALL placeholders are empty.
            let allEmpty = matches.allSatisfy { match in
                guard let fieldRange = Range(match.range(at: 1), in: line) else { return true }
                let fieldName = String(line[fieldRange])
                return (rendered[fieldName] ?? "").isEmpty
            }
            if allEmpty { continue }

            // Interpolate.
            var result = line
            for match in matches.reversed() {
                guard let fullRange = Range(match.range, in: result),
                      let fieldRange = Range(match.range(at: 1), in: result) else { continue }
                let fieldName = String(result[fieldRange])
                let value = rendered[fieldName] ?? ""
                result.replaceSubrange(fullRange, with: value)
            }
            output.append(result)
        }

        // Append unreferenced fields that have values.
        for field in template.fields {
            guard !referenced.contains(field.name) else { continue }
            if let val = rendered[field.name], !val.isEmpty {
                output.append("\(field.label): \(val)")
            }
        }

        return output.joined(separator: "\n")
    }

    // MARK: - Fallback dumb renderer

    private static func renderFallback(
        template: Template,
        fieldValues: [String: FieldValue]
    ) -> String {
        var lines: [String] = []
        for field in template.fields {
            if let line = renderFieldLine(field: field, value: fieldValues[field.name]) {
                lines.append(line)
            }
        }
        return lines.joined(separator: "\n")
    }

    private static func renderFieldLine(field: TemplateField, value: FieldValue?) -> String? {
        let picklistText = value?.picklist?.displayString ?? ""
        let qualifierText = value?.qualifier?.trimmingCharacters(in: .whitespaces) ?? ""

        if picklistText.isEmpty && qualifierText.isEmpty { return nil }
        if !picklistText.isEmpty && !qualifierText.isEmpty {
            return "\(field.label): \(picklistText), \(qualifierText)"
        }
        return "\(field.label): \(picklistText.isEmpty ? qualifierText : picklistText)"
    }

    // MARK: - Helpers

    private static func renderFieldValue(_ value: FieldValue?) -> String {
        guard let value else { return "" }
        let picklistText = value.picklist?.displayString ?? ""
        let qualifierText = value.qualifier?.trimmingCharacters(in: .whitespaces) ?? ""
        if !picklistText.isEmpty && !qualifierText.isEmpty {
            return "\(picklistText), \(qualifierText)"
        }
        return picklistText.isEmpty ? qualifierText : picklistText
    }
}
