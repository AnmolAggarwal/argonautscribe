import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { render } from "@argonaut/shared";
import type { FieldValue, Note, PatientTag, Template } from "@argonaut/shared";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { markFiled, writeFieldValue, writePatientTag } from "../lib/notes";
import { FieldRow } from "../components/FieldRow";
import { RecordingPanel } from "../components/RecordingPanel";

/**
 * The note workspace — the main screen of the product.
 *
 * Left pane: field-row controls (picklist + qualifier per field).
 * Right pane: live preview of the assembled final-note text and the
 *             Copy Note / Mark Filed actions.
 * Header   : template name, status, patient tag input, back link.
 *
 * Persistence: every field change writes immediately to Firestore; the
 * Firestore listener is the source of truth (last-write-wins across
 * tabs/devices, per SPEC §20.3 step 2).
 */
export function NoteWorkspace() {
  const { noteId } = useParams<{ noteId: string }>();
  const navigate = useNavigate();
  const { user, clinician } = useAuth();
  const [note, setNote] = useState<Note | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);
  const [tag, setTag] = useState<string>("");
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");

  // Subscribe to the note doc.
  useEffect(() => {
    if (!user || !noteId) return;
    const unsub = onSnapshot(
      doc(db, "clinicians", user.uid, "notes", noteId),
      (snap) => {
        if (snap.exists()) {
          setNote(snap.data() as Note);
        } else {
          // Note was deleted (filed / discarded). Return to list.
          navigate("/", { replace: true });
        }
      },
      (err) => console.error("Note listener:", err),
    );
    return unsub;
  }, [user, noteId, navigate]);

  // Fetch the template once we know which version this note was created against.
  useEffect(() => {
    if (!note || !clinician) return;
    if (
      template &&
      template.template_id === note.template_id &&
      template.version === note.template_version
    ) {
      return;
    }
    // For MVP we read the current template doc. If the template has been
    // edited since this note was created we should fall back to the
    // versioned archive at /practices/{pid}/templates/{tid}/versions/{v}
    // — that's a refinement we'll add when versioning becomes relevant
    // (real templates land in step 6).
    const ref = doc(db, "practices", clinician.practice_id, "templates", note.template_id);
    getDoc(ref)
      .then((snap) => {
        if (snap.exists()) setTemplate(snap.data() as Template);
      })
      .catch((err) => console.error("Template fetch:", err));
  }, [note, clinician, template]);

  // Subscribe to the patient tag doc (PHI — isolated subcollection).
  useEffect(() => {
    if (!user || !noteId) return;
    const unsub = onSnapshot(
      doc(db, "clinicians", user.uid, "patient_tags", noteId),
      (snap) => {
        setTag(snap.exists() ? (snap.data() as PatientTag).tag : "");
      },
      (err) => console.error("Tag listener:", err),
    );
    return unsub;
  }, [user, noteId]);

  const renderedNote = useMemo(() => {
    if (!template || !note) return "";
    return render(template, note.field_values);
  }, [template, note]);

  if (!user || !clinician || !note || !template) {
    return (
      <main style={{ padding: "2rem", fontFamily: "system-ui", color: "#666" }}>
        Loading…
      </main>
    );
  }

  async function handleFieldChange(fieldName: string, value: FieldValue): Promise<void> {
    if (!user || !template || !note) return;
    const nextValues = { ...note.field_values, [fieldName]: value };
    const nextText = render(template, nextValues);
    try {
      await writeFieldValue(user.uid, note.note_id, fieldName, value, nextText);
    } catch (err) {
      console.error("writeFieldValue failed:", err);
    }
  }

  async function handleTagBlur(): Promise<void> {
    if (!user || !note) return;
    try {
      await writePatientTag(user.uid, note.note_id, tag);
    } catch (err) {
      console.error("writePatientTag failed:", err);
    }
  }

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(renderedNote);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1500);
    } catch (err) {
      console.error("Clipboard write failed:", err);
    }
  }

  async function handleMarkFiled(): Promise<void> {
    if (!user || !clinician || !note) return;
    const ok = window.confirm(
      "Mark this note filed? This deletes the note, transcript, audio segments, and patient tag. This cannot be undone.",
    );
    if (!ok) return;
    try {
      await markFiled(user.uid, note.note_id, clinician.practice_id, note.template_id);
      navigate("/", { replace: true });
    } catch (err) {
      console.error("markFiled failed:", err);
      window.alert(`Failed to file: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <main
      style={{
        maxWidth: 1100,
        margin: "1rem auto",
        padding: "0 1rem",
        fontFamily: "system-ui",
      }}
    >
      <Link to="/" style={{ fontSize: "0.85rem", color: "#666" }}>
        ← Back to Notes
      </Link>

      <header
        style={{
          marginTop: "0.5rem",
          marginBottom: "1.5rem",
          paddingBottom: "1rem",
          borderBottom: "1px solid #eee",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <h1 style={{ margin: 0 }}>{template.name}</h1>
          <span
            style={{
              fontSize: "0.85rem",
              color: "#666",
              padding: "0.2rem 0.5rem",
              border: "1px solid #ddd",
              borderRadius: 3,
            }}
          >
            {note.status}
          </span>
        </div>

        <div style={{ marginTop: "0.75rem" }}>
          <label style={{ fontSize: "0.9rem", color: "#666" }}>
            Patient tag (PHI — never sent to STT or LLM)
            <input
              type="text"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              onBlur={handleTagBlur}
              placeholder="e.g. Sarah J — #14"
              style={{
                width: "100%",
                padding: "0.4rem",
                marginTop: "0.25rem",
                boxSizing: "border-box",
              }}
            />
          </label>
        </div>
      </header>

      <RecordingPanel
        clinicianUid={user.uid}
        noteId={note.note_id}
        noteStatus={note.status}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem" }}>
        <section>
          <h3 style={{ marginTop: 0 }}>Fields</h3>
          {template.fields.map((field) => (
            <FieldRow
              key={field.name}
              field={field}
              value={note.field_values[field.name] ?? null}
              onChange={(v) => void handleFieldChange(field.name, v)}
            />
          ))}
        </section>

        <section>
          <h3 style={{ marginTop: 0 }}>Preview</h3>
          <pre
            style={{
              background: "#f5f5f5",
              padding: "1rem",
              borderRadius: 4,
              whiteSpace: "pre-wrap",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: "0.9rem",
              minHeight: 200,
              color: renderedNote ? "inherit" : "#999",
            }}
          >
            {renderedNote || "(empty — fill in fields to see the assembled note)"}
          </pre>

          <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
            <button
              onClick={() => void handleCopy()}
              disabled={!renderedNote}
              style={{
                padding: "0.6rem 1rem",
                flex: 1,
                cursor: renderedNote ? "pointer" : "not-allowed",
              }}
            >
              {copyState === "copied" ? "Copied!" : "Copy Note"}
            </button>
            <button
              onClick={() => void handleMarkFiled()}
              style={{
                padding: "0.6rem 1rem",
                color: "crimson",
                borderColor: "crimson",
                background: "white",
              }}
            >
              Mark Filed
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
