import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import type { Note } from "@argonaut/shared";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/auth";

/**
 * Notes list — the post-auth landing screen.
 *
 * Subscribes to /clinicians/{uid}/notes ordered by created_at desc. For
 * phase 2b this is intentionally empty (no New Note action, no per-note
 * navigation). Phase 2c adds the workspace screen and the create flow.
 */
export function NotesList() {
  const { user, clinician, signOut } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "clinicians", user.uid, "notes"),
      orderBy("created_at", "desc"),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setNotes(snap.docs.map((d) => d.data() as Note));
      },
      (err) => {
        console.error("Notes listener error:", err);
      },
    );
    return unsub;
  }, [user]);

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
        disabled
        title="New Note action lands in phase 2c"
        style={{ padding: "0.6rem 1rem", marginBottom: "1.5rem" }}
      >
        + New Note (coming in phase 2c)
      </button>

      {notes.length === 0 ? (
        <p style={{ color: "#666" }}>
          No notes yet. Once the New Note action is wired in phase 2c, your notes will appear here.
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {notes.map((n) => (
            <li
              key={n.note_id}
              style={{
                padding: "0.75rem",
                borderBottom: "1px solid #eee",
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>{n.template_id}</span>
              <span style={{ color: "#888", fontSize: "0.85rem" }}>{n.status}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
