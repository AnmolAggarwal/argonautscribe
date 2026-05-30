import SwiftUI

/// A single field row: picklist selector + qualifier text input.
struct FieldRowView: View {
    let field: TemplateField
    let value: FieldValue?
    let onChange: (FieldValue) -> Void

    @State private var selectedPicklist: String?
    @State private var selectedMulti: Set<String> = []
    @State private var qualifier: String = ""
    @State private var showPicker = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            // Label
            HStack {
                Text(field.label)
                    .font(.subheadline.weight(.medium))
                if field.required {
                    Text("*")
                        .foregroundStyle(.red)
                }

                Spacer()

                // Confidence badge
                if let conf = value?.aiConfidence, conf != "missing" {
                    Text(conf)
                        .font(.caption2)
                        .foregroundStyle(conf == "high" ? .green : .orange)
                }
            }

            // Picklist (if any)
            if let picklist = field.picklist {
                if picklist.kind == "single" {
                    picklistButton(options: picklist.options ?? [])
                } else if picklist.kind == "multi" {
                    multiSelectButton(options: picklist.options ?? [])
                }
            }

            // Qualifier (if allowed)
            if field.qualifier?.allowed == true {
                TextField(field.qualifier?.placeholder ?? "Details...", text: $qualifier)
                    .textFieldStyle(.roundedBorder)
                    .font(.callout)
                    .onSubmit { emitChange() }
            }
        }
        .padding(.vertical, 4)
        .onAppear { syncFromValue() }
        .onChange(of: value?.picklist?.displayString) { _, _ in syncFromValue() }
    }

    // MARK: - Single-select

    @ViewBuilder
    private func picklistButton(options: [String]) -> some View {
        Menu {
            ForEach(options, id: \.self) { option in
                Button(option) {
                    selectedPicklist = option
                    emitChange()
                }
            }
            Divider()
            Button("Clear", role: .destructive) {
                selectedPicklist = nil
                emitChange()
            }
        } label: {
            HStack {
                Text(selectedPicklist ?? "Select...")
                    .foregroundStyle(selectedPicklist != nil ? .primary : .secondary)
                Spacer()
                Image(systemName: "chevron.up.chevron.down")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(.gray.opacity(0.08), in: RoundedRectangle(cornerRadius: 8))
        }
    }

    // MARK: - Multi-select

    @ViewBuilder
    private func multiSelectButton(options: [String]) -> some View {
        Button {
            showPicker = true
        } label: {
            HStack {
                if selectedMulti.isEmpty {
                    Text("Select...")
                        .foregroundStyle(.secondary)
                } else {
                    Text(selectedMulti.sorted().joined(separator: ", "))
                        .foregroundStyle(.primary)
                        .lineLimit(2)
                }
                Spacer()
                Image(systemName: "chevron.up.chevron.down")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(.gray.opacity(0.08), in: RoundedRectangle(cornerRadius: 8))
        }
        .sheet(isPresented: $showPicker) {
            multiSelectSheet(options: options)
        }
    }

    @ViewBuilder
    private func multiSelectSheet(options: [String]) -> some View {
        NavigationStack {
            List {
                ForEach(options, id: \.self) { option in
                    Button {
                        if selectedMulti.contains(option) {
                            selectedMulti.remove(option)
                        } else {
                            selectedMulti.insert(option)
                        }
                    } label: {
                        HStack {
                            Text(option)
                                .foregroundStyle(.primary)
                            Spacer()
                            if selectedMulti.contains(option) {
                                Image(systemName: "checkmark")
                                    .foregroundStyle(.blue)
                            }
                        }
                    }
                }
            }
            .navigationTitle(field.label)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        showPicker = false
                        emitChange()
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    // MARK: - Sync

    private func syncFromValue() {
        qualifier = value?.qualifier ?? ""
        guard let pv = value?.picklist else {
            selectedPicklist = nil
            selectedMulti = []
            return
        }
        switch pv {
        case .string(let s):
            selectedPicklist = s
        case .array(let a):
            selectedMulti = Set(a)
        case .number(let n):
            selectedPicklist = String(Int(n))
        case .bool(let b):
            selectedPicklist = b ? "Yes" : "No"
        }
    }

    private func emitChange() {
        var pv: PicklistValue?
        if field.picklist?.kind == "multi" {
            pv = selectedMulti.isEmpty ? nil : .array(Array(selectedMulti.sorted()))
        } else if let s = selectedPicklist {
            pv = .string(s)
        }

        let fv = FieldValue(
            picklist: pv,
            qualifier: qualifier.isEmpty ? nil : qualifier,
            aiConfidence: nil,
            source: "user"
        )
        onChange(fv)
    }
}
