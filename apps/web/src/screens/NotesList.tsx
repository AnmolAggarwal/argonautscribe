import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { collection, doc, getDocs, onSnapshot, orderBy, query } from "firebase/firestore";
import type { Note, PatientTag, Template } from "@argonaut/shared";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { createNote } from "../lib/notes";

/**
 * Notes list — post-auth landing screen.
 *
 * Subscribes to /clinicians/{uid}/notes ordered by created_at desc.
 * Each row shows: template name, patient tag (joined per-note from
 * patient_tags), status, age. Click a row to open the workspace.
 *
 * "+ New Note" shows a template picker if multiple templates exist,
 * or creates immediately if there's only one.
 */
export function NotesList() {
  const { user, clinician, signOut, deleteAccount } = useAuth();
  const navigate = useNavigate();
  const [notes, setNotes] = useState<Note[]>([]);
  const [tags, setTags] = useState<Record<string, string>>({});
  const [templates, setTemplates] = useState<Template[]>([]);
  const [creating, setCreating] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  // Notes listener
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "clinicians", user.uid, "notes"),
      orderBy("created_at", "desc"),
    );
    const unsub = onSnapshot(
      q,
      (snap) => setNotes(snap.docs.map((d) => d.data() as Note)),
      (err) => console.error("Notes listener:", err),
    );
    return unsub;
  }, [user]);

  // Fetch available templates for this practice.
  useEffect(() => {
    if (!clinician) return;
    const templatesRef = collection(db, "practices", clinician.practice_id, "templates");
    getDocs(templatesRef)
      .then((snap) => setTemplates(snap.docs.map((d) => d.data() as Template)))
      .catch((err) => console.error("Templates fetch:", err));
  }, [clinician]);

  // Build a quick lookup: template_id → template name for the notes list.
  const templateNames: Record<string, string> = {};
  for (const t of templates) templateNames[t.template_id] = t.name;

  // Per-note tag listeners. One `onSnapshot` per visible note. The
  // patient_tags subcollection forbids list queries (CLAUDE.md §7), so
  // we read one doc at a time. At 50 notes/day this is fine.
  useEffect(() => {
    if (!user) return;
    const unsubs = notes.map((n) =>
      onSnapshot(doc(db, "clinicians", user.uid, "patient_tags", n.note_id), (snap) => {
        const t = snap.exists() ? (snap.data() as PatientTag).tag : "";
        setTags((prev) => ({ ...prev, [n.note_id]: t }));
      }),
    );
    return () => unsubs.forEach((u) => u());
  }, [user, notes]);

  function handleNewNoteClick(): void {
    if (!user || !clinician || creating) return;
    if (templates.length === 1) {
      // Only one template — skip the picker.
      void handleCreateWithTemplate(templates[0]!.template_id);
    } else if (templates.length > 1) {
      setShowPicker(true);
    } else {
      window.alert("No templates found. Run the seed script to create one.");
    }
  }

  async function handleCreateWithTemplate(templateId: string): Promise<void> {
    if (!user || !clinician || creating) return;
    setCreating(true);
    setShowPicker(false);
    try {
      const noteId = await createNote(user.uid, clinician.practice_id, templateId);
      navigate(`/notes/${noteId}`);
    } catch (err) {
      console.error("createNote failed:", err);
      window.alert(`Could not create note: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCreating(false);
    }
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const todayNotes = notes.filter((n) => n.date_iso === todayIso);
  const olderNotes = notes.filter((n) => n.date_iso !== todayIso);

  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "2rem 1.5rem",
        fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif",
        color: "#1a1a1a",
      }}
    >
      {/* Header */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "2rem",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: "1.6rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
            Argonaut Scribe
          </h1>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "#888" }}>
            {clinician?.display_name ?? user?.email}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <button
            onClick={() => void signOut()}
            style={{
              padding: "0.4rem 0.9rem",
              fontSize: "0.8rem",
              border: "1px solid #ddd",
              borderRadius: 6,
              background: "white",
              color: "#666",
              cursor: "pointer",
            }}
          >
            Sign out
          </button>
          <button
            onClick={() => {
              if (window.confirm("Delete your account? This permanently removes all notes, recordings, and data. This cannot be undone.")) {
                void deleteAccount().catch((err) => {
                  window.alert(`Delete failed: ${err instanceof Error ? err.message : String(err)}`);
                });
              }
            }}
            style={{
              padding: "0.4rem 0.9rem",
              fontSize: "0.8rem",
              border: "1px solid #e53e3e",
              borderRadius: 6,
              background: "white",
              color: "#e53e3e",
              cursor: "pointer",
            }}
          >
            Delete Account
          </button>
        </div>
      </header>

      {/* New Note button */}
      <div style={{ position: "relative", display: "inline-block", marginBottom: "1.75rem" }}>
        <button
          onClick={handleNewNoteClick}
          disabled={creating}
          style={{
            padding: "0.65rem 1.25rem",
            fontSize: "0.9rem",
            fontWeight: 600,
            border: "none",
            borderRadius: 8,
            background: creating ? "#ccc" : "#2563eb",
            color: "white",
            cursor: creating ? "wait" : "pointer",
            boxShadow: "0 1px 3px rgba(37,99,235,0.3)",
          }}
        >
          {creating ? "Creating…" : "+ New Note"}
        </button>

        {showPicker && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              marginTop: 6,
              background: "white",
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
              zIndex: 10,
              minWidth: 260,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "0.6rem 0.85rem",
                fontSize: "0.75rem",
                fontWeight: 600,
                color: "#999",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                borderBottom: "1px solid #f0f0f0",
              }}
            >
              Choose template
            </div>
            {templates.map((t) => (
              <button
                key={t.template_id}
                onClick={() => void handleCreateWithTemplate(t.template_id)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "0.7rem 0.85rem",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: "0.9rem",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f7f8fa")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {t.name}
              </button>
            ))}
            <button
              onClick={() => setShowPicker(false)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "center",
                padding: "0.55rem 0.85rem",
                border: "none",
                borderTop: "1px solid #f0f0f0",
                background: "transparent",
                cursor: "pointer",
                fontSize: "0.8rem",
                color: "#999",
              }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Empty state */}
      {notes.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "4rem 1rem",
            color: "#aaa",
          }}
        >
          <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>No notes yet</div>
          <p style={{ fontSize: "0.95rem", margin: 0 }}>
            Click <strong>+ New Note</strong> to start your first note.
          </p>
        </div>
      ) : (
        <>
          {/* Today's notes */}
          {todayNotes.length > 0 && (
            <section style={{ marginBottom: "2rem" }}>
              <div
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: "#999",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: "0.6rem",
                }}
              >
                Today &middot; {todayNotes.length} note{todayNotes.length === 1 ? "" : "s"}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {todayNotes.map((n) => (
                  <NoteCard
                    key={n.note_id}
                    note={n}
                    tag={tags[n.note_id]}
                    templateName={templateNames[n.template_id] ?? n.template_id}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Older notes */}
          {olderNotes.length > 0 && (
            <section>
              <div
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: "#999",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: "0.6rem",
                }}
              >
                Earlier
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {olderNotes.map((n) => (
                  <NoteCard
                    key={n.note_id}
                    note={n}
                    tag={tags[n.note_id]}
                    templateName={templateNames[n.template_id] ?? n.template_id}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}

// --- Status badge styling ---

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  new:        { bg: "#f3f4f6", color: "#6b7280", label: "New" },
  generating: { bg: "#dbeafe", color: "#2563eb", label: "Generating" },
  ready:      { bg: "#dcfce7", color: "#16a34a", label: "Ready" },
  edited:     { bg: "#fef9c3", color: "#a16207", label: "Edited" },
  error:      { bg: "#fee2e2", color: "#dc2626", label: "Error" },
  filed:      { bg: "#f3f4f6", color: "#9ca3af", label: "Filed" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? { bg: "#f3f4f6", color: "#6b7280", label: status };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.15rem 0.55rem",
        fontSize: "0.7rem",
        fontWeight: 600,
        borderRadius: 999,
        background: s.bg,
        color: s.color,
        textTransform: "capitalize",
        whiteSpace: "nowrap",
      }}
    >
      {s.label}
    </span>
  );
}

// --- Note card ---

function NoteCard({
  note,
  tag,
  templateName,
}: {
  note: Note;
  tag: string | undefined;
  templateName: string;
}) {
  const displayTag = tag || "Untitled";
  const hasTag = Boolean(tag);

  return (
    <Link
      to={`/notes/${note.note_id}`}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "1rem",
        padding: "0.85rem 1rem",
        background: "white",
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        textDecoration: "none",
        color: "inherit",
        transition: "box-shadow 0.15s, border-color 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "#c7d0dd";
        e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "#e5e7eb";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontWeight: 600,
            fontSize: "0.95rem",
            color: hasTag ? "#1a1a1a" : "#aaa",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            fontStyle: hasTag ? "normal" : "italic",
          }}
        >
          {displayTag}
        </div>
        <div
          style={{
            fontSize: "0.8rem",
            color: "#999",
            marginTop: "0.15rem",
          }}
        >
          {templateName} &middot; {note.date_iso}
        </div>
      </div>

      <StatusBadge status={note.status} />
    </Link>
  );
}
