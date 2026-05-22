import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import type { AudioSegment } from "@argonaut/shared";
import { db } from "../lib/firebase";
import { useRecorder } from "../lib/recorder";
import { clearAudioAndTranscript, createSegmentAndUpload } from "../lib/segments";
import { callGenerateNote } from "../lib/notes";

interface Props {
  clinicianUid: string;
  noteId: string;
  noteStatus: string;
}

/**
 * Recording controls + segment list + Generate button.
 *
 * Under the on-demand pipeline (SPEC §20.3 step 4), recording uploads
 * audio but does NOT trigger STT. The dentist clicks Generate when
 * ready; the Cloud Function does Deepgram + Claude in one pass and
 * fills field_values. Until Generate is clicked or the note is filed,
 * stored audio sits in Cloud Storage.
 *
 * State coordination:
 *   - useRecorder owns the mic stream + duration ticker (local-only).
 *   - Segment list comes from Firestore via onSnapshot.
 *   - note.status comes from the workspace listener; we just display.
 *   - Generate button enabled iff there's audio that hasn't been
 *     transcribed yet and the note isn't already generating.
 */
export function RecordingPanel({ clinicianUid, noteId, noteStatus }: Props) {
  const { state: recState, duration, error, start, stop } = useRecorder();
  const [segments, setSegments] = useState<AudioSegment[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

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
    if (busy || recState !== "idle") return;
    setUploadError(null);
    setGenerateError(null);
    await start();
  }

  async function handleStop(): Promise<void> {
    if (recState !== "recording") return;
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
      console.error("Stop/upload failed:", err);
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleRerecord(): Promise<void> {
    if (busy || recState !== "idle") return;
    const ok = window.confirm(
      "Re-record will delete the audio and transcript for this note. Picklist selections and qualifier text you've entered are kept. Continue?",
    );
    if (!ok) return;
    setBusy(true);
    setGenerateError(null);
    try {
      await clearAudioAndTranscript(clinicianUid, noteId);
    } catch (err) {
      console.error("Re-record failed:", err);
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerate(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setGenerateError(null);
    try {
      await callGenerateNote(noteId);
      // The Cloud Function updates note.status; the workspace listener
      // picks up the new field_values and final_note_text.
    } catch (err) {
      console.error("Generate failed:", err);
      const message = err instanceof Error ? err.message : String(err);
      setGenerateError(message);
    } finally {
      setBusy(false);
    }
  }

  const totalSec = segments.reduce((acc, s) => acc + (s.duration_ms ?? 0) / 1000, 0);
  const hasSegments = segments.length > 0;
  const hasUntranscribed = segments.some(
    (s) => !s.transcript_chunk || s.transcript_chunk.length === 0,
  );
  const generating = noteStatus === "generating";
  const recordDisabled = busy || recState !== "idle" || generating;
  const generateDisabled = busy || !hasUntranscribed || generating || recState === "recording";

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
        {recState === "recording" ? (
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

        {hasSegments && recState === "idle" && !busy && !generating ? (
          <button onClick={() => void handleRerecord()} style={{ padding: "0.6rem 1rem" }}>
            ↻ Re-record (clean)
          </button>
        ) : null}

        <button
          onClick={() => void handleGenerate()}
          disabled={generateDisabled}
          style={{
            padding: "0.6rem 1.1rem",
            cursor: generateDisabled ? "not-allowed" : "pointer",
            background: generateDisabled ? "#eee" : "#2a6df4",
            color: generateDisabled ? "#666" : "white",
            border: "none",
            borderRadius: 4,
            fontWeight: 500,
          }}
          title={
            !hasUntranscribed
              ? "Nothing new to transcribe"
              : generating
                ? "Already generating"
                : "Run STT and AI fill on the audio"
          }
        >
          {generating ? "Generating…" : "✨ Generate"}
        </button>

        <div style={{ marginLeft: "auto", color: "#666", fontSize: "0.9rem" }}>
          {recState === "recording" ? (
            <span style={{ color: "crimson" }}>● Recording {formatSeconds(duration)}</span>
          ) : busy ? (
            <span>Working…</span>
          ) : generating ? (
            <span>Transcribing + AI fill in flight…</span>
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

      {(error || uploadError || generateError) && (
        <div
          style={{
            marginTop: "0.5rem",
            color: "crimson",
            fontSize: "0.85rem",
          }}
        >
          {error || uploadError || generateError}
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
              {s.transcript_chunk ? (
                <span style={{ marginLeft: "0.5rem", color: "#3a8" }}>
                  · transcribed ({s.transcript_chunk.length} chars)
                </span>
              ) : null}
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
