import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import type { Note, PatientTag } from "@argonaut/shared";
import { TOY_TEMPLATE_ID } from "@argonaut/shared";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { createNote } from "../lib/notes";

/**
 * Notes list — post-auth landing screen.
 *
 * Subscribes to /clinicians/{uid}/notes ordered by created_at desc.
 * Each row shows: template_id, patient tag (joined per-note from
 * patient_tags), status, age. Click a row to open the workspace.
 *
 * "+ New Note" creates a note against the toy template for now. The
 * template picker lands when real templates do (step 6).
 */
export function NotesList() {
  const { user, clinician, signOut } = useAuth();
  const navigate = useNavigate();
  const [notes, setNotes] = useState<Note[]>([]);
  const [tags, setTags] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);

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

  async function handleNewNote(): Promise<void> {
    if (!user || !clinician || creating) return;
    setCreating(true);
    try {
      const templateId = clinician.default_template_id ?? TOY_TEMPLATE_ID;
      const noteId = await createNote(user.uid, clinician.practice_id, templateId);
      navigate(`/notes/${noteId}`);
    } catch (err) {
      console.error("createNote failed:", err);
      window.alert(`Could not create note: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 800,
        margin: "2rem auto",
        padding: "0 1rem",
        fontFamily: "system-ui",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "1.5rem",
          borderBottom: "1px solid #eee",
          paddingBottom: "1rem",
        }}
      >
        <h1 style={{ margin: 0 }}>Notes</h1>
        <div style={{ fontSize: "0.9rem", color: "#666" }}>
          <span>{clinician?.display_name ?? user?.email}</span>
          <button
            onClick={() => void signOut()}
            style={{ marginLeft: "1rem", padding: "0.4rem 0.75rem" }}
          >
            Sign out
          </button>
        </div>
      </header>

      <button
        onClick={() => void handleNewNote()}
        disabled={creating}
        style={{ padding: "0.6rem 1rem", marginBottom: "1.5rem", cursor: creating ? "wait" : "pointer" }}
      >
        {creating ? "Creating…" : "+ New Note"}
      </button>

      {notes.length === 0 ? (
        <p style={{ color: "#666" }}>No notes yet. Click "+ New Note" to create one.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {notes.map((n) => (
            <li key={n.note_id} style={{ borderBottom: "1px solid #eee" }}>
              <Link
                to={`/notes/${n.note_id}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 2fr 100px 100px",
                  gap: "1rem",
                  padding: "0.75rem 0.5rem",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <span style={{ fontWeight: 500 }}>{n.template_id}</span>
                <span style={{ color: "#666" }}>{tags[n.note_id] || "(no tag)"}</span>
                <span style={{ color: "#888", fontSize: "0.85rem" }}>{n.status}</span>
                <span style={{ color: "#888", fontSize: "0.85rem" }}>{n.date_iso}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
