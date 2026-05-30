import type { FieldValue, TemplateField } from "@argonaut/shared";
import { reviewLevel } from "@argonaut/shared";

interface Props {
  field: TemplateField;
  value: FieldValue | null;
  onChange: (next: FieldValue) => void;
}

/**
 * A single editable row in the note workspace. Renders the picklist
 * control (none / single-select / multi-select / numeric) plus an
 * optional free-text qualifier input, on one row, matching the
 * FieldValue shape.
 *
 * Writes go through onChange; the workspace handles Firestore
 * persistence and final-note re-rendering.
 */
export function FieldRow({ field, value, onChange }: Props) {
  const picklist = value?.picklist ?? null;
  const qualifier = value?.qualifier ?? "";
  const level = reviewLevel(field, value ?? undefined);

  function emit(
    patch: Partial<Pick<FieldValue, "picklist" | "qualifier">>,
  ): void {
    const next: FieldValue = {
      picklist: "picklist" in patch ? patch.picklist! : picklist,
      qualifier: "qualifier" in patch ? patch.qualifier! : (qualifier === "" ? null : qualifier),
      ai_confidence: value?.ai_confidence ?? null,
      source: "user",
      mapping_status: "exact",
    };
    onChange(next);
  }

  const borderColor =
    level === "red" ? "#e53e3e" : level === "yellow" ? "#d69e2e" : "#eee";
  const bgColor =
    level === "red" ? "#fff5f5" : level === "yellow" ? "#fffff0" : "#fafafa";

  return (
    <div
      style={{
        marginBottom: "0.75rem",
        padding: "0.75rem",
        border: `1px solid ${borderColor}`,
        borderRadius: 4,
        background: bgColor,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <label
          style={{
            fontWeight: 600,
            fontSize: "0.95rem",
            flex: 1,
          }}
        >
          {field.label}
          {field.required ? <span style={{ color: "crimson" }}> *</span> : null}
        </label>
        {level !== "none" && (
          <span
            style={{
              fontSize: "0.7rem",
              fontWeight: 600,
              padding: "0.15rem 0.4rem",
              borderRadius: 3,
              color: "white",
              background: level === "red" ? "#e53e3e" : "#d69e2e",
            }}
          >
            {level === "red" ? "Review" : "Check"}
          </span>
        )}
      </div>

      {renderPicklistControl(field, picklist, (next) => emit({ picklist: next }))}

      {field.qualifier?.allowed ? (
        <input
          type="text"
          value={qualifier ?? ""}
          onChange={(e) => emit({ qualifier: e.target.value === "" ? null : e.target.value })}
          placeholder={field.qualifier.placeholder ?? "Free-text qualifier…"}
          style={{
            width: "100%",
            padding: "0.4rem",
            marginTop: "0.4rem",
            boxSizing: "border-box",
          }}
        />
      ) : null}
    </div>
  );
}

function renderPicklistControl(
  field: TemplateField,
  picklist: FieldValue["picklist"],
  onPicklistChange: (next: FieldValue["picklist"]) => void,
): React.ReactNode {
  // Numeric field (no picklist options, numeric range)
  if (!field.picklist && field.numeric) {
    return (
      <input
        type="number"
        min={field.numeric.min}
        max={field.numeric.max}
        value={typeof picklist === "number" ? picklist : ""}
        onChange={(e) => {
          const raw = e.target.value;
          onPicklistChange(raw === "" ? null : Number(raw));
        }}
        style={{ width: "100%", padding: "0.4rem", boxSizing: "border-box" }}
      />
    );
  }

  if (!field.picklist) return null;

  if (field.picklist.kind === "single" && field.picklist.options) {
    return (
      <select
        value={typeof picklist === "string" ? picklist : ""}
        onChange={(e) => onPicklistChange(e.target.value === "" ? null : e.target.value)}
        style={{ width: "100%", padding: "0.4rem", boxSizing: "border-box" }}
      >
        <option value="">(none)</option>
        {field.picklist.options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }

  if (field.picklist.kind === "multi" && field.picklist.options) {
    const selected = Array.isArray(picklist) ? picklist : [];
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        {field.picklist.options.map((opt) => {
          const checked = selected.includes(opt);
          return (
            <label
              key={opt}
              style={{
                fontSize: "0.9rem",
                padding: "0.25rem 0.5rem",
                border: "1px solid #ddd",
                borderRadius: 3,
                background: checked ? "#e6f0ff" : "white",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...selected, opt]
                    : selected.filter((x) => x !== opt);
                  onPicklistChange(next.length === 0 ? null : next);
                }}
                style={{ marginRight: "0.25rem" }}
              />
              {opt}
            </label>
          );
        })}
      </div>
    );
  }

  return null;
}
