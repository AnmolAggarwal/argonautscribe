import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import type { AudioSegment } from "@argonaut/shared";
import { db } from "../lib/firebase";
import { useRecorder } from "../lib/recorder";
import {
  clearAudioAndTranscript,
  createSegmentAndUpload,
  setNoteStatus,
} from "../lib/segments";

interface Props {
  clinicianUid: string;
  noteId: string;
  noteStatus: string;
}

/**
 * Recording controls + segment list for the note workspace.
 *
 * State is split: the MediaRecorder lives in the useRecorder hook
 * (mic stream, blob accumulation, duration ticker); segment metadata
 * comes from Firestore via onSnapshot so we see uploads from other
 * tabs / devices. Upload is triggered ONLY from button click handlers
 * — never from a useEffect (React StrictMode trap, SPEC §20.4 #4).
 *
 * Concurrency: while a segment is uploading the Record button is
 * disabled. Per-note serialization (SPEC §20.4 #6) is enforced
 * Cloud-Function-side in step 4; for step 3 we just keep the UI
 * from racing.
 */
export function RecordingPanel({ clinicianUid, noteId, noteStatus }: Props) {
  const { state, duration, error, start, stop } = useRecorder();
  const [segments, setSegments] = useState<AudioSegment[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, "clinicians", clinicianUid, "notes", noteId, "segments"),
      orderBy("sequence", "asc"),
    );
    const unsub = onSnapshot(
      q,
      (snap) => setSegments(snap.docs.map((d) => d.data() as AudioSegment)),
      (err) => console.error("Segments listener:", err),
    );
    return unsub;
  }, [clinicianUid, noteId]);

  async function handleStart(): Promise<void> {
    if (busy || state !== "idle") return;
    setUploadError(null);
    await setNoteStatus(clinicianUid, noteId, "recording");
    await start();
  }

  async function handleStop(): Promise<void> {
    if (state !== "recording") return;
    setBusy(true);
    try {
      const result = await stop();
      if (!result) {
        setBusy(false);
        return;
      }
      const sequence = segments.length + 1;
      await createSegmentAndUpload({
        clinicianUid,
        noteId,
        blob: result.blob,
        mimeType: result.mimeType,
        durationMs: result.durationMs,
        sequence,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Stop/upload failed:", err);
      setUploadError(message);
      // Revert note status if we'd flipped it to "recording".
      await setNoteStatus(clinicianUid, noteId, "error").catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  async function handleRerecord(): Promise<void> {
    if (busy || state !== "idle") return;
    const ok = window.confirm(
      "Re-record will delete the audio and transcript for this note. Picklist selections and qualifier text you've entered are kept. Continue?",
    );
    if (!ok) return;
    setBusy(true);
    try {
      await clearAudioAndTranscript(clinicianUid, noteId);
    } catch (err) {
      console.error("Re-record failed:", err);
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const totalSec = segments.reduce((acc, s) => acc + (s.duration_ms ?? 0) / 1000, 0);
  const hasSegments = segments.length > 0;
  const recordDisabled = busy || state !== "idle";

  return (
    <section
      style={{
        background: "#fafafa",
        border: "1px solid #eee",
        borderRadius: 4,
        padding: "0.75rem 1rem",
        marginBottom: "1.5rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
        {state === "recording" ? (
          <button
            onClick={() => void handleStop()}
            style={{
              padding: "0.6rem 1.1rem",
              background: "crimson",
              color: "white",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            ■ Stop
          </button>
        ) : (
          <button
            onClick={() => void handleStart()}
            disabled={recordDisabled}
            style={{
              padding: "0.6rem 1.1rem",
              cursor: recordDisabled ? "not-allowed" : "pointer",
              background: recordDisabled ? "#eee" : "white",
            }}
          >
            ● {hasSegments ? "Augment recording" : "Record"}
          </button>
        )}

        {hasSegments && state === "idle" && !busy ? (
          <button onClick={() => void handleRerecord()} style={{ padding: "0.6rem 1rem" }}>
            ↻ Re-record (clean)
          </button>
        ) : null}

        <div style={{ marginLeft: "auto", color: "#666", fontSize: "0.9rem" }}>
          {state === "recording" ? (
            <span style={{ color: "crimson" }}>
              ● Recording {formatSeconds(duration)}
            </span>
          ) : busy ? (
            <span>Uploading…</span>
          ) : hasSegments ? (
            <span>
              {segments.length} segment{segments.length === 1 ? "" : "s"} ·{" "}
              {formatSeconds(Math.round(totalSec))} total · status: {noteStatus}
            </span>
          ) : (
            <span>No audio yet · status: {noteStatus}</span>
          )}
        </div>
      </div>

      {(error || uploadError) && (
        <div
          style={{
            marginTop: "0.5rem",
            color: "crimson",
            fontSize: "0.85rem",
          }}
        >
          {error || uploadError}
        </div>
      )}

      {hasSegments && (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: "0.75rem 0 0 0",
            fontSize: "0.8rem",
            color: "#666",
          }}
        >
          {segments.map((s) => (
            <li key={s.segment_id} style={{ padding: "0.2rem 0" }}>
              #{s.sequence} · {formatSeconds(Math.round((s.duration_ms ?? 0) / 1000))} ·{" "}
              status: {s.status}
              {s.error_message ? (
                <span style={{ color: "crimson", marginLeft: "0.5rem" }}>
                  · {s.error_message}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
